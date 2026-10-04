import io
import json
from email.parser import BytesParser
from email.policy import default

import httpx
import pytest
from PIL import Image

from backend.providers import GenerationRequest
from backend.runninghub import (
    RunningHubImageEditProvider,
    encode_masked_input,
    load_z_image_workflow,
)
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
        assert request.url.host == "www.runninghub.cn"
        if request.url.path.endswith("upload"):
            assert b"fileType" in request.content and b"image/png" in request.content
            parts = BytesParser(policy=default).parsebytes(
                f"Content-Type: {request.headers['content-type']}\r\n\r\n".encode()
                + request.content
            )
            uploaded = next(p for p in parts.iter_parts() if p.get_filename())
            with Image.open(io.BytesIO(uploaded.get_payload(decode=True))) as rgba:
                assert rgba.mode == "RGBA"
                assert rgba.getpixel((24, 24)) == (150, 120, 90, 0)
                assert rgba.getpixel((0, 0)) == (150, 120, 90, 255)
            return httpx.Response(200, json={"code": 0, "data": {"fileName": "api/test.png"}})
        data = json.loads(request.content)
        assert data["apiKey"] == TEST_KEY
        if request.url.path.endswith("create"):
            graph = json.loads(data["workflow"])
            assert graph["16"]["inputs"]["image"] == "api/test.png"
            assert graph["8"]["inputs"]["text"] == "edit jacket"
            assert graph["4"]["inputs"]["seed"] == 123
            baseline = load_z_image_workflow()
            for node, field in [("16", "image"), ("8", "text"), ("4", "seed")]:
                graph[node]["inputs"][field] = baseline[node]["inputs"][field]
            assert graph == baseline  # Every other model, setting, link and output stays fixed.
            assert data["addMetadata"] is False
            assert data["nodeInfoList"] == [
                {"nodeId": "16", "fieldName": "image", "fieldValue": "api/test.png"},
                {"nodeId": "8", "fieldName": "text", "fieldValue": "edit jacket"},
                {"nodeId": "4", "fieldName": "seed", "fieldValue": "123"},
            ]
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
                        "nodeId": "17",
                        "fileType": "png",
                        "fileUrl": "https://evil.example/original.png",
                    },
                    {
                        "nodeId": "11",
                        "fileType": "png",
                        "fileUrl": "https://rh-images.xiaoyaoyou.com/output/test.png",
                    },
                ],
            },
        )

    provider = RunningHubImageEditProvider(
        TEST_KEY, "123", transport=httpx.MockTransport(handler), poll_interval=0
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
        "https://rh-images.xiaoyaoyou.com:444/x",
        "https://rh-images.xiaoyaoyou.com/x#fragment",
    ],
)
def test_cloud_output_url_rejected_before_network(url):
    def handler(request):
        pytest.fail("Untrusted URL must never be requested")

    provider = RunningHubImageEditProvider(TEST_KEY, "123", transport=httpx.MockTransport(handler))
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

    provider = RunningHubImageEditProvider(TEST_KEY, "123", transport=httpx.MockTransport(handler))
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

    provider = RunningHubImageEditProvider(TEST_KEY, "123", transport=httpx.MockTransport(handler))
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

    provider = RunningHubImageEditProvider(TEST_KEY, "123", transport=httpx.MockTransport(handler))
    with pytest.raises(AppError, match="PROVIDER_STATE_UNKNOWN"):
        provider.generate(GenerationRequest(images[0], images[1], "edit", 0, 1))


def test_alpha_polarity_rgb_and_opaque_padding():
    source = Image.new("RGB", (65, 67), (17, 29, 41))
    change = Image.new("L", source.size, 0)
    for x, value in enumerate([0, 64, 128, 255]):
        change.putpixel((x, 0), value)
    with Image.open(io.BytesIO(encode_masked_input(source, change))) as image:
        assert image.size == (72, 72)
        for x, value in enumerate([0, 64, 128, 255]):
            assert image.getpixel((x, 0)) == (17, 29, 41, 255 - value)
            assert 255 - image.getchannel("A").getpixel((x, 0)) == value
        assert image.getpixel((71, 71)) == (255, 255, 255, 255)
    assert source.mode == "RGB" and change.getpixel((3, 0)) == 255


def test_mask_size_rejected(images):
    with pytest.raises(AppError, match="MASK_SIZE_MISMATCH"):
        encode_masked_input(images[0], Image.new("L", (32, 32)))


def test_real_fixed_graph_mapping():
    graph = load_z_image_workflow()
    assert graph["1"]["inputs"]["unet_name"] == "z_image_turbo_bf16.safetensors"
    assert graph["2"]["inputs"]["clip_name"] == "qwen_3_4b.safetensors"
    assert graph["3"]["inputs"]["vae_name"] == "ae.safetensors"
    assert graph["7"]["inputs"]["pixels"] == ["16", 0]
    assert graph["13"]["inputs"]["mask"] == ["16", 1]
    assert graph["7"]["inputs"]["mask"] == ["13", 0]
    assert graph["11"]["inputs"]["images"] == ["10", 0]
    assert graph["17"]["inputs"]["images"] == ["16", 0]


