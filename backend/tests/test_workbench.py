"""V0.2 behavior, legacy hash, transactional failures and concurrent commands."""

import copy
import hashlib
import io
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from PIL import Image

from backend.candidate_plans import compile_plan
from backend.reporting import report
from backend.schemas import (
    AppError,
    Continuation,
    CreateImportedRun,
    CreateRun,
    PrepareCandidate,
    Review,
    Selection,
)
from backend.services import ImageEditService
from backend.tests.conftest import payload, png


def completed(service, client, images, *, strategy=False):
    body = payload(client, images)
    if strategy:
        body.update(candidate_mode="strategy-v1", preview_fingerprint=compile_plan(
            body["contract"]["change"]["instruction"])["fingerprint"])
    # Avoid the worker in direct service tests: the API client owns the worker otherwise.
    run = service.create(CreateRun.model_validate(body))
    import time
    for _ in range(200):
        result = service.repo.get(run["id"])
        if result["status"] == "completed":
            return body, result
        time.sleep(.01)
    raise AssertionError(result)


def selection(run, index=1):
    candidate = next(c for c in run["candidates"] if c["index"] == index)
    from backend.reporting import issues
    return dict(candidate_id=candidate["id"], expected_selection_revision=
                run.get("selection_revision", 0), confirmations=issues(candidate))


def test_plan_preview_strict_and_pure(service, client):
    before = list(service.assets.root.iterdir())
    response = client.post("/api/candidate-plans", json={"instruction": "  把外套改成蓝色  "})
    assert response.status_code == 200
    plan = response.json()
    assert [s["strategy_id"] for s in plan["slots"]] == ["safe", "balanced", "bold"]
    assert [s["seed"] for s in plan["slots"]] == [4100, 4101, 4102]
    assert all(s["base_instruction"] == "把外套改成蓝色" for s in plan["slots"])
    assert len({s["effective_instruction"] for s in plan["slots"]}) == 3
    assert list(service.assets.root.iterdir()) == before
    assert service.repo.history() == []
    assert client.post("/api/candidate-plans", json={"instruction": "Hello",
                       "effective_instruction": "injected"}).status_code == 422


def test_strategy_worker_frozen_retry_and_replay(service, client, images, monkeypatch):
    provider = service.providers["mock"]
    original = provider.generate
    calls = []
    def record(request):
        calls.append(request)
        return original(request)
    monkeypatch.setattr(provider, "generate", record)
    body, run = completed(service, client, images, strategy=True)
    slots = run["candidate_plan"]["slots"]
    assert [c.instruction for c in calls] == [s["effective_instruction"] for s in slots]
    assert [c.seed for c in calls] == [4100, 4101, 4102]
    assert all(c["candidate_plan"] == slots[c["index"]] for c in run["candidates"])
    monkeypatch.setattr("backend.services.compile_plan", lambda _: pytest.fail("Recompiled"))
    assert service.create(CreateRun.model_validate(body))["id"] == run["id"]
    retried = service.retry_generation(run["id"], str(uuid4()))
    assert retried["candidate_plan"] == run["candidate_plan"]
    assert retried["derivation_kind"] == "generation_retry"
    assert retried["root_run_id"] == run["id"]


def test_plan_conflict_and_legacy_pending_shape(service, client, images):
    service.close()  # Persisted queued/ambiguous fixture, no worker racing the old-shape write.
    body = payload(client, images)
    bad = {**body, "candidate_mode": "strategy-v1", "preview_fingerprint": "0" * 64}
    assert client.post("/api/runs", json=bad).status_code == 409
    assert service.repo.history() == []
    # Store the exact old normalized shape, without V0.2 schema defaults.
    old = copy.deepcopy(body)
    old["candidate_count"] = 3
    old["contract"]["keep"][0]["threshold"] = 98.0
    old["contract"]["background_threshold"] = 98.0
    old.pop("request_key")
    old["parent_run_id"] = None
    expected = hashlib.sha256(json.dumps(old, sort_keys=True).encode()).hexdigest()
    run = service.create(CreateRun.model_validate(body))
    with service.repo.connection() as db:
        assert db.execute("SELECT payload_hash FROM jobs WHERE request_key=?",
                          (body["request_key"],)).fetchone()[0] == expected
        legacy = dict(run)
        for key in ("candidate_mode", "candidate_plan", "selection_revision",
                    "user_selected_candidate_id", "root_run_id", "derivation_kind"):
            legacy.pop(key, None)
        legacy["generation_retry_safe"] = False  # ambiguous paid submission fixture
        db.execute("UPDATE runs SET data=? WHERE id=?", (json.dumps(legacy), run["id"]))
    assert service.create(CreateRun.model_validate(body))["id"] == run["id"]
    assert service.repo.get(run["id"])["user_selected_candidate_id"] is None
    assert service.repo.get(run["id"])["candidate_mode"] == "legacy-seeds-v1"


