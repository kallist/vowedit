"""Structured report facts. Never infer business rules from English warnings."""

from typing import Any


def issues(candidate: dict[str, Any]) -> list[str]:
    verdict = candidate.get("manual_review", {}).get("verdict", "pending")
    result = ["review_pending"] if verdict == "pending" else []
    if verdict == "fail":
        result.append("semantic_fail")
    if candidate.get("evaluation") is None:
        result.append("evaluation_missing")
    elif not candidate["evaluation"]["eligible"]:
        result.append("pixel_ineligible")
    return result


def report(run: dict[str, Any]) -> dict[str, Any]:
    candidates = []
    for candidate in run["candidates"]:
        evaluation = candidate.get("evaluation")
        locked = bool(candidate.get("generation_metadata", {}).get("preparation"))
        reasons = []
        if evaluation:
            if evaluation["protected_similarity"] is None:
                reasons.append("keep_undefined")
            if not evaluation["meaningful_change"]:
                reasons.append("insufficient_change")
            if evaluation["unexpected_drift"] > 0.01:
                reasons.append("outside_drift")
            for region in evaluation["regions"]:
                if region["score"] < region["threshold"]:
                    reasons.append("keep_threshold")
            threshold = run["contract"]["background_threshold"]
            if threshold is not None and evaluation["background_preservation"] < threshold:
                reasons.append("outside_threshold")
            if locked and evaluation["background_preservation"] == 100:
                reasons.append("boundary_enforced")
            else:
                reasons.append("outside_mean_rgb")
        candidates.append(dict(candidate_id=candidate["id"], index=candidate["index"],
                               pixel_status="not_evaluated" if not evaluation else
                               "eligible" if evaluation["eligible"] else "ineligible",
                               semantic_status=candidate.get("manual_review", {}).get(
                                   "verdict", "pending"),
                               issues=issues(candidate), reasons=reasons,
                               boundary_locked=locked))
    return dict(schema_version="report-v2", candidate_mode=run.get(
        "candidate_mode", "legacy-seeds-v1"), candidate_plan=run.get("candidate_plan"),
        automatic_recommendation=run.get("selected_candidate_id"),
        user_selection=run.get("user_selected_candidate_id"),
        selection_revision=run.get("selection_revision", 0),
        lineage={key: run.get(key) for key in ("parent_run_id", "parent_candidate_id",
                 "root_run_id", "derivation_kind", "continuation_draft_id")},
        ranking_rule="eligible-violations-change-drift-score-index-v1",
        candidates=candidates)
