import sqlite3
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest

from backend.candidate_plans import compile_plan
from backend.persistence import Repository
from backend.schemas import CreateRun
from backend.services import ImageEditService
from backend.tests.conftest import payload


def draft(client, images, *, checkpoint=False):
    body = payload(client, images)
    data = {"instruction": body["contract"]["change"]["instruction"], "keep_label": "Face"}
    if checkpoint:
        data["checkpoint"] = {
            "change": body["contract"]["change"]["mask"],
            "keep": body["contract"]["keep"][0]["mask"],
        }
        data["plan_fingerprint"] = compile_plan(data["instruction"])["fingerprint"]
    create = {"source_image": body["source_image"], "request_key": str(uuid4()), "data": data}
    result = client.post("/api/editing-drafts", json=create)
    assert result.status_code == 201, result.text
    return result.json(), create, body


def update(client, saved, data, key=None):
    return client.put(
        f"/api/editing-drafts/{saved['id']}",
        json={
            "expected_revision": saved["revision"],
            "mutation_key": key or str(uuid4()),
            "data": data,
        },
    )


def test_create_replay_update_cas_recent_replay_and_restart(client, service, images):
    saved, create, _ = draft(client, images)
    assert client.post("/api/editing-drafts", json=create).json()["id"] == saved["id"]
    assert client.post("/api/editing-drafts", json={**create, "data": {}}).status_code == 409
    data = {**saved["data"], "instruction": "New instruction"}
    key = str(uuid4())
    first = update(client, saved, data, key)
    assert first.status_code == 200 and first.json()["revision"] == 1
    assert update(client, saved, data, key).json() == first.json()
    assert update(client, saved, {**data, "instruction": "different"}, key).status_code == 409
    assert update(client, saved, data).status_code == 409
    latest = update(client, first.json(), {**data, "keep_label": "object"}).json()
    assert latest["revision"] == 2
    assert update(client, saved, data, key).status_code == 409
    assert ImageEditService(service.repo.path.parent).repo.editing_draft(saved["id"]) == latest


def test_atomic_submit_replay_different_key_and_readonly(client, service, images):
    saved, _, body = draft(client, images, checkpoint=True)
    body.update(
        editing_draft_id=saved["id"],
        expected_draft_revision=0,
        candidate_mode="strategy-v1",
        preview_fingerprint=saved["data"]["plan_fingerprint"],
    )
    response = client.post("/api/runs", json=body)
    assert response.status_code == 202, response.text
    run = response.json()
    assert client.post("/api/runs", json=body).json()["id"] == run["id"]
    assert client.post("/api/runs", json={**body, "request_key": str(uuid4())}).status_code == 409
    assert service.repo.editing_draft(saved["id"])["submitted_run_id"] == run["id"]
    assert update(client, saved, saved["data"]).status_code == 409


def test_submit_rolls_back_on_draft_registration_failure(client, service, images):
    saved, _, body = draft(client, images, checkpoint=True)
    body.update(
        editing_draft_id=saved["id"],
        expected_draft_revision=0,
        candidate_mode="strategy-v1",
        preview_fingerprint=saved["data"]["plan_fingerprint"],
    )
    with service.repo.connection() as db:
        db.execute(
            "CREATE TRIGGER fixture_failure BEFORE UPDATE ON editing_drafts "
            "BEGIN SELECT RAISE(ABORT, 'fixture'); END"
        )
    assert client.post("/api/runs", json=body).status_code == 503
    assert service.repo.history() == []
    assert service.repo.editing_draft(saved["id"])["submitted_run_id"] is None
    with service.repo.connection() as db:
        assert db.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] == 0


def test_contract_mismatch_stale_preparation_and_reference_guards(client, images):
    saved, _, body = draft(client, images, checkpoint=True)
    assert update(client, saved, {**saved["data"], "instruction": "Changed"}).status_code == 409
    body.update(
        editing_draft_id=saved["id"],
        expected_draft_revision=0,
        candidate_mode="strategy-v1",
        preview_fingerprint=saved["data"]["plan_fingerprint"],
    )
    body["contract"]["keep"][0]["threshold"] = 90
    assert client.post("/api/runs", json=body).status_code == 409
    for invalid in [
        {"checkpoint": {"change": body["source_image"]}},
        {"seed_masks": {"keep": str(uuid4())}},
        {
            "strokes": [
                {"mode": "change", "erase": False, "size": 10, "points": [{"x": 100, "y": 0}]}
            ]
        },
        {"locale": "zh-CN"},
        {"url": "https://evil.example"},
    ]:
        data = {**saved["data"], "checkpoint": {}, "plan_fingerprint": None, **invalid}
        assert update(client, saved, data).status_code in {404, 409, 422}