def test_selection_confirmation_noop_cas_and_independent_review(service, client, images):
    _, run = completed(service, client, images)
    desired = selection(run)
    assert client.put(f'/api/runs/{run["id"]}/selection', json={**desired,
                      "confirmations": []}).status_code == 409
    selected = service.select(run["id"], Selection.model_validate(desired))
    assert selected["selection_revision"] == 1
    assert selected["selected_candidate_id"] == run["selected_candidate_id"]
    assert selected["candidates"] == run["candidates"]
    assert service.select(run["id"], Selection.model_validate(desired)) == selected
    with pytest.raises(AppError, match="SELECTION_CONFLICT"):
        service.select(run["id"], Selection.model_validate(selection(run, 0)))
    assert service.repo.get(run["id"])["user_selected_candidate_id"] == desired["candidate_id"]


def test_continue_concurrent_persistent_replay_lineage(service, client, images):
    body, run = completed(service, client, images)
    adopted = service.select(run["id"], Selection.model_validate(selection(run)))
    request = Continuation.model_validate({**selection(adopted), "request_key": str(uuid4())})
    receipt = service.receipt(run["id"])
    with service.repo.connection() as db:
        before = db.execute("SELECT count(*) FROM assets").fetchone()[0]
        jobs = db.execute("SELECT count(*) FROM jobs").fetchone()[0]
    with ThreadPoolExecutor(max_workers=4) as pool:
        drafts = list(pool.map(lambda _: service.continue_edit(run["id"], request), range(4)))
    assert all(d == drafts[0] for d in drafts)
    draft = drafts[0]
    assert service.receipt(run["id"]) == receipt
    assert service.assets.load(draft["source_image"]).tobytes() == service.assets.load(
        draft["source_candidate_asset"]).tobytes()
    assert draft["source_image"] != draft["source_candidate_asset"]
    with service.repo.connection() as db:
        assert db.execute("SELECT count(*) FROM assets").fetchone()[0] == before + 1
        assert db.execute("SELECT count(*) FROM jobs").fetchone()[0] == jobs
    restarted = ImageEditService(service.assets.root.parent)
    assert restarted.draft(draft["id"]) == draft
    changed = service.select(run["id"], Selection.model_validate(selection(adopted, 0)))
    assert changed["selection_revision"] == 2
    assert restarted.continue_edit(run["id"], request) == draft
    conflict = request.model_copy(update={"expected_selection_revision": 2})
    with pytest.raises(AppError, match="JOB_CONFLICT"):
        restarted.continue_edit(run["id"], conflict)
    body.update(source_image=draft["source_image"], continuation_draft_id=draft["id"],
                request_key=str(uuid4()))
    child = service.create(CreateRun.model_validate(body))
    assert child["parent_run_id"] == run["id"]
    assert child["parent_candidate_id"] == draft["parent_candidate_id"]
    assert child["root_run_id"] == run["id"]
    assert child["derivation_kind"] == "continuation"
    assert client.post("/api/runs", json={**body, "source_image": run["source_image"],
                       "request_key": str(uuid4())}).status_code == 409


