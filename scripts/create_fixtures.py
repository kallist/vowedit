"""Original project-owned geometric artwork. No private images or model inference."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "public" / "fixtures"
TARGET.mkdir(parents=True, exist_ok=True)


def illustration() -> Image.Image:
    image = Image.new("RGB", (640, 704), "#e1dfd1")
    d = ImageDraw.Draw(image)
    d.rectangle((32, 32, 608, 672), outline="#c7c7b7", width=1)
    d.ellipse((80, 96, 550, 566), fill="#d1d1bf")
    d.ellipse((144, 626, 526, 668), fill="#c6c6b7")
    d.polygon(
        [(242, 452), (216, 669), (312, 669), (332, 521), (357, 669), (450, 669), (412, 444)],
        fill="#454843",
    )
    d.polygon(
        [
            (234, 290),
            (178, 328),
            (137, 490),
            (198, 511),
            (232, 431),
            (221, 538),
            (424, 538),
            (412, 421),
            (447, 508),
            (504, 486),
            (462, 328),
            (399, 291),
        ],
        fill="#b96144",
        outline="#513f36",
        width=3,
    )
    d.polygon([(273, 278), (282, 339), (322, 364), (363, 338), (372, 275)], fill="#e0ae88")
    d.polygon([(270, 293), (252, 316), (296, 400), (322, 364)], fill="#d38465")
    d.polygon([(372, 293), (391, 316), (349, 400), (322, 364)], fill="#9e4935")
    d.line((322, 364, 322, 537), fill="#533b32", width=3)
    for y in [409, 451, 492]:
        d.ellipse((328, y, 334, y + 6), fill="#42392f")
    d.ellipse((228, 107, 409, 303), fill="#333e39")
    d.rounded_rectangle((251, 156, 387, 295), radius=52, fill="#ebbb92")
    d.polygon(
        [
            (236, 202),
            (247, 134),
            (318, 111),
            (388, 151),
            (398, 215),
            (366, 200),
            (350, 159),
            (293, 194),
            (259, 177),
            (252, 217),
        ],
        fill="#35403a",
    )
    d.line((270, 214, 291, 214), fill="#373a30", width=4)
    d.line((343, 214, 364, 214), fill="#373a30", width=4)
    d.line((318, 220, 311, 244, 324, 244), fill="#b27d5d", width=3)
    d.arc((302, 245, 341, 267), 10, 166, fill="#68463a", width=3)
    d.line((181, 384, 170, 466), fill="#e6b094", width=2)
    d.line((453, 372, 479, 475), fill="#e6b094", width=2)
    return image


original = illustration()
original.save(TARGET / "original.png")
change = Image.new("L", original.size)
ImageDraw.Draw(change).rectangle((236, 368, 406, 524), fill=255)
keep = Image.new("L", original.size)
ImageDraw.Draw(keep).rectangle((223, 101, 412, 296), fill=255)
change.save(TARGET / "change.png")
keep.save(TARGET / "keep.png")

# The fixture PNG is embedded by a minimal SVG wrapper for the static hero.
# SVG stays code-native; no generated-image tool or external media is involved.
import base64  # noqa: E402

encoded = base64.b64encode((TARGET / "original.png").read_bytes()).decode()
(TARGET / "illustration.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 704">'
    f'<image width="640" height="704" href="data:image/png;base64,{encoded}"/></svg>',
    encoding="utf-8",
)

product = Image.new("RGB", (640, 704), "#dbd6c8")
d = ImageDraw.Draw(product)
d.ellipse((138, 604, 504, 654), fill="#c2bcae")
d.rounded_rectangle((206, 194, 435, 614), radius=35, fill="#aa563c", outline="#633c2d", width=3)
d.rectangle((258, 125, 385, 202), fill="#3e413b")
d.rectangle((226, 330, 416, 483), fill="#efeadc")
d.text((290, 375), "VOW", fill="#2b302b", stroke_width=1)
product.save(TARGET / "product.png")
product_keep = Image.new("L", product.size)
ImageDraw.Draw(product_keep).rectangle((196, 115, 445, 624), fill=255)
product_keep.save(TARGET / "product-keep.png")
from PIL import ImageOps  # noqa: E402

ImageOps.invert(product_keep).save(TARGET / "product-change.png")
portrait = original.crop((173, 70, 467, 364)).resize((640, 640))
portrait.save(TARGET / "portrait.png")
portrait_change = Image.new("L", portrait.size)
ImageDraw.Draw(portrait_change).rectangle((160, 272, 460, 346), fill=255)
portrait_keep = Image.new("L", portrait.size)
portrait_draw = ImageDraw.Draw(portrait_keep)
portrait_draw.rectangle((100, 70, 530, 256), fill=255)
portrait_draw.rectangle((170, 368, 475, 496), fill=255)
portrait_change.save(TARGET / "portrait-change.png")
portrait_keep.save(TARGET / "portrait-keep.png")

from backend.providers import GenerationRequest, MockImageEditProvider  # noqa: E402

for i, name in enumerate(["candidate_drift", "candidate_good", "candidate_bad"]):
    MockImageEditProvider().generate(
        GenerationRequest(original, change, "fixture", i, 4100 + i)
    ).save(TARGET / f"{name}.png")
print("Created deterministic, project-owned fixtures.")
