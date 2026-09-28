import time
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import backend.services as service_module
from backend.api import create_app
from backend.persistence import Repository
from backend.providers import MockImageEditProvider
from backend.schemas import AppError, CreateRun
from backend.services import ImageEditService
from backend.tests.conftest import payload, png


def wait_run(client, run_id):
    for _ in range(150):
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] not in {"queued", "generating", "evaluating"}:
            return run
        time.sleep(0.02)
    pytest.fail("Job did not finish within 3 seconds")


def test_full_mock_persistence_receipt_and_manual_review(client, service, images):
    request = payload(client, images)
    submitted = client.post("/api/runs", json=request)
    assert submitted.status_code == 202
    run = wait_run(client, submitted.json()["id"])
    assert run["status"] == "completed"
    assert len(run["candidates"]) == 3
    assert [c["index"] for c in run["candidates"]] == [1, 0, 2]
    selected = run["candidates"][0]
    assert run["selected_candidate_id"] == selected["id"]
    assert selected["evaluation"]["eligible"]
    for candidate in run["candidates"]:
        assert client.get(f"/api/assets/{candidate['image']}").status_code == 200
        assert client.get(f"/api/assets/{candidate['ghost']}").status_code == 200
    receipt = client.get(f"/api/runs/{run['id']}/receipt").json()
    assert receipt["selected"]["index"] == 1
    assert receipt["provider"] == "mock"
    assert receipt["selected"]["evaluation"] == selected["evaluation"]
    assert receipt["candidates"][1]["evaluation"]["warnings"]
    response = client.put(
        f"/api/runs/{run['id']}/candidates/{selected['id']}/review",
        json={"verdict": "fail", "notes": "Pixel inversion is not a blue jacket."},
    )
    assert response.status_code == 200
    receipt = client.get(f"/api/runs/{run['id']}/receipt").json()
    assert receipt["selected"]["manual_review"]["verdict"] == "fail"
    reopened = Repository(service.repo.path)
    assert reopened.get(run["id"])["candidates"][0]["manual_review"]["verdict"] == "fail"


def test_concurrent_idempotent_submission(client, service, images):
    request = CreateRun.model_validate(payload(client, images))
    with ThreadPoolExecutor(max_workers=6) as pool:
        ids = list(pool.map(lambda _: service.create(request)["id"], range(12)))
    assert len(set(ids)) == 1
    run = wait_run(client, ids[0])
    assert len(run["candidates"]) == 3
    assert len(service.repo.history()) == 1
    changed = request.model_copy(deep=True)
    changed.contract.change.instruction = "Different instruction"
    with pytest.raises(AppError, match="JOB_CONFLICT"):
        service.create(changed)


class PartialProvider(MockImageEditProvider):
    def generate(self, request):
        if request.index == 0:
            raise AppError("PROVIDER_FAILED", "Controlled failure.")
        return super().generate(request)


def test_partial_candidate_failure(client, service, images):
    service.providers["mock"] = PartialProvider()
    run_id = client.post("/api/runs", json=payload(client, images)).json()["id"]
    run = wait_run(client, run_id)
    assert run["status"] == "partial"
    assert len(run["candidates"]) == 2
    assert run["failures"][0]["index"] == 0
    assert run["selected_candidate_id"] is not None


def test_evaluation_failure_keeps_outputs_and_retries_without_provider(
    client, service, images, monkeypatch
):
    original_evaluate = service_module.evaluate

    def broken(*args):
        raise RuntimeError("secret value must not leak")

    monkeypatch.setattr(service_module, "evaluate", broken)
    run_id = client.post("/api/runs", json=payload(client, images)).json()["id"]
    run = wait_run(client, run_id)
    assert run["status"] == "failed_evaluation"
    saved_ids = {c["image"] for c in run["candidates"]}
    assert len(saved_ids) == 3
    assert "secret value" not in str(run)
    monkeypatch.setattr(service_module, "evaluate", original_evaluate)
    service.providers["mock"] = FailingProvider()
    key = str(uuid4())
    assert (
        client.post(f"/api/runs/{run_id}/retry-evaluation", json={"request_key": key}).status_code
        == 202
    )
    run = wait_run(client, run_id)
    assert run["status"] == "completed"
    assert {c["image"] for c in run["candidates"]} == saved_ids
    # Network retry of the same evaluation request remains idempotent after completion.
    assert (
        client.post(f"/api/runs/{run_id}/retry-evaluation", json={"request_key": key}).status_code
        == 202
    )
    assert client.get(f"/api/runs/{run_id}").json()["status"] == "completed"


class FailingProvider:
    def generate(self, request):
        raise AppError("PROVIDER_UNAVAILABLE", "Provider unavailable.")


def test_generation_failure_retry_reuses_contract(client, service, images):
    service.providers["mock"] = FailingProvider()
    request = payload(client, images)
    run_id = client.post("/api/runs", json=request).json()["id"]
    run = wait_run(client, run_id)
    assert run["status"] == "failed_generation"
    service.providers["mock"] = MockImageEditProvider()
    key = str(uuid4())
    retried = client.post(f"/api/runs/{run_id}/retry-generation", json={"request_key": key})
    assert retried.status_code == 202
    new_run = wait_run(client, retried.json()["id"])
    assert new_run["status"] == "completed"
    assert new_run["contract"] == run["contract"]
    assert new_run["parent_run_id"] == run_id
    duplicate = client.post(f"/api/runs/{run_id}/retry-generation", json={"request_key": key})
    assert duplicate.json()["id"] == new_run["id"]


