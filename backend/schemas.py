from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PairingBootstrap(StrictModel):
    origin: str = Field(pattern=r"^chrome-extension://[a-p]{32}$")


class PairingExchange(PairingBootstrap):
    code: str = Field(pattern=r"^[0-9a-f]{40}$")


class Change(StrictModel):
    instruction: str = Field(min_length=3, max_length=1500)
    mask: UUID


class ProtectionRule(StrictModel):
    type: Literal["manual_region", "face"] = "manual_region"
    label: str = Field(min_length=1, max_length=60)
    mask: UUID
    threshold: float = Field(default=98, ge=0, le=100, allow_inf_nan=False)


class EditContract(StrictModel):
    change: Change
    keep: list[ProtectionRule] = Field(default_factory=list, max_length=8)
    background_threshold: float | None = Field(default=98, ge=0, le=100, allow_inf_nan=False)


class CreateRun(StrictModel):
    source_image: UUID
    contract: EditContract
    request_key: UUID
    provider: Literal["mock", "comfyui", "runninghub"] = "mock"
    candidate_count: Literal[3] = 3
    candidate_mode: Literal["legacy-seeds-v1", "strategy-v1"] = "legacy-seeds-v1"
    preview_fingerprint: str | None = Field(default=None, min_length=64, max_length=64)
    continuation_draft_id: UUID | None = None
    editing_draft_id: UUID | None = None
    expected_draft_revision: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def draft_binding(self) -> "CreateRun":
        if (self.editing_draft_id is None) != (self.expected_draft_revision is None):
            raise ValueError("Both draft fields are required")
        return self


class CreateImportedRun(StrictModel):
    source_image: UUID
    contract: EditContract
    request_key: UUID
    candidate_images: list[UUID] = Field(min_length=3, max_length=3)
    source_label: str = Field(min_length=1, max_length=80)
    continuation_draft_id: UUID | None = None
    editing_draft_id: UUID | None = None
    expected_draft_revision: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def draft_binding(self) -> "CreateImportedRun":
        if (self.editing_draft_id is None) != (self.expected_draft_revision is None):
            raise ValueError("Both draft fields are required")
        return self


class DraftPoint(StrictModel):
    x: float = Field(ge=0, le=1536, allow_inf_nan=False)
    y: float = Field(ge=0, le=1536, allow_inf_nan=False)


class DraftStroke(StrictModel):
    mode: Literal["change", "keep"]
    erase: bool
    size: float = Field(gt=0, le=180, allow_inf_nan=False)
    points: list[DraftPoint] = Field(min_length=1, max_length=10000)


class DraftMasks(StrictModel):
    change: UUID | None = None
    keep: UUID | None = None


class DraftData(StrictModel):
    schema_version: Literal[1] = 1
    strokes: list[DraftStroke] = Field(default_factory=list, max_length=1024)
    seed_masks: DraftMasks = Field(default_factory=DraftMasks)
    instruction: str = Field(default="", max_length=1500)
    keep_label: str = Field(default="Face & hair", max_length=60)
    threshold: float = Field(default=98, ge=0, le=100, allow_inf_nan=False)
    background: bool = True
    mode: Literal["generate", "import"] = "generate"
    provider: Literal["mock", "comfyui", "runninghub"] = "mock"
    raw_candidates: list[UUID | None] = Field(
        default_factory=lambda: list[UUID | None]([None] * 3), min_length=3, max_length=3
    )
    effective_candidates: list[UUID | None] = Field(
        default_factory=lambda: list[UUID | None]([None] * 3), min_length=3, max_length=3
    )
    source_label: str = Field(default="External tool", max_length=80)
    checkpoint: DraftMasks = Field(default_factory=DraftMasks)
    plan_fingerprint: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    continuation_starter_id: UUID | None = None

    @model_validator(mode="after")
    def point_budget(self) -> "DraftData":
        if sum(len(s.points) for s in self.strokes) > 10000:
            raise ValueError("Too many stroke points")
        return self


class CreateEditingDraft(StrictModel):
    source_image: UUID
    request_key: UUID
    data: DraftData = Field(default_factory=DraftData)


class UpdateEditingDraft(StrictModel):
    expected_revision: int = Field(ge=0)
    mutation_key: UUID
    data: DraftData


class PreviewPlan(StrictModel):
    instruction: str = Field(min_length=3, max_length=1500)


class Selection(StrictModel):
    candidate_id: UUID
    expected_selection_revision: int = Field(ge=0)
    confirmations: list[
        Literal["review_pending", "semantic_fail", "pixel_ineligible", "evaluation_missing"]
    ] = Field(default_factory=list, max_length=4)


class Continuation(Selection):
    request_key: UUID


class PrepareCandidate(StrictModel):
    source_image: UUID
    candidate_image: UUID
    contract: EditContract
    source_label: str = Field(min_length=1, max_length=80)


class Retry(StrictModel):
    request_key: UUID


class Review(StrictModel):
    verdict: Literal["pending", "pass", "fail"]
    notes: str = Field(default="", max_length=1000)


class State(str, Enum):
    QUEUED = "queued"
    GENERATING = "generating"
    EVALUATING = "evaluating"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED_GENERATION = "failed_generation"
    FAILED_EVALUATION = "failed_evaluation"


TRANSITIONS = {
    "queued": {"generating", "evaluating", "failed_generation", "failed_evaluation"},
    "generating": {"evaluating", "failed_generation", "partial"},
    "evaluating": {"completed", "partial", "failed_evaluation"},
    "failed_evaluation": {"queued"},
    "partial": {"queued"},
    "completed": set(),
    "failed_generation": set(),
}


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code, self.message, self.status = code, message, status
        super().__init__(code)


def check_transition(old: str, new: str) -> None:
    if new not in TRANSITIONS.get(old, set()):
        raise AppError("JOB_CONFLICT", "This job state is no longer current.", 409)
