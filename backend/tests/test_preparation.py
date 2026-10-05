import hashlib
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import numpy as np
import pytest
from PIL import Image

import backend.services as service_module
from backend.preparation import boundary_lock
from backend.schemas import PrepareCandidate
from backend.tests.conftest import png
from backend.tests.test_imported import forbid_generation, imported_payload
from backend.tests.test_integration import wait_run


def preparation_payload(client, images):
    request = imported_payload(client, images)
    raw = Image.new("RGB", (80, 96), (12, 30, 80))
    raw_id = client.post(
        "/api/assets?kind=candidate", files={"file": ("raw.png", png(raw), "image/png")}
    ).json()["id"]
    return request, {key: request[key] for key in ("source_image", "contract", "source_label")} | {
        "candidate_image": raw_id
    }


def test_binary_lock_preserves_outside_and_uses_normalized_inside(client, service, images):
    forbid_generation(service)
    _, request = preparation_payload(client, images)
    before = {
        i: service.assets.path(i).read_bytes()
        for i in (
            request["source_image"],
            request["candidate_image"],
            request["contract"]["change"]["mask"],
            request["contract"]["keep"][0]["mask"],
        )
    }
    first = client.post("/api/prepared-candidates", json=request)
    assert first.status_code == 201
    prepared = first.json()
    final = service.assets.load(prepared["id"])
    change = np.asarray(images[1]) >= 128
    pixels = np.asarray(final)
    assert final.size == images[0].size
    assert np.array_equal(pixels[~change], np.asarray(images[0])[~change])
    assert np.all(pixels[change] == (12, 30, 80))
    metadata = prepared["metadata"]
    assert metadata["raw_candidate_asset"] == request["candidate_image"]
    assert metadata["prepared_candidate_asset"] == prepared["id"]
    assert metadata["generation_source"] == "external"
    assert metadata["generation_source_label"] == request["source_label"]
    assert metadata["preparation"]["source_size"] == [80, 96]
    assert metadata["preparation"]["target_size"] == [64, 64]
    assert metadata["preparation"]["normalization"]["crop_box"] == [0, 8, 80, 88]
    assert metadata["preparation"]["change_mask"] == request["contract"]["change"]["mask"]
    second = client.post("/api/prepared-candidates", json=request).json()
    assert hashlib.sha256(service.assets.path(second["id"]).read_bytes()).digest() == (
        hashlib.sha256(service.assets.path(prepared["id"]).read_bytes()).digest()
    )
    for identifier, data in before.items():
        assert service.assets.path(identifier).read_bytes() == data
    assert service.repo.history() == []  # Preparation does not submit generation or evaluation.


def test_aspect_preserving_minimal_crop_and_exact_mask_admission(images):
    raw = Image.fromarray(
        np.random.default_rng(12).integers(0, 256, (1316, 1195, 3), dtype=np.uint8)
    )
    source = Image.new("RGB", (640, 704), (190, 130, 80))
    change = Image.new("L", source.size)
    change.paste(255, (100, 100, 200, 200))
    final, record = boundary_lock(source, raw, change)
    box = record["normalization"]["crop_box"]
    assert box == [0, 0.75, 1195, 1315.25]
    assert (box[2] - box[0]) / (box[3] - box[1]) == pytest.approx(640 / 704)
    normalized = raw.resize(source.size, Image.Resampling.LANCZOS, box=tuple(box))
    editable = np.asarray(change) >= 128
    assert np.array_equal(np.asarray(final)[editable], np.asarray(normalized)[editable])
    assert np.array_equal(np.asarray(final)[~editable], np.asarray(source)[~editable])


@pytest.mark.parametrize("problem", ["missing", "kind", "size", "overlap", "empty", "no-keep"])
def test_preparation_rejects_bad_contracts_without_assets(client, service, images, problem):
    _, request = preparation_payload(client, images)
    change = request["contract"]["change"]
    if problem == "missing":
        change["mask"] = str(uuid4())
    elif problem == "kind":
        change["mask"] = request["source_image"]
    elif problem in {"size", "empty"}:
        mask = Image.new("L", (32, 32) if problem == "size" else (64, 64))
        change["mask"] = client.post(
            "/api/assets?kind=mask", files={"file": ("mask.png", png(mask), "image/png")}
        ).json()["id"]
    elif problem == "overlap":
        request["contract"]["keep"][0]["mask"] = change["mask"]
    else:
        request["contract"]["keep"] = []
    files_before = set(service.assets.root.iterdir())
    assert client.post("/api/prepared-candidates", json=request).status_code in {400, 404}
    assert set(service.assets.root.iterdir()) == files_before
    assert service.repo.history() == []


@pytest.mark.parametrize("extra", ["url", "path", "normalization", "output_path", "metadata"])
def test_no_client_transform_or_external_reference(client, images, extra):
    _, request = preparation_payload(client, images)
    request[extra] = "untrusted"
    assert client.post("/api/prepared-candidates", json=request).status_code == 422


