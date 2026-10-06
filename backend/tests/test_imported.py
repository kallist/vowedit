import io
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, PngImagePlugin

import backend.services as service_module
from backend.api import create_app
from backend.evaluation import evaluate, rank_candidates
from backend.persistence import Repository
from backend.schemas import AppError, CreateImportedRun
from backend.services import ImageEditService
from backend.tests.conftest import payload, png
from backend.tests.test_integration import wait_run


def imported_payload(client, images):
    request = payload(client, images)
    request.pop("provider")
    ids = []
    for index in range(3):
        image = images[0].copy()
        ImageDraw.Draw(image).rectangle((24, 24, 47, 47), fill=(20, 30, 60 + index * 20))
        response = client.post(
            "/api/assets?kind=candidate", files={"file": ("candidate.png", png(image), "image/png")}
        )
        assert response.status_code == 201
        ids.append(response.json()["id"])
    return dict(request, candidate_images=ids, source_label="GPT Image via Codex")


def forbid_generation(service):
    class Forbidden:
        def generate(self, request):
            pytest.fail("Imported run called a generation provider")

    service.providers = {"mock": Forbidden()}


def test_imported_full_pipeline_same_metrics_receipt_review_and_reopen(client, service, images):
    forbid_generation(service)
    request = imported_payload(client, images)
    run = wait_run(client, client.post("/api/imported-runs", json=request).json()["id"])
    assert run["status"] == "completed"
    assert run["provider_jobs"] == []
    assert run["provider"] == "imported"
    assert run["candidate_source"] == "imported"
    assert not run["generation_retry_safe"]
    for c in run["candidates"]:
        expected, ghost = evaluate(
            *[images[0], service.assets.load(c["image"]), images[1], [images[2]]],
            request["contract"]["keep"],
            98,
        )
        assert c["evaluation"] == expected
        assert service.assets.load(c["ghost"]).tobytes() == ghost.tobytes()
        assert c["seed"] is None
        assert c["generation_metadata"] == {
            "provider": "imported",
            "source": "external",
            "source_label": "GPT Image via Codex",
            "simulation": False,
        }
    assert run["candidates"] == rank_candidates(run["candidates"])
    receipt = client.get(f"/api/runs/{run['id']}/receipt").json()
    assert receipt["provider"] == "imported"
    assert receipt["generation_source"] == "external-import"
    assert receipt["source_label"] == request["source_label"]
    assert receipt["generated"] == 0 and receipt["imported"] == 3
    assert "generated externally" in receipt["generation_notice"]
    candidate = run["candidates"][-1]
    assert (
        client.put(
            f"/api/runs/{run['id']}/candidates/{candidate['id']}/review",
            json={"verdict": "fail", "notes": "Human checks color separately."},
        ).status_code
        == 200
    )
    saved = Repository(service.repo.path).get(run["id"])
    assert saved["candidates"][-1]["manual_review"]["verdict"] == "fail"
    assert (
        client.post(
            f"/api/runs/{run['id']}/retry-generation", json={"request_key": str(uuid4())}
        ).json()["error"]["code"]
        == "GENERATION_NOT_APPLICABLE"
    )


@pytest.mark.parametrize("count", [0, 1, 2, 4])
def test_exactly_three_required(client, images, count):
    request = imported_payload(client, images)
    request["candidate_images"] = [request["candidate_images"][0]] * count
    assert client.post("/api/imported-runs", json=request).status_code == 422


@pytest.mark.parametrize("label", ["", "   ", "x" * 81])
def test_label_validation(client, images, label):
    request = imported_payload(client, images)
    request["source_label"] = label
    assert client.post("/api/imported-runs", json=request).status_code == 422


@pytest.mark.parametrize("kind", ["unknown", "original", "mask"])
def test_candidate_existence_and_kind(client, images, kind):
    request = imported_payload(client, images)
    request["candidate_images"][0] = (
        str(uuid4())
        if kind == "unknown"
        else request["source_image"]
        if kind == "original"
        else request["contract"]["change"]["mask"]
    )
    assert (
        client.post("/api/imported-runs", json=request).json()["error"]["code"] == "ASSET_NOT_FOUND"
    )