@pytest.mark.parametrize(
    "node,field,value",
    [
        ("1", "unet_name", "another-model"),
        ("4", "denoise", 0.5),
        ("13", "mask", ["16", 0]),
        ("11", "images", ["16", 0]),
    ],
)
def test_graph_tampering_rejected_before_network(tmp_path, monkeypatch, images, node, field, value):
    graph = load_z_image_workflow()
    graph[node]["inputs"][field] = value
    path = tmp_path / "workflow.json"
    path.write_text(json.dumps(graph))
    monkeypatch.setattr("backend.runninghub.WORKFLOW_PATH", path)
    provider = RunningHubImageEditProvider(
        TEST_KEY,
        "123",
        transport=httpx.MockTransport(
            lambda request: pytest.fail("Invalid graph must not reach upload or paid submit")
        ),
    )
    with pytest.raises(AppError, match="PROVIDER_CONFIG"):
        provider.generate(GenerationRequest(images[0], images[1], "edit", 0, 1))


@pytest.mark.parametrize(
    "origin",
    [
        "http://www.runninghub.cn",
        "https://evil.example",
        "https://www.runninghub.cn.evil.example",
        "https://key@www.runninghub.cn",
        "https://www.runninghub.cn/path",
        "https://www.runninghub.cn?query=1",
        "https://www.runninghub.cn:444",
    ],
)
def test_api_origin_rejected(origin):
    with pytest.raises(AppError, match="PROVIDER_CONFIG"):
        RunningHubImageEditProvider(TEST_KEY, "123", api_origin=origin)


@pytest.mark.parametrize(
    "outputs,expected",
    [
        (
            [{"nodeId": "17", "fileType": "png", "fileUrl": "https://evil.example/x"}],
            "CANDIDATE_MISSING",
        ),
        ({"nodeId": "11"}, "PROVIDER_STATE_UNKNOWN"),
        ([None, "bad", {"nodeId": "11", "fileType": "mp4"}], "CANDIDATE_MISSING"),
        ([{"nodeId": "11", "fileType": "png"}], "PROVIDER_STATE_UNKNOWN"),
    ],
)
def test_preview_only_or_malformed_outputs_never_download(images, outputs, expected):
    def handler(request):
        assert request.method == "POST"
        if request.url.path.endswith("upload"):
            return httpx.Response(200, json={"code": 0, "data": {"fileName": "api/test.png"}})
        if request.url.path.endswith("create"):
            return httpx.Response(200, json={"code": 0, "data": {"taskId": "987"}})
        return httpx.Response(200, json={"code": 0, "data": outputs})

    provider = RunningHubImageEditProvider(TEST_KEY, "123", transport=httpx.MockTransport(handler))
    with pytest.raises(AppError, match=expected):
        provider.generate(GenerationRequest(images[0], images[1], "edit", 0, 1))


def test_download_does_not_follow_redirect():
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(302, headers={"location": "https://evil.example/x"})

    provider = RunningHubImageEditProvider(TEST_KEY, "123", transport=httpx.MockTransport(handler))
    with pytest.raises(httpx.HTTPStatusError):
        provider._download("https://rh-images.xiaoyaoyou.com/x")
    assert len(calls) == 1


def test_download_size_bound_before_decode(monkeypatch):
    monkeypatch.setattr("backend.runninghub.MAX_BYTES", 64)
    provider = RunningHubImageEditProvider(
        TEST_KEY,
        "123",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, content=b"x" * 65)),
    )
    with pytest.raises(AppError, match="PROVIDER_RESPONSE_INVALID"):
        provider._download("https://rh-images.xiaoyaoyou.com/x")


def test_download_rejects_non_image():
    provider = RunningHubImageEditProvider(
        TEST_KEY,
        "123",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, content=b"not an image")),
    )
    with pytest.raises(AppError, match="INVALID_IMAGE"):
        provider._download("https://rh-images.xiaoyaoyou.com/x")


def test_changed_output_dimensions_rejected(images):
    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, content=png(Image.new("RGB", (32, 32))))
        if request.url.path.endswith("upload"):
            return httpx.Response(200, json={"code": 0, "data": {"fileName": "api/test.png"}})
        if request.url.path.endswith("create"):
            return httpx.Response(200, json={"code": 0, "data": {"taskId": "987"}})
        return httpx.Response(
            200,
            json={
                "code": 0,
                "data": [
                    {
                        "nodeId": "11",
                        "fileType": "png",
                        "fileUrl": "https://rh-images.xiaoyaoyou.com/x",
                    }
                ],
            },
        )

    provider = RunningHubImageEditProvider(TEST_KEY, "123", transport=httpx.MockTransport(handler))
    with pytest.raises(AppError, match="PROVIDER_RESPONSE_INVALID"):
        provider.generate(GenerationRequest(images[0], images[1], "edit", 0, 1))


def test_server_config_registers_fixed_model_without_checkpoint(tmp_path, monkeypatch):
    from backend.api import create_app

    monkeypatch.setenv("VOWEDIT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("RUNNINGHUB_API_KEY", TEST_KEY)
    monkeypatch.setenv("RUNNINGHUB_WORKFLOW_ID", "123")
    monkeypatch.setenv("RUNNINGHUB_API_ORIGIN", "https://www.runninghub.cn")
    monkeypatch.delenv("RUNNINGHUB_CHECKPOINT", raising=False)
    app = create_app()
    assert app.state.service.providers["runninghub"].api_origin == "https://www.runninghub.cn"
    # Product configuration exposes names only; no origin, model graph or credential.
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        config = client.get("/api/config")
        assert TEST_KEY not in config.text and "runninghub.cn" not in config.text
        assert "runninghub" in config.json()["providers"]
