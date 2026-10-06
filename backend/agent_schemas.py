"""Shared, bounded HTTP/MCP contracts. No model-callable human decisions."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, TypeAdapter, model_validator

from backend.schemas import EditContract, StrictModel


class CreateEdit(StrictModel):
    request_key: UUID
    source_asset_id: UUID | None = None


class Rect(StrictModel):
    x0: int = Field(ge=0, strict=True)
    y0: int = Field(ge=0, strict=True)
    x1: int = Field(gt=0, strict=True)
    y1: int = Field(gt=0, strict=True)

    @model_validator(mode="after")
    def ordered(self) -> "Rect":
        if self.x0 >= self.x1 or self.y0 >= self.y1:
            raise ValueError("Empty rectangle")
        return self


class AssetMask(StrictModel):
    kind: Literal["asset"]
    asset_id: UUID


class RectangleMask(StrictModel):
    kind: Literal["rectangles"]
    rectangles: list[Rect] = Field(min_length=1, max_length=32)


MaskProposal = Annotated[AssetMask | RectangleMask, Field(discriminator="kind")]


class ProtectionProposal(StrictModel):
    label: str = Field(min_length=1, max_length=60)
    type: Literal["manual_region", "face"] = "manual_region"
    threshold: float = Field(default=98, ge=0, le=100, allow_inf_nan=False)
    mask: MaskProposal


class ProposeContract(StrictModel):
    draft_id: UUID
    expected_revision: int = Field(ge=0)
    request_key: UUID
    instruction: str = Field(min_length=3, max_length=1500)
    change: MaskProposal
    keep: list[ProtectionProposal] = Field(default_factory=list, max_length=8)
    background_threshold: float | None = Field(default=98, ge=0, le=100, allow_inf_nan=False)


class GenerateAction(StrictModel):
    action: Literal["generate"]
    draft_id: UUID
    expected_revision: int = Field(ge=0)
    plan_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    provider: Literal["mock", "comfyui", "runninghub"]
    request_key: UUID


class SelectionAction(StrictModel):
    action: Literal["adopt", "continue"]
    run_id: UUID
    candidate_id: UUID
    expected_selection_revision: int = Field(ge=0)
    decision_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    request_key: UUID


class RetryAction(StrictModel):
    action: Literal["retry_generation", "retry_evaluation"]
    run_id: UUID
    expected_state_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    request_key: UUID


ActionRequest = Annotated[
    GenerateAction | SelectionAction | RetryAction, Field(discriminator="action")
]
action_adapter: TypeAdapter[ActionRequest] = TypeAdapter(ActionRequest)


class DraftPatch(StrictModel):
    instruction: str = Field(default="", max_length=1500)
    expected_revision: int = Field(ge=0)
    request_key: UUID
    source_asset_id: UUID | None = None
    contract: EditContract | None = None
    provider: Literal["mock", "comfyui", "runninghub"] = "mock"
    # Canonical masks store painted pixels; strokes are bounded recoverable UI metadata.
    strokes: list["PaintStroke"] = Field(default_factory=list, max_length=256)


class PaintPoint(StrictModel):
    x: float = Field(ge=0, le=1536, allow_inf_nan=False)
    y: float = Field(ge=0, le=1536, allow_inf_nan=False)


class PaintStroke(StrictModel):
    mode: Literal["change", "keep"]
    erase: bool
    size: float = Field(gt=0, le=1536, allow_inf_nan=False)
    points: list[PaintPoint] = Field(min_length=1, max_length=1000)


class Decision(StrictModel):
    decision_key: UUID
    accept: bool
    confirmations: list[
        Literal["review_pending", "semantic_fail", "pixel_ineligible", "evaluation_missing"]
    ] = Field(default_factory=list, max_length=4)


class Grant(StrictModel):
    client_id: UUID
    kind: Literal["draft", "run", "asset"]
    id: UUID


class Presented(StrictModel):
    expected_revision: int = Field(ge=0)


class DraftLocator(StrictModel):
    kind: Literal["draft"]
    id: UUID
    after_cursor: int = Field(default=0, ge=0)
    limit: int = Field(default=50, ge=1, le=100)


class RunLocator(DraftLocator):
    kind: Literal["run"]  # type: ignore[assignment]


ActivityLocator = Annotated[DraftLocator | RunLocator, Field(discriminator="kind")]


class OpenUI(StrictModel):
    kind: Literal["draft", "run"]
    id: UUID


class DraftID(StrictModel):
    draft_id: UUID


class RunID(StrictModel):
    run_id: UUID
