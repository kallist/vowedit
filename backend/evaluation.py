from typing import Any

import numpy as np
from PIL import Image

from backend.schemas import AppError

METRIC_VERSION = "rgb-mae-v1"
MIN_CHANGE = 2.0


def validate_masks(
    source: Image.Image, change: Image.Image, keeps: list[Image.Image]
) -> tuple[Any, list[Any]]:
    if change.size != source.size or any(mask.size != source.size for mask in keeps):
        raise AppError("MASK_SIZE_MISMATCH", "Masks must match the source image dimensions.")
    editable = np.asarray(change.convert("L")) >= 128
    protected = [np.asarray(mask.convert("L")) >= 128 for mask in keeps]
    if not editable.any():
        raise AppError("EMPTY_CHANGE_MASK", "Paint an area to CHANGE before continuing.")
    if editable.all():
        raise AppError("EMPTY_BACKGROUND", "Leave some image area outside CHANGE for comparison.")
    for mask in protected:
        if not mask.any():
            raise AppError("EMPTY_KEEP_MASK", "A named KEEP region cannot be empty.")
        if (mask & editable).any():
            raise AppError("MASK_OVERLAP", "CHANGE and KEEP overlap. Erase the overlap first.")
    return editable, protected


def evaluate(
    source: Image.Image,
    candidate: Image.Image,
    change: Image.Image,
    keeps: list[Image.Image],
    rules: list[dict[str, Any]],
    background_threshold: float | None,
) -> tuple[dict[str, Any], Image.Image]:
    if candidate.size != source.size:
        raise AppError("EVALUATION_FAILED", "Candidate dimensions do not match the original.")
    editable, protected = validate_masks(source, change, keeps)
    a = np.asarray(source.convert("RGB"), dtype=np.float32)
    b = np.asarray(candidate.convert("RGB"), dtype=np.float32)
    difference = np.abs(a - b).mean(axis=2) / 255.0
    change_difference = float(difference[editable].mean() * 100)
    drift = float(difference[~editable].mean() * 100)
    region_scores = [100 - float(difference[mask].mean() * 100) for mask in protected]
    preservation = float(np.mean(region_scores)) if region_scores else None
    background = 100 - drift
    weights = {"protected": 0.6 if protected else 0, "background": 0.4 if protected else 1}
    overall = (preservation or 0) * weights["protected"] + background * weights["background"]
    violations = [
        f"{rule['label']}: below KEEP threshold {rule['threshold']:g}."
        for rule, score in zip(rules, region_scores, strict=True)
        if score < rule["threshold"]
    ]
    if background_threshold is not None and background < background_threshold:
        violations.append(f"Outside CHANGE: below threshold {background_threshold:g}.")
    meaningful = change_difference >= MIN_CHANGE
    warnings_list = list(violations)
    if not meaningful:
        warnings_list.append("Too little pixel change inside CHANGE; the edit may be incomplete.")
    if drift > 0.01:
        warnings_list.append("Pixel drift detected outside CHANGE. Inspect Ghost View.")
    warnings_list.append("Prompt adherence and visual quality need manual review.")
    heat = np.zeros((*difference.shape, 4), dtype=np.uint8)
    heat[:, :, :3] = [233, 76, 36]
    heat[:, :, 3] = np.where(editable, 0, np.minimum(difference * 3, 0.85) * 255).astype(np.uint8)
    result = {
        "metric_version": METRIC_VERSION,
        "protected_similarity": preservation,
        "background_preservation": background,
        "change_difference": change_difference,
        "unexpected_drift": drift,
        "overall_score": overall,
        "weights": weights,
        "minimum_change": MIN_CHANGE,
        "meaningful_change": meaningful,
        "violations": violations,
        "eligible": not violations and meaningful,
        "regions": [
            {"label": r["label"], "type": r["type"], "threshold": r["threshold"], "score": s}
            for r, s in zip(rules, region_scores, strict=True)
        ],
        "warnings": warnings_list,
        "edit_adherence": "manual_review",
    }
    return result, Image.fromarray(heat)


def rank_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def key(candidate: dict[str, Any]) -> tuple[float, ...]:
        score = candidate.get("evaluation")
        if not score:
            return (1, float("inf"), 1, float("inf"), 0, candidate["index"])
        return (
            0 if score["eligible"] else 1,
            len(score["violations"]),
            0 if score["meaningful_change"] else 1,
            score["unexpected_drift"],
            -score["overall_score"],
            candidate["index"],
        )

    ranked = sorted(candidates, key=key)
    for position, candidate in enumerate(ranked, 1):
        candidate["rank"] = position
    return ranked