def test_size_mismatch_never_resized_or_queued(client, service, images):
    request = imported_payload(client, images)
    image = Image.new("RGB", (65, 64))
    uploaded = client.post(
        "/api/assets?kind=candidate", files={"file": ("c.png", png(image), "image/png")}
    ).json()
    request["candidate_images"][2] = uploaded["id"]
    response = client.post("/api/imported-runs", json=request)
    assert response.json()["error"]["code"] == "CANDIDATE_SIZE_MISMATCH"
    assert not service.repo.history()
    assert service.assets.load(uploaded["id"]).size == (65, 64)


def test_contract_rules_apply(client, images):
    request = imported_payload(client, images)
    request["contract"]["keep"] = []
    assert (
        client.post("/api/imported-runs", json=request).json()["error"]["code"] == "KEEP_REQUIRED"
    )
    request = imported_payload(client, images)
    request["contract"]["keep"][0]["mask"] = request["contract"]["change"]["mask"]
    assert client.post("/api/imported-runs", json=request).status_code == 400


def test_concurrent_import_dedup_and_conflict(client, service, images):
    request = CreateImportedRun.model_validate(imported_payload(client, images))
    with ThreadPoolExecutor(max_workers=6) as pool:
        ids = list(pool.map(lambda _: service.create_imported(request)["id"], range(12)))
    assert len(set(ids)) == 1
    assert wait_run(client, ids[0])["status"] == "completed"
    assert len(service.repo.history()) == 1
    changed = request.model_copy(update={"source_label": "Different attribution"})
    with pytest.raises(AppError, match="JOB_CONFLICT"):
        service.create_imported(changed)


def test_import_failure_retry_retains_assets_and_never_reimports(
    client, service, images, monkeypatch
):
    forbid_generation(service)
    request = imported_payload(client, images)
    saved_evaluate = service_module.evaluate

    def broken(*args):
        raise RuntimeError("private-secret-error")

    monkeypatch.setattr(service_module, "evaluate", broken)
    run = wait_run(client, client.post("/api/imported-runs", json=request).json()["id"])
    assert run["status"] == "failed_evaluation"
    assert "private-secret-error" not in str(run)
    ids = {c["image"] for c in run["candidates"]}
    assert ids == set(request["candidate_images"])
    for asset in ids:
        assert client.get(f"/api/assets/{asset}").status_code == 200
    monkeypatch.setattr(service_module, "evaluate", saved_evaluate)
    key = str(uuid4())
    assert (
        client.post(
            f"/api/runs/{run['id']}/retry-evaluation", json={"request_key": key}
        ).status_code
        == 202
    )
    recovered = wait_run(client, run["id"])
    assert recovered["status"] == "completed"
    assert {c["image"] for c in recovered["candidates"]} == ids
    assert recovered["provider_jobs"] == []
    assert (
        client.post(
            f"/api/runs/{run['id']}/retry-evaluation", json={"request_key": key}
        ).status_code
        == 202
    )


def test_queued_import_restart_skips_generating(tmp_path, images):
    service = ImageEditService(tmp_path)
    client = TestClient(create_app(service))
    request = imported_payload(client, images)
    run = service.create_imported(CreateImportedRun.model_validate(request))
    assert run["status"] == "queued"
    assert service.repo.next_job()["kind"] == "evaluation"
    restarted = ImageEditService(tmp_path)
    forbid_generation(restarted)
    states = []
    mutate = restarted.repo.mutate

    def recording(*args, **kwargs):
        if kwargs.get("status"):
            states.append(kwargs["status"])
        return mutate(*args, **kwargs)

    restarted.repo.mutate = recording
    with TestClient(create_app(restarted)) as client:
        assert wait_run(client, run["id"])["status"] == "completed"
    assert states == ["evaluating", "completed"]