@pytest.mark.parametrize("failure", ["file", "db", "commit", "race", "state"])
def test_continue_failure_has_no_bad_references(service, client, images, monkeypatch, failure):
    _, run = completed(service, client, images)
    adopted = service.select(run["id"], Selection.model_validate(selection(run)))
    request = Continuation.model_validate({**selection(adopted), "request_key": str(uuid4())})
    with service.repo.connection() as db:
        count = db.execute("SELECT count(*) FROM assets").fetchone()[0]
    original = service.assets.save
    if failure == "file":
        monkeypatch.setattr(service.assets, "save", lambda _: (_ for _ in ()).throw(OSError()))
    elif failure == "db":
        with service.repo.connection() as db:
            db.execute("CREATE TRIGGER reject_original BEFORE INSERT ON assets "
                       "WHEN NEW.kind='original' BEGIN SELECT RAISE(ABORT, 'fixture'); END")
    elif failure == "commit":
        with service.repo.connection() as db:
            db.execute("CREATE TRIGGER reject_starter BEFORE UPDATE ON runs "
                       "BEGIN SELECT RAISE(ABORT, 'fixture'); END")
    else:
        def race(image):
            result = original(image)
            if failure == "state":
                service.repo.mutate(run["id"], lambda current: current.update(status="queued"))
            else:
                service.select(run["id"], Selection.model_validate(selection(adopted, 0)))
            return result
        monkeypatch.setattr(service.assets, "save", race)
    with pytest.raises((OSError, sqlite3.Error, AppError)):
        service.continue_edit(run["id"], request)
    assert service.repo.starter(str(request.request_key), request_key=True) is None
    with service.repo.connection() as db:
        assert db.execute("SELECT count(*) FROM assets").fetchone()[0] == count


def test_normalized_raw_readonly_and_corrupt_recipe(service, client, images):
    body = payload(client, images)
    raw = Image.new("RGB", (96, 64), (20, 80, 140))
    raw_id = client.post("/api/assets?kind=candidate", files={"file": (
        "raw.png", png(raw), "image/png")}).json()["id"]
    prepared = service.prepare_candidate(PrepareCandidate.model_validate(
            {k: v for k, v in body.items() if k in {"source_image", "contract"}} |
            dict(candidate_image=raw_id, source_label="Offline fixture")))
    files = {f.name: f.read_bytes() for f in service.assets.root.iterdir()}
    response = client.get(f'/api/prepared-candidates/{prepared["id"]}/normalized-raw')
    assert response.status_code == 200
    recipe = prepared["metadata"]["preparation"]
    expected = raw.resize(images[0].size, Image.Resampling.LANCZOS,
                          box=tuple(recipe["normalization"]["crop_box"]))
    assert Image.open(io.BytesIO(response.content)).tobytes() == expected.tobytes()
    assert files == {f.name: f.read_bytes() for f in service.assets.root.iterdir()}
    metadata = copy.deepcopy(prepared["metadata"])
    metadata["preparation"]["normalization"]["crop_box"][0] += 1
    service.assets.save_preparation(prepared["id"], metadata)
    response = client.get(f'/api/prepared-candidates/{prepared["id"]}/normalized-raw')
    assert response.status_code == 409


def test_report_preserves_semantic_fail_unrounded_values(service, client, images):
    _, run = completed(service, client, images)
    candidate = run["candidates"][0]
    candidate["evaluation"]["background_preservation"] = 99.999
    candidate["manual_review"] = {"verdict": "fail", "notes": "真实评审"}
    facts = report(run)["candidates"][0]
    assert facts["semantic_status"] == "fail"
    assert "semantic_fail" in facts["issues"]
    assert "boundary_enforced" not in facts["reasons"]
    assert "outside_mean_rgb" in facts["reasons"]


def test_preview_input_length_and_strict_new_commands(client, images):
    assert client.post("/api/candidate-plans", json={"instruction": "x" * 1500}).status_code == 200
    assert client.post("/api/candidate-plans", json={"instruction": "x" * 1501}).status_code == 422
    body = payload(client, images)
    response = client.post("/api/runs", json={**body, "effective_instruction": "override"})
    assert response.status_code == 422
    assert client.post("/api/runs", json={**body, "parent_run_id": str(uuid4())}).status_code == 422
    for path in ("selection", "continuations"):
        request = dict(candidate_id=str(uuid4()), expected_selection_revision=-1,
                       confirmations=["silent_success"])
        if path == "continuations":
            request["request_key"] = str(uuid4())
            response = client.post(f"/api/runs/{uuid4()}/{path}", json=request)
        else:
            response = client.put(f"/api/runs/{uuid4()}/{path}", json=request)
        assert response.status_code == 422


