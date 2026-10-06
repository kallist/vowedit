"""Explicit imported-asset preparation; never part of generation or evaluation."""

from typing import Any

from PIL import Image

NOTICE = (
    "The external candidate was normalized to the source canvas. Only pixels permitted "
    "by the CHANGE mask were admitted into the evaluated result. Pixels outside CHANGE "
    "were preserved from the original image."
)


def boundary_lock(
    source: Image.Image, raw: Image.Image, change: Image.Image
) -> tuple[Image.Image, dict[str, Any]]:
    # Crop in continuous source coordinates, then use one isotropic Lanczos resize.
    # The original and masks are never resampled.
    width, height = raw.size
    target_width, target_height = source.size
    ratio = target_width / target_height
    crop_width = min(width, height * ratio)
    crop_height = min(height, width / ratio)
    left, top = (width - crop_width) / 2, (height - crop_height) / 2
    box = (left, top, left + crop_width, top + crop_height)
    normalized = raw.convert("RGB").resize(source.size, Image.Resampling.LANCZOS, box=box)
    binary = change.convert("L").point(lambda value: 255 if value >= 128 else 0)
    final = Image.composite(normalized, source.convert("RGB"), binary)
    return final, {
        "type": "boundary-lock-v1",
        "source_size": list(raw.size),
        "target_size": list(source.size),
        "normalization": {
            "method": "aspect-preserving-center-crop-lanczos",
            "source_aspect_ratio": width / height,
            "target_aspect_ratio": ratio,
            "crop_box": list(box),
            "resampling": "LANCZOS",
        },
        "boundary": "binary-change-only",
        "feather_pixels": 0,
    }