@pytest.mark.parametrize(
    "name,mime,data",
    [
        ("candidate.jpg", "image/png", None),
        ("candidate.png", "text/html", None),
        ("candidate.png", "image/png", b"bad"),
    ],
)
def test_candidate_mime_extension_decode(client, images, name, mime, data):
    assert (
        client.post(
            "/api/assets?kind=candidate",
            files={"file": (name, png(images[0]) if data is None else data, mime)},
        ).status_code
        == 400
    )


def test_candidate_upload_strips_metadata_and_accepts_jpeg(client, service, images):
    buffer = io.BytesIO()
    info = PngImagePlugin.PngInfo()
    info.add_text("private", "must be stripped")
    images[0].save(buffer, format="PNG", pnginfo=info)
    for data, name, mime in [(buffer.getvalue(), "c.png", "image/png")]:
        uploaded = client.post("/api/assets?kind=candidate", files={"file": (name, data, mime)})
        assert uploaded.status_code == 201
        assert service.assets.load(uploaded.json()["id"]).info == {}
    buffer = io.BytesIO()
    images[0].save(buffer, format="JPEG")
    assert (
        client.post(
            "/api/assets?kind=candidate", files={"file": ("c.jpg", buffer.getvalue(), "image/jpeg")}
        ).status_code
        == 201
    )


@pytest.mark.parametrize(
    "extra", [{"url": "https://example.com/a.png"}, {"path": "/tmp/a.png"}, {"workflow": {}}]
)
def test_import_does_not_accept_execution_or_remote_inputs(client, images, extra):
    request = imported_payload(client, images)
    assert client.post("/api/imported-runs", json=request | extra).status_code == 422


@pytest.mark.parametrize("size", [(31, 64), (1537, 64)])
def test_candidate_dimension_upload_limits(client, size):
    assert (
        client.post(
            "/api/assets?kind=candidate",
            files={"file": ("c.png", png(Image.new("RGB", size)), "image/png")},
        ).status_code
        == 400
    )


def test_import_wrong_source_kind_and_mask_size_rejected(client, images):
    request = imported_payload(client, images)
    request["source_image"] = request["candidate_images"][0]
    assert (
        client.post("/api/imported-runs", json=request).json()["error"]["code"] == "ASSET_NOT_FOUND"
    )
    request = imported_payload(client, images)
    wrong_mask = client.post(
        "/api/assets?kind=mask",
        files={"file": ("mask.png", png(Image.new("L", (65, 64), 255)), "image/png")},
    ).json()["id"]
    request["contract"]["change"]["mask"] = wrong_mask
    assert (
        client.post("/api/imported-runs", json=request).json()["error"]["code"]
        == "MASK_SIZE_MISMATCH"
    )


def test_partial_import_retry_only_evaluates_failed_candidate(client, service, images, monkeypatch):
    forbid_generation(service)
    request = imported_payload(client, images)
    evaluator = service_module.evaluate
    calls = []

    def fail_once(*args):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("Controlled evaluation fault")
        return evaluator(*args)

    monkeypatch.setattr(service_module, "evaluate", fail_once)
    run = wait_run(client, client.post("/api/imported-runs", json=request).json()["id"])
    assert run["status"] == "partial"
    assert len([c for c in run["candidates"] if c["evaluation"]]) == 2
    saved = {c["id"]: (c["image"], c["ghost"]) for c in run["candidates"] if c["evaluation"]}
    assert (
        client.post(
            f"/api/runs/{run['id']}/retry-evaluation", json={"request_key": str(uuid4())}
        ).status_code
        == 202
    )
    recovered = wait_run(client, run["id"])
    assert recovered["status"] == "completed"
    assert len(calls) == 4
    assert saved == {
        c["id"]: (c["image"], c["ghost"]) for c in recovered["candidates"] if c["id"] in saved
    }
