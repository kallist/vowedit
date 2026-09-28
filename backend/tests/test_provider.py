import json

import httpx
import pytest

from backend.providers import GenerationRequest, LocalComfyUIImageEditProvider
from backend.schemas import AppError
from backend.tests.conftest import png


def test_comfy_fixed_graph_http_contract(images):
    sent = []

    def handler(request):
        sent.append(request.url.path)
        if request.url.path == "/upload/image":
            assert b"image/png" in request.content
            return httpx.Response(200, json={"name": "image.png", "subfolder": "input"})
        if request.url.path == "/prompt":
            graph = json.loads(request.content)["prompt"]
            assert graph["1"]["inputs"]["image"] == "input/image.png"
            assert graph["3"]["inputs"]["text"] == "change jacket"
            assert graph["6"]["inputs"]["seed"] == 123
            assert graph["5"]["inputs"]["grow_mask_by"] == 0
            return httpx.Response(200, json={"prompt_id": "test-job"})
        if request.url.path == "/history/test-job":
            return httpx.Response(
                200,
                json={
                    "test-job": {
                        "outputs": {
                            "8": {
                                "images": [
                                    {"filename": "out.png", "subfolder": "", "type": "output"}
                                ]
                            }
                        }
                    }
                },
            )
        return httpx.Response(200, content=png(images[0]))

    provider = LocalComfyUIImageEditProvider(
        "http://127.0.0.1:8188", "test.safetensors", transport=httpx.MockTransport(handler)
    )
    result = provider.generate(GenerationRequest(images[0], images[1], "change jacket", 0, 123))
    assert result.tobytes() == images[0].tobytes()
    assert sent == ["/upload/image", "/prompt", "/history/test-job", "/view"]


@pytest.mark.parametrize(
    "scenario,code",
    [
        ("offline", "PROVIDER_UNAVAILABLE"),
        ("model", "MODEL_MISSING"),
        ("malformed", "PROVIDER_STATE_UNKNOWN"),
        ("timeout", "PROVIDER_STATE_UNKNOWN"),
        ("rate", "PROVIDER_RATE_LIMIT"),
    ],
)
def test_comfy_error_translation(images, scenario, code):
    def handler(request):
        if scenario == "offline":
            raise httpx.ConnectError("private URL with secret", request=request)
        if request.url.path == "/upload/image":
            return httpx.Response(200, json={"name": "in.png"})
        if scenario == "model":
            return httpx.Response(400, json={"error": "private model path"})
        if scenario == "rate":
            return httpx.Response(429)
        if scenario == "timeout":
            raise httpx.ReadTimeout("private secret", request=request)
        return httpx.Response(200, json={"oops": "secret"})

    provider = LocalComfyUIImageEditProvider(
        "http://127.0.0.1:8188", "test.safetensors", transport=httpx.MockTransport(handler)
    )
    with pytest.raises(AppError) as caught:
        provider.generate(GenerationRequest(images[0], images[1], "edit", 0, 123))
    assert caught.value.code == code
    assert "private" not in caught.value.message
    assert "secret" not in caught.value.message


@pytest.mark.parametrize(
    "url",
    [
        "https://external.example",
        "http://127.0.0.1:8188/?secret=x",
        "http://user:key@localhost:8188",
        "file:///tmp",
    ],
)
def test_comfy_config_loopback_only(url):
    with pytest.raises(AppError, match="PROVIDER_CONFIG"):
        LocalComfyUIImageEditProvider(url, "model")
