import io
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from threading import Event
from typing import Protocol
from urllib.parse import urlparse
from uuid import uuid4

import httpx
import numpy as np
from PIL import Image, ImageOps

from backend.schemas import AppError
from backend.storage import MAX_BYTES, decode_image


@dataclass
class GenerationRequest:
    source: Image.Image
    change_mask: Image.Image
    instruction: str
    index: int
    seed: int
    on_submitted: Callable[[str], None] | None = None


class ImageEditProvider(Protocol):
    def generate(self, request: GenerationRequest) -> Image.Image: ...


class MockImageEditProvider:
    """Pixel simulation; deliberately ignores prompt semantics. Never model inference."""

    def generate(self, request: GenerationRequest) -> Image.Image:
        pixels = np.asarray(request.source.convert("RGB")).copy()
        editable = np.asarray(request.change_mask) >= 128
        # A has drift, B preserves exactly, C barely edits and has severe drift.
        if request.index == 2:
            pixels[editable] = np.clip(pixels[editable].astype(int) + 1, 0, 255)
        else:
            pixels[editable] = 255 - pixels[editable]
        if request.index != 1:
            shift = 38 if request.index == 0 else 110
            pixels[~editable] = np.clip(pixels[~editable].astype(int) - shift, 0, 255)
        return Image.fromarray(pixels)


class LocalComfyUIImageEditProvider:
    def __init__(
        self,
        base_url: str,
        checkpoint: str,
        timeout: float = 180,
        transport: httpx.BaseTransport | None = None,
        stop: Event | None = None,
    ):
        parsed = urlparse(base_url)
        if (
            parsed.scheme != "http"
            or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in {"", "/"}
        ):
            raise AppError("PROVIDER_CONFIG", "Configure a loopback ComfyUI HTTP address.")
        if not checkpoint:
            raise AppError("MODEL_MISSING", "Configure a compatible ComfyUI checkpoint.")
        self.base_url, self.checkpoint, self.timeout = base_url.rstrip("/"), checkpoint, timeout
        self.transport, self.stop = transport, stop or Event()

    def generate(self, request: GenerationRequest) -> Image.Image:
        deadline = time.monotonic() + self.timeout
        template = Path(__file__).resolve().parent.parent / "workflows" / "inpaint-api.json"
        graph = json.loads(template.read_text(encoding="utf-8"))
        source = request.source.convert("RGBA")
        source.putalpha(ImageOps.invert(request.change_mask.convert("L")))
        # Core latent inpainting crops to multiples of 8. Pad input, crop output back.
        width, height = source.size
        padded_size = ((width + 7) // 8 * 8, (height + 7) // 8 * 8)
        padded = Image.new("RGBA", padded_size, (255, 255, 255, 255))
        padded.paste(source, (0, 0))
        buffer = io.BytesIO()
        padded.save(buffer, format="PNG")
        submitted = False
        accepted = False
        try:
            with httpx.Client(
                base_url=self.base_url,
                timeout=10,
                transport=self.transport,
                trust_env=False,
                follow_redirects=False,
            ) as client:
                upload = client.post(
                    "/upload/image",
                    files={"image": (f"vowedit-{uuid4()}.png", buffer.getvalue(), "image/png")},
                    data={"type": "input", "overwrite": "false"},
                )
                upload.raise_for_status()
                uploaded = upload.json()
                name = uploaded["name"]
                subfolder = uploaded.get("subfolder", "")
                if not isinstance(name, str) or not isinstance(subfolder, str):
                    raise ValueError("invalid upload")
                graph["1"]["inputs"]["image"] = f"{subfolder}/{name}" if subfolder else name
                graph["2"]["inputs"]["ckpt_name"] = self.checkpoint
                graph["3"]["inputs"]["text"] = request.instruction
                graph["6"]["inputs"]["seed"] = request.seed
                submitted = True
                response = client.post("/prompt", json={"prompt": graph, "client_id": str(uuid4())})
                if response.status_code == 400:
                    raise AppError("MODEL_MISSING", "ComfyUI rejected the workflow or model.")
                response.raise_for_status()
                prompt_id = response.json()["prompt_id"]
                if not isinstance(prompt_id, str) or not prompt_id.replace("-", "").isalnum():
                    raise ValueError("invalid job")
                accepted = True
                if request.on_submitted:
                    request.on_submitted(prompt_id)
                while time.monotonic() < deadline and not self.stop.is_set():
                    history = client.get(f"/history/{prompt_id}")
                    history.raise_for_status()
                    entry = history.json().get(prompt_id)
                    if entry:
                        if entry.get("status", {}).get("status_str") == "error":
                            raise AppError(
                                "PROVIDER_FAILED", "ComfyUI could not execute this edit."
                            )
                        images = entry.get("outputs", {}).get("8", {}).get("images", [])
                        if images:
                            output = images[0]
                            params = {key: output[key] for key in ("filename", "subfolder", "type")}
                            with client.stream("GET", "/view", params=params) as stream:
                                stream.raise_for_status()
                                chunks = bytearray()
                                for chunk in stream.iter_bytes():
                                    chunks.extend(chunk)
                                    if len(chunks) > MAX_BYTES:
                                        raise ValueError("output too large")
                            result = decode_image(bytes(chunks))
                            if result.size != padded_size:
                                raise ValueError("output dimensions")
                            return result.crop((0, 0, width, height))
                        if entry.get("status", {}).get("completed"):
                            raise AppError(
                                "CANDIDATE_MISSING", "ComfyUI returned no candidate image."
                            )
                    self.stop.wait(0.3)
                raise AppError(
                    "PROVIDER_STATE_UNKNOWN",
                    "ComfyUI may still be running. Check its queue before a new generation.",
                )
        except AppError:
            raise
        except httpx.HTTPStatusError as exc:
            code = (
                "PROVIDER_STATE_UNKNOWN"
                if accepted
                else (
                    "PROVIDER_RATE_LIMIT"
                    if exc.response.status_code == 429
                    else "PROVIDER_STATE_UNKNOWN"
                    if submitted
                    else "PROVIDER_FAILED"
                )
            )
            raise AppError(
                code, "ComfyUI rejected the request. Inspect the local provider."
            ) from exc
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            code = "PROVIDER_STATE_UNKNOWN" if submitted else "PROVIDER_UNAVAILABLE"
            raise AppError(
                code, "Provider unavailable or response lost; no automatic retry."
            ) from exc
        except (KeyError, ValueError, TypeError, AttributeError, IndexError) as exc:
            code = "PROVIDER_STATE_UNKNOWN" if submitted else "PROVIDER_RESPONSE_INVALID"
            raise AppError(
                code, "Provider response was not usable; inspect its queue before retry."
            ) from exc
