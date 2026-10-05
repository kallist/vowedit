import io
import json
import os
import warnings
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from PIL import Image, ImageOps, UnidentifiedImageError

from backend.schemas import AppError

MAX_BYTES = 10 * 1024 * 1024
MAX_SIDE = 1536
Image.MAX_IMAGE_PIXELS = MAX_SIDE * MAX_SIDE
FORMATS = {"PNG": ({".png"}, "image/png"), "JPEG": ({".jpg", ".jpeg"}, "image/jpeg")}


def decode_image(data: bytes, *, mask: bool = False) -> Image.Image:
    if not data or len(data) > MAX_BYTES:
        raise AppError("INVALID_IMAGE", "Choose a PNG or JPEG under 10 MB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as opened:
                if opened.format not in FORMATS or getattr(opened, "n_frames", 1) != 1:
                    raise AppError("INVALID_IMAGE", "Only still PNG and JPEG images are supported.")
                w, h = opened.size
                if min(w, h) < 32 or max(w, h) > MAX_SIDE:
                    raise AppError("INVALID_IMAGE", "Each image side must be 32–1536 pixels.")
                opened.load()
                clean = ImageOps.exif_transpose(opened)
                if mask:
                    return clean.convert("L").point(lambda x: 255 if x >= 128 else 0)
                if "A" in clean.getbands() or "transparency" in clean.info:
                    rgba = clean.convert("RGBA")
                    base = Image.new("RGB", rgba.size, "white")
                    base.paste(rgba, mask=rgba.getchannel("A"))
                    return base
                return clean.convert("RGB")
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise AppError("INVALID_IMAGE", "This file could not be decoded safely.") from exc


class AssetStore:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, asset_id: str) -> Path:
        try:
            name = str(UUID(asset_id))
        except ValueError as exc:
            raise AppError("ASSET_NOT_FOUND", "Asset not found.", 404) from exc
        return self.root / f"{name}.png"

    def save(self, image: Image.Image) -> str:
        asset_id = str(uuid4())
        target = self.path(asset_id)
        temporary = target.with_suffix(".tmp")
        try:
            # Rebuild pixels only: strip EXIF, PNG text, ICC and provider metadata.
            clean = Image.frombytes(image.mode, image.size, image.tobytes())
            with temporary.open("wb") as handle:
                clean.save(handle, format="PNG")
                handle.flush()
                os.fsync(handle.fileno())
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        return asset_id

    def load(self, asset_id: str) -> Image.Image:
        try:
            with Image.open(self.path(asset_id)) as image:
                return image.copy()
        except (OSError, ValueError) as exc:
            raise AppError(
                "ASSET_NOT_FOUND", "A saved image is missing or unreadable.", 404
            ) from exc

    def save_preparation(self, asset_id: str, record: dict[str, Any]) -> None:
        """Write provenance before registering the prepared asset in SQLite."""
        target = self.path(asset_id).with_suffix(".preparation.json")
        temporary = target.with_suffix(".tmp")
        try:
            with temporary.open("w", encoding="utf-8") as handle:
                json.dump(record, handle, sort_keys=True)
                handle.flush()
                os.fsync(handle.fileno())
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)

    def preparation(self, asset_id: str) -> dict[str, Any]:
        try:
            data = json.loads(
                self.path(asset_id).with_suffix(".preparation.json").read_text(encoding="utf-8")
            )
            if not isinstance(data, dict) or data.get("prepared_candidate_asset") != asset_id:
                raise ValueError("Invalid provenance")
            return data
        except (OSError, ValueError) as exc:
            raise AppError(
                "PREPARATION_UNAVAILABLE", "Prepared asset provenance is unavailable.", 409
            ) from exc

    def upload(self, data: bytes, filename: str, mime: str, kind: str) -> tuple[str, int, int]:
        image = decode_image(data, mask=kind == "mask")
        with Image.open(io.BytesIO(data)) as raw:
            extensions, expected_mime = FORMATS[str(raw.format)]
        if Path(filename).suffix.lower() not in extensions or mime != expected_mime:
            raise AppError("INVALID_IMAGE", "File extension, MIME and image format must agree.")
        asset_id = self.save(image)
        return asset_id, image.width, image.height