def test_selection_race_single_revision(service, client, images):
    _, run = completed(service, client, images)
    requests = [Selection.model_validate(selection(run, i)) for i in (0, 1)]
    def save(request):
        try:
            return service.select(run["id"], request)
        except AppError as error:
            return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(save, requests))
    assert sum(isinstance(response, dict) for response in responses) == 1
    assert "SELECTION_CONFLICT" in responses
    assert service.repo.get(run["id"])["selection_revision"] == 1


def test_prepared_continuation_uses_locked_not_raw_zero_generation(service, client, images,
                                                               monkeypatch):
    from backend.tests.test_imported import imported_payload
    from backend.tests.test_integration import wait_run
    body = imported_payload(client, images)
    monkeypatch.setattr(service.providers["mock"], "generate",
                        lambda _: pytest.fail("Import called generation"))
    metadata = []
    for raw_id in body["candidate_images"]:
        metadata.append(service.prepare_candidate(PrepareCandidate.model_validate(
            {k: body[k] for k in ("source_image", "contract", "source_label")} |
            {"candidate_image": raw_id})))
    raw_files = {i: service.assets.path(i).read_bytes() for i in
                 [body["source_image"], *body["candidate_images"],
                  body["contract"]["change"]["mask"], body["contract"]["keep"][0]["mask"]]}
    body["candidate_images"] = [m["id"] for m in metadata]
    run = service.create_imported(CreateImportedRun.model_validate(body))
    run = wait_run(client, run["id"])
    desired = selection(run, 0)
    service.review(run["id"], desired["candidate_id"], Review(verdict="fail", notes="Offline"))
    run = service.repo.get(run["id"])
    adopted = service.select(run["id"], Selection.model_validate(selection(run, 0)))
    request = Continuation.model_validate({**selection(adopted, 0), "request_key": str(uuid4())})
    receipt = service.receipt(run["id"])
    draft = service.continue_edit(run["id"], request)
    assert draft["artifact_kind"] == "locked"
    assert draft["source_candidate_asset"] == metadata[0]["id"]
    assert service.assets.load(draft["source_image"]).tobytes() == service.assets.load(
        metadata[0]["id"]).tobytes()
    assert service.receipt(run["id"]) == receipt
    assert raw_files == {i: service.assets.path(i).read_bytes() for i in raw_files}
    body.update(source_image=draft["source_image"], continuation_draft_id=draft["id"],
                request_key=str(uuid4()))
    # New masks are supplied explicitly. Old prepared assets cannot claim this new source.
    assert client.post("/api/imported-runs", json=body).status_code == 409
    body["candidate_images"] = [m["metadata"]["raw_candidate_asset"] for m in metadata]
    child = service.create_imported(CreateImportedRun.model_validate(body))
    assert child["derivation_kind"] == "continuation"
    assert child["parent_candidate_id"] == draft["parent_candidate_id"]
    assert child["root_run_id"] == run["id"]


def test_missing_final_and_new_review_issue_fail_closed(service, client, images):
    _, run = completed(service, client, images)
    adopted = service.select(run["id"], Selection.model_validate(selection(run)))
    request = Continuation.model_validate({**selection(adopted), "request_key": str(uuid4())})
    service.review(run["id"], str(request.candidate_id), Review(verdict="fail"))
    with pytest.raises(AppError, match="CONFIRMATION_REQUIRED"):
        service.continue_edit(run["id"], request)
    candidate = next(c for c in adopted["candidates"] if c["id"] == str(request.candidate_id))
    service.assets.path(candidate["image"]).unlink()
    with pytest.raises(AppError, match="ASSET_NOT_FOUND"):
        service.continue_edit(run["id"], request)
