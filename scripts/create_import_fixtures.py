"""Offline upload fixtures only, never presented as external model outputs."""

from pathlib import Path

from PIL import Image

root = Path("public/fixtures")
destination = root / "imported"
destination.mkdir(exist_ok=True)
with Image.open(root / "original.png") as source, Image.open(root / "change.png") as mask:
    for letter, color in zip("abc", [(28, 44, 76), (23, 46, 87), (23, 34, 55)], strict=True):
        candidate = source.convert("RGB")
        candidate.paste(color, mask=mask.convert("L"))
        candidate.save(destination / f"candidate-{letter}.png")
Image.new("RGB", (64, 64), "navy").save(destination / "mismatch.png")