def test_prepared_import_uses_same_evaluator_ghost_receipt_and_retries(
    client, service, images, monkeypatch
):
    forbid_generation(service)
    imported, request = preparation_payload(client, images)
    prepared = [client.post("/api/prepared-candidates", json=request).json() for _ in range(3)]
    imported["candidate_images"] = [item["id"] for item in prepared]
    actual_evaluate = service_module.evaluate
    monkeypatch.setattr(
        service_module,
        "evaluate",
        lambda *args: (_ for _ in ()).throw(RuntimeError("controlled test failure")),
    )
    run = wait_run(client, client.post("/api/imported-runs", json=imported).json()["id"])
    assert run["status"] == "failed_evaluation"
    monkeypatch.setattr(service_module, "evaluate", actual_evaluate)
    monkeypatch.setattr(
        service_module,
        "boundary_lock",
        lambda *args: pytest.fail("Evaluation retry repeated preparation"),
    )
    client.post(f"/api/runs/{run['id']}/retry-evaluation", json={"request_key": str(uuid4())})
    run = wait_run(client, run["id"])
    assert run["status"] == "completed"
    assert run["provider_jobs"] == []
    assert [c["image"] for c in run["candidates"]] == imported["candidate_images"]
    for candidate in run["candidates"]:
        expected, ghost = actual_evaluate(
            images[0],
            service.assets.load(candidate["image"]),
            images[1],
            [images[2]],
            imported["contract"]["keep"],
            98,
        )
        assert candidate["evaluation"] == expected
        assert expected["unexpected_drift"] == 0
        assert expected["protected_similarity"] == 100
        assert service.assets.load(candidate["ghost"]).tobytes() == ghost.tobytes()
        assert not np.asarray(ghost)[:, :, 3].any()
        assert candidate["manual_review"]["verdict"] == "pending"
        assert candidate["seed"] is None
    receipt = client.get(f"/api/runs/{run['id']}/receipt").json()
    assert len(receipt["constraint_enforcement"]) == 3
    assert receipt["constraint_enforcement"][0]["prepared_candidate_asset"] == prepared[0]["id"]
    assert "Only pixels permitted by the CHANGE mask" in receipt["preparation_notice"]
    assert receipt["evaluation_source"] == "VowEdit rgb-mae-v1"
    assert service.assets.preparation(prepared[0]["id"]) == prepared[0]["metadata"]


@pytest.mark.parametrize("field", ["source_image", "change_mask", "source_label", "missing-record"])
def test_prepared_asset_cannot_lose_or_reassign_provenance(client, service, images, field):
    imported, request = preparation_payload(client, images)
    prepared = client.post("/api/prepared-candidates", json=request).json()
    imported["candidate_images"] = [prepared["id"]] * 3
    if field == "source_image":
        imported["source_image"] = client.post(
            "/api/assets?kind=original", files={"file": ("source.png", png(images[0]), "image/png")}
        ).json()["id"]
    elif field == "change_mask":
        imported["contract"]["change"]["mask"] = client.post(
            "/api/assets?kind=mask", files={"file": ("mask.png", png(images[1]), "image/png")}
        ).json()["id"]
    elif field == "source_label":
        imported["source_label"] = "Invented provenance"
    else:
        service.assets.path(prepared["id"]).with_suffix(".preparation.json").unlink()
    response = client.post("/api/imported-runs", json=imported)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == (
        "PREPARATION_UNAVAILABLE" if field == "missing-record" else "PREPARATION_CONFLICT"
    )
    assert service.repo.history() == []


def test_failed_provenance_write_never_registers_prepared_asset(
    client, service, images, monkeypatch
):
    _, request = preparation_payload(client, images)

    def fail(*args):
        raise OSError("disk full")

    monkeypatch.setattr(service.assets, "save_preparation", fail)
    assert client.post("/api/prepared-candidates", json=request).status_code == 503
    with service.repo.connection() as db:
        assert (
            db.execute("SELECT COUNT(*) FROM assets WHERE kind='prepared_candidate'").fetchone()[0]
            == 0
        )


def test_concurrent_preparation_is_independent_and_deterministic(client, service, images):
    _, request = preparation_payload(client, images)
    typed = PrepareCandidate.model_validate(request)
    with ThreadPoolExecutor(max_workers=3) as pool:
        prepared = list(pool.map(lambda _: service.prepare_candidate(typed), range(3)))
    assert len({item["id"] for item in prepared}) == 3
    assert len({service.assets.path(item["id"]).read_bytes() for item in prepared}) == 1
    for item in prepared:
        assert service.repo.asset(item["id"])["kind"] == "prepared_candidate"
        assert service.assets.preparation(item["id"]) == item["metadata"]