def test_ambiguous_generation_cannot_duplicate_paid_work(client, service, images):
    class Unknown:
        def generate(self, request):
            raise AppError("PROVIDER_STATE_UNKNOWN", "Response lost.")

    service.providers["mock"] = Unknown()
    run_id = client.post("/api/runs", json=payload(client, images)).json()["id"]
    run = wait_run(client, run_id)
    assert not run["generation_retry_safe"]
    assert (
        client.post(
            f"/api/runs/{run_id}/retry-generation", json={"request_key": str(uuid4())}
        ).status_code
        == 409
    )


def test_no_good_candidate_not_selected(client, service, images):
    class Noop:
        def generate(self, request):
            return request.source.copy()

    service.providers["mock"] = Noop()
    run_id = client.post("/api/runs", json=payload(client, images)).json()["id"]
    run = wait_run(client, run_id)
    assert run["status"] == "completed"
    assert run["no_good_candidate"]
    assert run["selected_candidate_id"] is None
    assert len(run["candidates"]) == 3
    assert client.get(f"/api/runs/{run_id}/receipt").json()["selected"] is None


@pytest.mark.parametrize(
    "filename,mime,data",
    [
        ("evil.png", "image/png", b"not-image"),
        ("evil.jpg", "image/png", None),
        ("evil.png", "text/html", None),
    ],
)
def test_upload_validation(client, images, filename, mime, data):
    response = client.post("/api/assets", files={"file": (filename, data or png(images[0]), mime)})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IMAGE"


def test_upload_ignores_filename_paths(client, service, images):
    response = client.post(
        "/api/assets", files={"file": ("../../escape.png", png(images[0]), "image/png")}
    )
    assert response.status_code == 201
    assert service.assets.path(response.json()["id"]).parent == service.assets.root


def test_host_origin_and_oversize_rejected(client):
    assert client.get("/api/config", headers={"Host": "evil.example"}).status_code == 400
    assert client.get("/api/config", headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.post("/api/assets", headers={"Content-Length": "999999999"}).status_code == 413


def test_errors_and_config_do_not_echo_private_values(client):
    response = client.post("/api/runs", json={"provider": "private-secret-string"})
    assert "private-secret-string" not in response.text
    config = client.get("/api/config").json()
    assert "COMFYUI_BASE_URL" not in str(config)
    assert "checkpoint" not in str(config)


def test_stale_job_cannot_regress_state(client, service, images):
    run_id = client.post("/api/runs", json=payload(client, images)).json()["id"]
    run = wait_run(client, run_id)
    with pytest.raises(AppError, match="JOB_CONFLICT"):
        service.repo.mutate(run_id, lambda r: None, job_id=run["job_id"], status="generating")
    with pytest.raises(AppError, match="JOB_CONFLICT"):
        service.repo.mutate(
            run_id, lambda r: r.update(status="failed_generation"), job_id=str(uuid4())
        )


def test_restart_recovers_queued_and_interruptions(tmp_path, images):
    service = ImageEditService(tmp_path)
    client = TestClient(create_app(service))  # intentionally no worker lifespan
    data = payload(client, images)
    run = service.create(CreateRun.model_validate(data))
    service.repo.mutate(run["id"], lambda r: None, job_id=run["job_id"], status="generating")
    service.repo.recover()
    assert service.repo.get(run["id"])["status"] == "failed_generation"
    data["request_key"] = str(uuid4())
    queued = service.create(CreateRun.model_validate(data))
    with TestClient(create_app(ImageEditService(tmp_path))) as restarted:
        assert wait_run(restarted, queued["id"])["status"] == "completed"


def test_missing_candidate_is_not_reviewable(client, images):
    run_id = client.post("/api/runs", json=payload(client, images)).json()["id"]
    wait_run(client, run_id)
    response = client.put(
        f"/api/runs/{run_id}/candidates/{uuid4()}/review", json={"verdict": "pass", "notes": ""}
    )
    assert response.status_code == 404


def test_streamed_request_size_is_bounded_without_content_length(client):
    response = client.post(
        "/api/runs",
        content=iter([b"x" * 40_000, b"y" * 40_000]),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "REQUEST_TOO_LARGE"


def test_recover_after_metrics_saved_before_final_commit(client, service, images):
    import json

    run_id = client.post("/api/runs", json=payload(client, images)).json()["id"]
    run = wait_run(client, run_id)
    # Reproduce a crash boundary: per-candidate metrics committed, final ranking not committed.
    run.update(status="evaluating", selected_candidate_id=None)
    with service.repo.connection() as db:
        db.execute(
            "UPDATE runs SET status='evaluating', data=? WHERE id=?", (json.dumps(run), run_id)
        )
        db.execute("UPDATE jobs SET status='evaluating' WHERE id=?", (run["job_id"],))
    service.repo.recover()
    service.providers["mock"] = FailingProvider()
    response = client.post(
        f"/api/runs/{run_id}/retry-evaluation", json={"request_key": str(uuid4())}
    )
    assert response.status_code == 202
    recovered = wait_run(client, run_id)
    assert recovered["status"] == "completed"
    assert recovered["selected_candidate_id"] == recovered["candidates"][0]["id"]
