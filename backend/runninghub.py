"""Fixed-workflow RunningHub transport. See docs/RUNNINGHUB_INTEGRATION.md."""

import hashlib
import io
import json
import time
from pathlib import Path
from threading import Event
from typing import Any
from urllib.parse import urlparse

import httpx
from PIL import Image, ImageOps

from backend.providers import GenerationRequest
from backend.schemas import AppError
from backend.storage import MAX_BYTES, decode_image

API_ORIGIN = "https://www.runninghub.cn"
API_ORIGINS = {API_ORIGIN, "https://www.runninghub.ai"}
OUTPUT_HOST = "rh-images.xiaoyaoyou.com"
WORKFLOW_PATH = Path(__file__).resolve().parent.parent / "workflows" / "z-image-inpaint-api.json"
# Semantic JSON hash of the supplied export; only node 16's saved input reference is sanitized.
WORKFLOW_SHA256 = "6dd44944a664e6c6ae97e83562bc50bc66dcaa9465b45dd274da034fcb074e69"


def load_z_image_workflow() -> dict[str, Any]:
    """Fail closed if the repository graph, model stack, links or settings change."""
    try:
        graph = json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))
        digest = hashlib.sha256(
            json.dumps(graph, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        if digest != WORKFLOW_SHA256 or not isinstance(graph, dict):
            raise ValueError("workflow fingerprint")
        return graph
    except (OSError, ValueError, TypeError) as exc:
        raise AppError("PROVIDER_CONFIG", "The fixed Z-Image workflow failed validation.") from exc


def encode_masked_input(source: Image.Image, change_mask: Image.Image) -> bytes:
    """ComfyUI LoadImage returns MASK = 1 - alpha, so white CHANGE needs zero alpha."""
    if source.size != change_mask.size:
        raise AppError("MASK_SIZE_MISMATCH", "CHANGE must match the source dimensions.")
    image = source.convert("RGBA")
    image.putalpha(ImageOps.invert(change_mask.convert("L")))
    width, height = image.size
    padded = Image.new("RGBA", ((width + 7) // 8 * 8, (height + 7) // 8 * 8), (255, 255, 255, 255))
    padded.paste(image, (0, 0))
    buffer = io.BytesIO()
    padded.save(buffer, format="PNG")
    return buffer.getvalue()


class RunningHubImageEditProvider:
    def __init__(
        self,
        api_key: str,
        workflow_id: str,
        *,
        api_origin: str = API_ORIGIN,
        timeout: float = 180,
        transport: httpx.BaseTransport | None = None,
        stop: Event | None = None,
        poll_interval: float = 2,
    ):
        if not api_key or not workflow_id.isdigit() or api_origin not in API_ORIGINS:
            raise AppError(
                "PROVIDER_CONFIG", "Configure RunningHub credentials and a fixed workflow."
            )
        self._api_key = api_key
        self.workflow_id, self.api_origin = workflow_id, api_origin
        self.timeout, self.transport = timeout, transport
        self.stop, self.poll_interval = stop or Event(), poll_interval

    def _data(
        self, response: httpx.Response, *, accepted: bool = False, polling: bool = False
    ) -> Any:
        response.raise_for_status()
        body = response.json()
        code = body["code"]
        if code == 0:
            return body["data"]
        if code in {804, 813}:
            return None
        if polling and code not in {805, 1006}:
            raise AppError(
                "PROVIDER_STATE_UNKNOWN",
                "Cloud status could not be confirmed. Check its task console.",
            )
        categories = {
            421: "PROVIDER_RATE_LIMIT",
            1003: "PROVIDER_RATE_LIMIT",
            802: "PROVIDER_AUTH",
            1002: "PROVIDER_AUTH",
            801: "PROVIDER_AUTH",
            416: "PROVIDER_BALANCE",
            812: "PROVIDER_BALANCE",
            433: "MODEL_MISSING",
            803: "MODEL_MISSING",
            810: "MODEL_MISSING",
            805: "PROVIDER_FAILED",
            1006: "PROVIDER_FAILED",
        }
        category = categories.get(code, "PROVIDER_STATE_UNKNOWN" if accepted else "PROVIDER_FAILED")
        raise AppError(
            category, "RunningHub could not complete the request. Check its task console."
        )

    def generate(self, request: GenerationRequest) -> Image.Image:
        # Only the repository-owned graph is sent. No browser-provided graph or node mapping.
        graph = load_z_image_workflow()
        width, height = request.source.size
        padded_size = ((width + 7) // 8 * 8, (height + 7) // 8 * 8)
        input_bytes = encode_masked_input(request.source, request.change_mask)
        submitted = False
        accepted = False
        deadline = time.monotonic() + self.timeout
        try:
            with httpx.Client(
                base_url=self.api_origin,
                headers={"Authorization": f"Bearer {self._api_key}"},
                timeout=10,
                follow_redirects=False,
                trust_env=False,
                transport=self.transport,
            ) as client:
                upload = self._data(
                    client.post(
                        "/task/openapi/upload",
                        data={"apiKey": self._api_key, "fileType": "input"},
                        files={"file": ("vowedit-input.png", input_bytes, "image/png")},
                    )
                )
                filename = upload["fileName"]
                if not isinstance(filename, str) or not filename.startswith("api/"):
                    raise ValueError("upload reference")
                overrides = [
                    ("16", "image", filename),
                    ("8", "text", request.instruction),
                    ("4", "seed", request.seed),
                ]
                for node, field, value in overrides:
                    graph[node]["inputs"][field] = value
                submitted = True
                data = self._data(
                    client.post(
                        "/task/openapi/create",
                        json={
                            "apiKey": self._api_key,
                            "workflowId": self.workflow_id,
                            "workflow": json.dumps(graph),
                            "addMetadata": False,
                            "nodeInfoList": [
                                {
                                    "nodeId": node,
                                    "fieldName": field,
                                    "fieldValue": str(value),
                                }
                                for node, field, value in overrides
                            ],
                        },
                    ),
                    accepted=True,
                )
                task_id = str(data["taskId"])
                if not task_id.isdigit():
                    raise ValueError("task identifier")
                accepted = True
                if request.on_submitted:
                    request.on_submitted(task_id)
                # Outputs is both the polling and result endpoint: 804/813 mean keep waiting.
                while time.monotonic() < deadline and not self.stop.is_set():
                    outputs = self._data(
                        client.post(
                            "/task/openapi/outputs",
                            json={"apiKey": self._api_key, "taskId": task_id},
                        ),
                        accepted=True,
                        polling=True,
                    )
                    if outputs is not None:
                        if not isinstance(outputs, list):
                            raise ValueError("output shape")
                        output = next(
                            (
                                item
                                for item in outputs
                                if isinstance(item, dict)
                                and str(item.get("nodeId")) == "11"
                                and item.get("fileType") in {"png", "jpg", "jpeg"}
                            ),
                            None,
                        )
                        if output is None:
                            raise AppError(
                                "CANDIDATE_MISSING", "RunningHub returned no candidate image."
                            )
                        result = self._download(output["fileUrl"])
                        if result.size != padded_size:
                            raise AppError(
                                "PROVIDER_RESPONSE_INVALID", "Output dimensions changed."
                            )
                        return result.crop((0, 0, width, height))
                    self.stop.wait(self.poll_interval)
                raise AppError(
                    "PROVIDER_STATE_UNKNOWN",
                    "The cloud task may still be running. Check RunningHub before retrying.",
                )
        except AppError:
            raise
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            code = (
                "PROVIDER_STATE_UNKNOWN"
                if accepted
                else "PROVIDER_RATE_LIMIT"
                if status == 429
                else (
                    "PROVIDER_AUTH"
                    if status in {401, 403}
                    else "PROVIDER_STATE_UNKNOWN"
                    if submitted
                    else "PROVIDER_FAILED"
                )
            )
            raise AppError(code, "Cloud request failed. No automatic generation retry.") from exc
        except (
            httpx.HTTPError,
            ValueError,
            KeyError,
            TypeError,
            AttributeError,
            StopIteration,
        ) as exc:
            code = "PROVIDER_STATE_UNKNOWN" if submitted else "PROVIDER_UNAVAILABLE"
            raise AppError(
                code, "Cloud response unavailable or invalid. Check its task console."
            ) from exc

    def _download(self, url: str) -> Image.Image:
        parsed = urlparse(url)
        if (
            parsed.scheme != "https"
            or parsed.hostname != OUTPUT_HOST
            or parsed.port not in {None, 443}
            or parsed.username
            or parsed.password
            or parsed.fragment
        ):
            raise AppError(
                "PROVIDER_RESPONSE_INVALID", "Output URL is outside the approved image host."
            )
        # Separate client: never send the API key to the image host. No redirects or proxy env.
        with httpx.Client(
            timeout=10, follow_redirects=False, trust_env=False, transport=self.transport
        ) as client:
            with client.stream("GET", url) as response:
                response.raise_for_status()
                data = bytearray()
                for chunk in response.iter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_BYTES:
                        raise AppError(
                            "PROVIDER_RESPONSE_INVALID", "Provider output exceeds 10 MB."
                        )
        return decode_image(bytes(data))