def test_concurrent_submit_only_one_provider_job(client, service, images):
    saved, _, body = draft(client, images, checkpoint=True)
    body.update(
        editing_draft_id=saved["id"],
        expected_draft_revision=0,
        candidate_mode="strategy-v1",
        preview_fingerprint=saved["data"]["plan_fingerprint"],
    )

    def submit(_):
        try:
            return service.create(CreateRun.model_validate({**body, "request_key": str(uuid4())}))
        except Exception as error:
            return error

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(submit, range(4)))
    assert sum(isinstance(r, dict) for r in results) == 1
    with service.repo.connection() as db:
        assert db.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] == 1


def test_fixture_v02_additive_upgrade_preserves_bytes(tmp_path):
    path = tmp_path / "fixture.sqlite3"
    with sqlite3.connect(path) as db:
        db.executescript(
            "CREATE TABLE assets(id TEXT PRIMARY KEY,kind TEXT,width INTEGER,height INTEGER);"
            "CREATE TABLE runs(id TEXT PRIMARY KEY,status TEXT,created_at TEXT,data TEXT);"
            "CREATE TABLE jobs(id TEXT PRIMARY KEY,run_id TEXT,request_key TEXT UNIQUE,"
            "payload_hash TEXT,kind TEXT,status TEXT,created_at TEXT);"
        )
        db.execute("INSERT INTO runs VALUES ('fixture','completed','date','{\"legacy\":true}')")
    Repository(path)
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT data FROM runs").fetchone()[0] == '{"legacy":true}'
        assert db.execute("SELECT COUNT(*) FROM editing_drafts").fetchone()[0] == 0


def test_two_views_cas_and_missing_file_preserve_snapshot(client, service, images):
    from backend.schemas import UpdateEditingDraft

    saved, _, _ = draft(client, images)

    def write(index):
        request = UpdateEditingDraft.model_validate(
            {
                "expected_revision": 0,
                "mutation_key": str(uuid4()),
                "data": {**saved["data"], "instruction": f"View {index}"},
            }
        )
        try:
            return service.update_editing_draft(saved["id"], request)
        except Exception as error:
            return error

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(write, range(4)))
    assert sum(isinstance(r, dict) for r in results) == 1
    latest = service.repo.editing_draft(saved["id"])
    service.assets.path(saved["source_image"]).unlink()
    assert (
        update(client, latest, {**latest["data"], "instruction": "missing source"}).status_code
        == 404
    )
    assert service.repo.editing_draft(saved["id"]) == latest


def test_strict_point_budget_and_draft_body_limit(client, images):
    saved, _, _ = draft(client, images)
    point = {"mode": "change", "erase": False, "size": 1, "points": [{"x": 2, "y": 2}]}
    for strokes in [[point] * 1025, [{**point, "points": [{"x": 1, "y": 1}] * 10001}]]:
        assert update(client, saved, {**saved["data"], "strokes": strokes}).status_code == 422
    oversized = '{"instruction":"' + "x" * (1024 * 1024) + '"}'
    assert (
        client.put(
            f"/api/editing-drafts/{saved['id']}",
            content=oversized,
            headers={"Content-Type": "application/json"},
        ).status_code
        == 413
    )
    assert (
        client.post(
            "/api/candidate-plans",
            content="x" * 64001,
            headers={"Content-Type": "application/json"},
        ).status_code
        == 413
    )
    assert client.get(f"/api/editing-drafts/{saved['id']}").json() == saved


def test_fixture_migration_failure_has_no_partial_schema_and_backup_restore(tmp_path, monkeypatch):
    import shutil

    path = tmp_path / "fixture.sqlite3"
    with sqlite3.connect(path) as db:
        db.executescript(
            "CREATE TABLE runs(id TEXT PRIMARY KEY,status TEXT,created_at TEXT,data TEXT);"
            "INSERT INTO runs VALUES ('fixture','completed','date','legacy-bytes');"
        )
    backup = tmp_path / "prior.sqlite3"
    db.close()
    shutil.copyfile(path, backup)
    # SQLite IF NOT EXISTS also tolerates a same-named view; authorizer injects a real
    # failure at the last CREATE without changing application SQL or real data.
    connect = sqlite3.connect

    def denied(*args, **kwargs):
        db = connect(*args, **kwargs)
        db.set_authorizer(
            lambda action, name, *_: (
                sqlite3.SQLITE_DENY
                if action == sqlite3.SQLITE_CREATE_TABLE and name == "editing_drafts"
                else sqlite3.SQLITE_OK
            )
        )
        return db

    with monkeypatch.context() as patch:
        patch.setattr(sqlite3, "connect", denied)
        with pytest.raises(sqlite3.DatabaseError):
            Repository(path)
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT name FROM sqlite_master WHERE name='assets'").fetchone() is None
        assert db.execute("SELECT data FROM runs").fetchone()[0] == "legacy-bytes"
    db.close()
    # Stop/restore fixture backup, rather than destructive down-migration.
    for suffix in ("-wal", "-shm"):
        path.with_name(path.name + suffix).unlink(missing_ok=True)
    shutil.copyfile(backup, path)
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT data FROM runs").fetchone()[0] == "legacy-bytes"
        assert (
            db.execute("SELECT name FROM sqlite_master WHERE name='editing_drafts'").fetchone()
            is None
        )
    db.close()
