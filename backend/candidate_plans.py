"""Versioned, deterministic provider instructions; independent of UI locale."""

import hashlib
import json
from typing import Any

from backend.schemas import AppError

TEMPLATE_VERSION = "strategy-en-v1"
MAX_EFFECTIVE_LENGTH = 2400
DIRECTIVES = (
    ("safe", "Make the minimum necessary changes inside CHANGE to fulfill the original intent. "
     "Preserve existing structure and details. Do not modify anything outside CHANGE."),
    ("balanced", "Allow moderate adjustments to materials and details inside CHANGE to clearly "
     "fulfill the original intent. Do not modify anything outside CHANGE."),
    ("bold", "Allow more substantial reconstruction inside CHANGE to fulfill the same original "
     "intent. Do not modify anything outside CHANGE."),
)


def fingerprint(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def compile_plan(instruction: str) -> dict[str, Any]:
    slots = []
    for index, (strategy, directive) in enumerate(DIRECTIVES):
        effective = f"{instruction}\n\n{directive}"
        if len(effective) > MAX_EFFECTIVE_LENGTH:
            raise AppError("PLAN_TOO_LONG", "Effective instruction exceeds 2400 characters.", 422)
        slots.append(dict(index=index, seed=4100 + index, strategy_id=strategy,
                          base_instruction=instruction, strategy_directive=directive,
                          effective_instruction=effective, template_version=TEMPLATE_VERSION))
    plan = dict(mode="strategy-v1", template_version=TEMPLATE_VERSION,
                directive_language="en", slots=slots)
    return {**plan, "fingerprint": fingerprint(plan)}
