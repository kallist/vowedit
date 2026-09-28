import numpy as np
import pytest
from PIL import Image

from backend.evaluation import evaluate, rank_candidates, validate_masks
from backend.providers import GenerationRequest, MockImageEditProvider
from backend.schemas import AppError, Change, check_transition

RULES = [{"label": "Face", "type": "manual_region", "threshold": 98}]


def score(images, candidate):
    source, change, keep = images
    return evaluate(source, candidate, change, [keep], RULES, 98)


def test_unchanged_is_not_an_eligible_edit(images):
    result, ghost = score(images, images[0])
    assert result["protected_similarity"] == 100
    assert result["overall_score"] == 100
    assert result["change_difference"] == 0
    assert not result["eligible"]
    assert not np.asarray(ghost)[:, :, 3].any()


def test_exact_rgb_measurement(images):
    source, change, keep = images
    candidate = Image.new("RGB", source.size, (175, 145, 115))
    result, _ = score(images, candidate)
    assert result["unexpected_drift"] == pytest.approx(25 / 255 * 100, abs=1e-4)
    assert result["protected_similarity"] == pytest.approx(100 - 25 / 255 * 100, abs=1e-4)
    assert result["overall_score"] == pytest.approx(100 - 25 / 255 * 100, abs=1e-4)
    assert len(result["violations"]) == 2


def test_ghost_excludes_change_and_shows_drift(images):
    source, change, keep = images
    candidate = Image.new("RGB", source.size, "black")
    _, ghost = score(images, candidate)
    alpha = np.asarray(ghost)[:, :, 3]
    assert not alpha[np.asarray(change) >= 128].any()
    assert alpha[np.asarray(change) < 128].min() > 0


def test_ghost_intensity_proportional(images):
    source = images[0]
    _, ghost1 = score(images, Image.new("RGB", source.size, (140, 110, 80)))
    _, ghost2 = score(images, Image.new("RGB", source.size, (130, 100, 70)))
    assert np.asarray(ghost2)[0, 0, 3] == pytest.approx(np.asarray(ghost1)[0, 0, 3] * 2, abs=1)


@pytest.mark.parametrize(
    "bad,code",
    [
        ("empty", "EMPTY_CHANGE_MASK"),
        ("size", "MASK_SIZE_MISMATCH"),
        ("overlap", "MASK_OVERLAP"),
        ("full", "EMPTY_BACKGROUND"),
        ("keep", "EMPTY_KEEP_MASK"),
    ],
)
def test_mask_validation(images, bad, code):
    source, change, keep = images
    if bad == "empty":
        change = Image.new("L", source.size)
    elif bad == "size":
        change = Image.new("L", (32, 32))
    elif bad == "overlap":
        keep = change
    elif bad == "full":
        change = Image.new("L", source.size, 255)
    else:
        keep = Image.new("L", source.size)
    with pytest.raises(AppError) as caught:
        validate_masks(source, change, [keep])
    assert caught.value.code == code


def test_optional_keep_normalizes_weights(images):
    result, _ = evaluate(images[0], images[0], images[1], [], [], None)
    assert result["protected_similarity"] is None
    assert result["weights"] == {"protected": 0, "background": 1}


def test_dimension_mismatch_not_silently_resized(images):
    with pytest.raises(AppError, match="EVALUATION_FAILED"):
        score(images, Image.new("RGB", (32, 32)))


def test_ranking_prefers_meaningful_preserved_edit_over_noop_and_drift(images):
    source, change, _ = images
    provider = MockImageEditProvider()
    candidates = []
    for index in range(3):
        output = provider.generate(GenerationRequest(source, change, "edit", index, 100))
        evaluation, _ = score(images, output)
        candidates.append({"index": index, "evaluation": evaluation})
    assert [c["index"] for c in rank_candidates(candidates)] == [1, 0, 2]
    noop, _ = score(images, source)
    assert rank_candidates([{"index": 3, "evaluation": noop}, candidates[1]])[0]["index"] == 1


def test_hard_threshold_uses_unrounded_measurement(images):
    candidate = Image.new("RGB", images[0].size, (151, 121, 91))
    result, _ = evaluate(
        images[0], candidate, images[1], [images[2]], [dict(RULES[0], threshold=99.61)], None
    )
    assert result["protected_similarity"] < 99.61
    assert len(result["violations"]) == 1


@pytest.mark.parametrize(
    "old,new",
    [
        ("queued", "generating"),
        ("generating", "evaluating"),
        ("evaluating", "completed"),
        ("failed_evaluation", "queued"),
    ],
)
def test_allowed_state_transitions(old, new):
    check_transition(old, new)


@pytest.mark.parametrize("new", ["queued", "generating", "evaluating", "completed"])
def test_completed_cannot_regress(new):
    with pytest.raises(AppError, match="JOB_CONFLICT"):
        check_transition("completed", new)


def test_contract_rejects_blank_instruction():
    with pytest.raises(ValueError):
        Change(instruction=" ", mask="00000000-0000-0000-0000-000000000000")


def test_mock_is_deterministic(images):
    req = GenerationRequest(images[0], images[1], "edit", 0, 123)
    provider = MockImageEditProvider()
    assert provider.generate(req).tobytes() == provider.generate(req).tobytes()
