import json

import httpx
import pytest

from backend.providers import GenerationRequest
from backend.runninghub import RunningHubImageEditProvider
from backend.schemas import AppError
from backend.tests.conftest import png

TEST_KEY = "test-only-not-a-real-credential"


def test_cloud_contract_and_key_never_reaches_image_host(images):
    calls, recorded = [], []
    polls = 0

    def handler(request):
        nonlocal polls
        calls.append(request.url.path)
        if request.url.host == "rh-images.xiaoyaoyou.com":
            assert "authorization" not in request.headers
            assert TEST_KEY not in str(request.url)
            return httpx.Response(200, content=png(images[0]))
        assert request.headers["authorization"] == f"Bearer {TEST_KEY}"
        if request.url.path.endswith("upload"):
            assert b"fileType" in request.content and b"image/png" in request.content
            return httpx.Response(200, json={"code": 0, "data": {"fileName": "api/test.png"}})
        data = json.loads(request.content)
        assert data["apiKey"] == TEST_KEY
        if request.url.path.endswith("create"):
            graph = json.loads(data["workflow"])
            assert graph["1"]["inputs"]["image"] == "api/test.png"
            assert graph["5"]["class_type"] == "VAEEncodeForInpaint"
            assert graph["3"]["inputs"]["text"] == "edit jacket"
            assert data["addMetadata"] is False
            assert data["nodeInfoList"][0]["fieldValue"] == "123"
            return httpx.Response(200, json={"code": 0, "data": {"taskId": "987"}})
        polls += 1
        assert data["taskId"] == "987"
        if polls == 1:
            return httpx.Response(200, json={"code": 813, "data": None})
        return httpx.Response(
            200,
            json={
                "code": 0,
                "data": [
                    {
                        "nodeId": "8",
                        "fileType": "png",
                        "fileUrl": "https://rh-images.xiaoyaoyou.com/output/test.png",
                    }
                ],
            },
        )

    provider = RunningHubImageEditProvider(
        TEST_KEY, "123", "test.safetensors", transport=httpx.MockTransport(handler), poll_interval=0
    )
    result = provider.generate(
        GenerationRequest(images[0], images[1], "edit jacket", 0, 123, recorded.append)
    )
    assert result.tobytes() == images[0].tobytes()
    assert calls.count("/task/openapi/create") == 1
    assert recorded == ["987"]


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/secrets",
        "https://evil.example/image.png",
        "https://rh-images.xiaoyaoyou.com.evil.example/x",
        "https://key@rh-images.xiaoyaoyou.com/x",
    ],
)
def test_cloud_output_url_rejected_before_network(url):
    def handler(request):
        pytest.fail("Untrusted URL must never be requested")

    provider = RunningHubImageEditProvider(
        TEST_KEY, "123", "model", transport=httpx.MockTransport(handler)
    )
    with pytest.raises(AppError, match="PROVIDER_RESPONSE_INVALID"):
        provider._download(url)


@pytest.mark.parametrize(
    "code,expected",
    [
        (802, "PROVIDER_AUTH"),
        (421, "PROVIDER_RATE_LIMIT"),
        (416, "PROVIDER_BALANCE"),
        (433, "MODEL_MISSING"),
    ],
)
def test_cloud_errors_are_sanitized(images, code, expected):
    def handler(request):
        return httpx.Response(200, json={"code": code, "msg": f"private {TEST_KEY}"})

    provider = RunningHubImageEditProvider(
        TEST_KEY, "123", "model", transport=httpx.MockTransport(handler)
    )
    with pytest.raises(AppError) as error:
        provider.generate(GenerationRequest(images[0], images[1], "edit", 0, 1))
    assert error.value.code == expected
    assert TEST_KEY not in error.value.message


def test_cloud_ambiguous_submit_is_not_retried(images):
    creates = 0

    def handler(request):
        nonlocal creates
        if request.url.path.endswith("upload"):
            return httpx.Response(200, json={"code": 0, "data": {"fileName": "api/test.png"}})
        creates += 1
        raise httpx.ReadTimeout("response lost", request=request)

    provider = RunningHubImageEditProvider(
        TEST_KEY, "123", "model", transport=httpx.MockTransport(handler)
    )
    with pytest.raises(AppError, match="PROVIDER_STATE_UNKNOWN"):
        provider.generate(GenerationRequest(images[0], images[1], "edit", 0, 1))
    assert creates == 1


@pytest.mark.parametrize("mode", ["http", "body"])
def test_poll_rate_limit_does_not_authorize_duplicate_generation(images, mode):
    def handler(request):
        if request.url.path.endswith("upload"):
            return httpx.Response(200, json={"code": 0, "data": {"fileName": "api/test.png"}})
        if request.url.path.endswith("create"):
            return httpx.Response(200, json={"code": 0, "data": {"taskId": "987"}})
        return httpx.Response(429) if mode == "http" else httpx.Response(200, json={"code": 1003})

    provider = RunningHubImageEditProvider(
        TEST_KEY, "123", "model", transport=httpx.MockTransport(handler)
    )
    with pytest.raises(AppError, match="PROVIDER_STATE_UNKNOWN"):
        provider.generate(GenerationRequest(images[0], images[1], "edit", 0, 1))
