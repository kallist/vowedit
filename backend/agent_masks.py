"""Deterministic source-pixel mask proposals; never semantic segmentation."""

from collections.abc import Callable
from typing import Any

from PIL import Image, ImageDraw

from backend.agent_schemas import AssetMask, MaskProposal, ProposeContract
from backend.evaluation import validate_masks
from backend.schemas import AppError, EditContract
from backend.services import ImageEditService


def materialize(
    service: ImageEditService,
    source_id: str,
    proposal: ProposeContract,
    authorized: Callable[[str], None],
) -> dict[str, Any]:
    source = service.assets.load(source_id)
    prepared: list[str] = []

    def raster(mask: MaskProposal) -> str:
        if isinstance(mask, AssetMask):
            identifier = str(mask.asset_id)
            authorized(identifier)
            service.repo.asset(identifier, "mask")
            return identifier
        image = Image.new("L", source.size)
        draw = ImageDraw.Draw(image)
        for rect in mask.rectangles:
            if rect.x1 > source.width or rect.y1 > source.height:
                raise AppError("INVALID_MASK", "Rectangle exceeds original dimensions.", 422)
            draw.rectangle((rect.x0, rect.y0, rect.x1 - 1, rect.y1 - 1), fill=255)
        identifier = service.assets.save(image)
        prepared.append(identifier)
        service.repo.add_asset(identifier, "mask", source.width, source.height)
        return identifier

    try:
        change = raster(proposal.change)
        keeps = [{"mask": raster(p.mask), **p.model_dump(exclude={"mask"})} for p in proposal.keep]
        validate_masks(
            source, service.assets.load(change), [service.assets.load(k["mask"]) for k in keeps]
        )
        return EditContract.model_validate(
            {
                "change": {"instruction": proposal.instruction, "mask": change},
                "keep": keeps,
                "background_threshold": proposal.background_threshold,
            }
        ).model_dump(mode="json")
    except Exception:
        # Only files created by this operation. The surrounding transaction rolls back metadata.
        for identifier in prepared:
            service.assets.path(identifier).unlink(missing_ok=True)
        raise
