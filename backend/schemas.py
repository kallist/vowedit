from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


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


class CreateImportedRun(StrictModel):
    source_image: UUID
    contract: EditContract
    request_key: UUID
    candidate_images: list[UUID] = Field(min_length=3, max_length=3)
    source_label: str = Field(min_length=1, max_length=80)
    continuation_draft_id: UUID | None = None


class PreviewPlan(StrictModel):
    instruction: str = Field(min_length=3, max_length=1500)


class Selection(StrictModel):
    candidate_id: UUID
    expected_selection_revision: int = Field(ge=0)
    confirmations: list[Literal["review_pending", "semantic_fail", "pixel_ineligible",
                              "evaluation_missing"]] = Field(default_factory=list, max_length=4)


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
