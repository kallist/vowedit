import json
import secrets
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient as AnonymousClient

from backend.agent_auth import register, token_digest
from backend.agent_schemas import (
    CreateEdit,
    Decision,
    DraftPatch,
    GenerateAction,
    ProposeContract,
    SelectionAction,
    action_adapter,
)
from backend.agent_services import AgentService
from backend.api import create_app
from backend.persistence import Repository
from backend.schemas import AppError, EditContract, Review
from backend.tests.conftest import payload


class ScopedFixture(tuple):
    def __repr__(self):
        return "Scoped Agent fixture (credential redacted)"


@pytest.fixture
def agent(service):
    principal = str(uuid4())
    token = secrets.token_hex(32)
    register(service.repo, token, principal)
    return ScopedFixture((AgentService(service), principal, token))


def ready(client, images, agent):
    svc, principal, _ = agent
    original = payload(client, images)
    draft = svc.create(principal, CreateEdit(request_key=uuid4()))
    saved = svc.patch(
        draft["id"],
        DraftPatch(
            expected_revision=0,
            request_key=uuid4(),
            source_asset_id=original["source_image"],
            contract=EditContract.model_validate(original["contract"]),
        ),
    )
    svc.presented(saved["id"], saved["revision"])
    request = GenerateAction(
        action="generate",
        draft_id=saved["id"],
        expected_revision=saved["revision"],
        provider="mock",
        plan_fingerprint=saved["plan"]["fingerprint"],
        request_key=uuid4(),
    )
    return svc, principal, saved, request


def rows(service, table):
    with service.repo.connection() as db:
        return db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def test_awaiting_image_replay_scoped_and_no_job(agent, service):
    svc, principal, _ = agent
    request = CreateEdit(request_key=uuid4())
    draft = svc.create(principal, request)
    assert draft["status"] == "awaiting_image"
    assert svc.create(principal, request)["id"] == draft["id"]
    assert draft["ui_url"].endswith(f"/drafts/{draft['id']}")
    assert rows(service, "jobs") == 0
    other = str(uuid4())
    register(service.repo, secrets.token_hex(32), other)
    with pytest.raises(AppError, match="FORBIDDEN_RESOURCE"):
        svc.get_edit(other, draft["id"])


def test_proposal_does_not_overwrite_and_reject_never_queues(client, images, agent, service):
    svc, principal, draft, _ = ready(client, images, agent)
    proposal = ProposeContract(
        draft_id=draft["id"],
        expected_revision=draft["revision"],
        request_key=uuid4(),
        instruction="Paint the center blue",
        change={"kind": "rectangles", "rectangles": [{"x0": 24, "y0": 24, "x1": 48, "y1": 48}]},
    )
    action = svc.propose(principal, proposal)
    assert svc.get_edit(principal, draft["id"])["contract"] == draft["contract"]
    assert action["frozen"]["contract"]["change"]["mask"] != draft["contract"]["change"]["mask"]
    decision = Decision(decision_key=uuid4(), accept=False)
    assert svc.decide(action["id"], decision)["state"] == "rejected"
    assert svc.decide(action["id"], decision)["state"] == "rejected"
    assert rows(service, "jobs") == 0


def test_accept_same_mask_preview_then_generate_once(client, images, agent, service):
    svc, principal, draft, _ = ready(client, images, agent)
    proposal = ProposeContract(
        draft_id=draft["id"],
        expected_revision=draft["revision"],
        request_key=uuid4(),
        instruction="Paint the center blue",
        change={"kind": "rectangles", "rectangles": [{"x0": 24, "y0": 24, "x1": 48, "y1": 48}]},
    )
    action = svc.propose(principal, proposal)
    svc.decide(action["id"], Decision(decision_key=uuid4(), accept=True))
    saved = svc.get_edit(principal, draft["id"])
    assert saved["contract"] == action["frozen"]["contract"]
    assert saved["revision"] == draft["revision"] + 1
    assert rows(service, "jobs") == 0
    svc.presented(saved["id"], saved["revision"])
    request = GenerateAction(
        action="generate",
        draft_id=saved["id"],
        expected_revision=saved["revision"],
        plan_fingerprint=saved["plan"]["fingerprint"],
        provider="mock",
        request_key=uuid4(),
    )
    pending = svc.request(principal, request)
    assert rows(service, "jobs") == 0
    decision = Decision(decision_key=uuid4(), accept=True)
    applied = svc.decide(pending["id"], decision)
    assert applied["state"] == "applied"
    assert svc.decide(pending["id"], decision)["result_ids"] == applied["result_ids"]
    assert svc.request(principal, request)["state"] == "applied"
    assert rows(service, "jobs") == 1
    run = service.repo.get(applied["result_ids"]["run_id"])
    entries = svc.activity(principal, "draft", draft["id"], 0, 100)["entries"]
    assert not any(e["event"] == "action_stale" and
                   e["action_id"] == action["id"] for e in entries)
    accepted = next(e["cursor"] for e in entries if e["event"] == "user_accepted" and
                    e["action_id"] == pending["id"])
    queued = next(e["cursor"] for e in entries if e["event"] == "generation_queued")
    assert accepted < queued
    run_entries = svc.activity(principal, "run", run["id"], 0, 100)["entries"]
    assert any(e["event"] == "user_accepted" for e in run_entries)
    assert run["contract"] == saved["contract"]


@pytest.mark.parametrize(
    "change",
    [
        {"kind": "rectangles", "rectangles": []},
        {"kind": "rectangles", "rectangles": [{"x0": 1.5, "y0": 0, "x1": 2, "y1": 2}]},
        {"kind": "rectangles", "rectangles": [{"x0": 1, "y0": 0, "x1": 1, "y1": 2}]},
        {"kind": "asset", "asset_id": str(uuid4()), "rectangles": []},
    ],
)
def test_mask_schema_rejects_malformed(change):
    with pytest.raises(ValueError):
        ProposeContract(
            draft_id=uuid4(),
            expected_revision=0,
            request_key=uuid4(),
            instruction="Edit the center",
            change=change,
        )


def test_mask_bounds_overlap_and_ownership(client, images, agent):
    svc, principal, draft, _ = ready(client, images, agent)
    proposal = dict(
        draft_id=draft["id"],
        expected_revision=draft["revision"],
        request_key=uuid4(),
        instruction="Edit center",
        change={"kind": "rectangles", "rectangles": [{"x0": 24, "y0": 24, "x1": 65, "y1": 48}]},
    )
    with pytest.raises(AppError, match="INVALID_MASK"):
        svc.propose(principal, ProposeContract.model_validate(proposal))
    proposal["change"]["rectangles"][0]["x1"] = 48
    proposal["keep"] = [{"label": "KEEP", "mask": proposal["change"]}]
    with pytest.raises(AppError, match="MASK_OVERLAP"):
        svc.propose(principal, ProposeContract.model_validate(proposal))
    unrelated = payload(client, images)["source_image"]
    with pytest.raises(AppError, match="FORBIDDEN_RESOURCE"):
        svc.create(principal, CreateEdit(request_key=uuid4(), source_asset_id=unrelated))


def test_patch_cas_keys_source_replacement_preserves_evidence(client, images, agent):
    svc, principal, draft, _ = ready(client, images, agent)
    patch = DraftPatch(
        expected_revision=draft["revision"],
        request_key=uuid4(),
        contract=EditContract.model_validate(draft["contract"]),
    )
    saved = svc.patch(draft["id"], patch)
    assert svc.patch(draft["id"], patch)["revision"] == saved["revision"]
    with pytest.raises(AppError, match="IDEMPOTENCY_CONFLICT"):
        svc.patch(draft["id"], patch.model_copy(update={"provider": "comfyui"}))
    with pytest.raises(AppError, match="REVISION_CONFLICT"):
        svc.patch(draft["id"], patch.model_copy(update={"request_key": uuid4()}))
    source = payload(client, images)["source_image"]
    fork = svc.patch(
        draft["id"],
        DraftPatch(
            expected_revision=saved["revision"], request_key=uuid4(), source_asset_id=source
        ),
    )
    assert fork["id"] != draft["id"] and fork["contract"] is None
    assert svc.get_edit(principal, draft["id"])["source_asset_id"] == draft["source_asset_id"]


@pytest.mark.parametrize("reason", ["reject", "expire", "edit", "config", "pixels"])
def test_pending_gates_never_queue(client, images, agent, service, reason):
    svc, principal, draft, request = ready(client, images, agent)
    action = svc.request(principal, request)
    if reason == "expire":
        action["expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        svc._save_action(action)
    elif reason == "edit":
        svc.patch(
            draft["id"],
            DraftPatch(
                expected_revision=draft["revision"],
                request_key=uuid4(),
                contract=EditContract.model_validate(draft["contract"]),
            ),
        )
    elif reason == "config":
        service.providers["mock"].timeout = 1
    elif reason == "pixels":
        image = service.assets.load(draft["source_asset_id"])
        image.putpixel((0, 0), (0, 0, 0))
        image.save(service.assets.path(draft["source_asset_id"]))
    result = svc.decide(action["id"], Decision(decision_key=uuid4(), accept=reason != "reject"))
    assert result["state"] == {"reject": "rejected", "expire": "expired"}.get(reason, "stale")
    assert rows(service, "jobs") == 0


def test_competing_decisions_have_one_job(client, images, agent, service):
    svc, principal, _, request = ready(client, images, agent)
    action = svc.request(principal, request)

    def decide(_):
        try:
            return svc.decide(action["id"], Decision(decision_key=uuid4(), accept=True))["state"]
        except AppError as exc:
            return exc.code

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(decide, range(2)))
    assert sorted(results) == ["DECISION_ALREADY_APPLIED", "applied"]
    assert rows(service, "jobs") == 1


def test_approval_activity_failure_rolls_back_run_job_draft(client, images, agent, service):
    svc, principal, draft, request = ready(client, images, agent)
    action = svc.request(principal, request)
    with service.repo.connection() as db:
        db.execute(
            "CREATE TRIGGER fail_approval BEFORE INSERT ON activity_entries "
            "WHEN NEW.event='user_accepted' BEGIN SELECT RAISE(ABORT,'fixture'); END"
        )
    decision = Decision(decision_key=uuid4(), accept=True)
    with pytest.raises(sqlite3.IntegrityError):
        svc.decide(action["id"], decision)
    assert rows(service, "jobs") == rows(service, "runs") == 0
    assert svc.get_edit(principal, draft["id"])["submitted_run_id"] is None
    with service.repo.connection() as db:
        db.execute("DROP TRIGGER fail_approval")
    assert svc.decide(action["id"], decision)["state"] == "applied"
    assert rows(service, "jobs") == 1


def test_authorization_role_matrix_invalid_bearer_never_downgrades(client, agent, service):
    _, _, token = agent
    raw = AnonymousClient(create_app(service))
    for path in ["/api/runs", "/api/assets/" + str(uuid4())]:
        assert raw.get(path).status_code == 401
    assert raw.post("/api/browser-session").status_code == 401
    headers = {"Authorization": f"Bearer {token}", "Origin": "http://127.0.0.1:3000"}
    for path in [
        "/api/runs",
        "/api/imported-runs",
        "/api/prepared-candidates",
        f"/api/agent-actions/{uuid4()}/decision",
        "/api/browser-session",
        f"/api/runs/{uuid4()}/retry-generation",
        f"/api/runs/{uuid4()}/continuations",
    ]:
        assert raw.post(path, json={}, headers=headers).status_code == 403
    for path in [
        f"/api/runs/{uuid4()}/selection",
        f"/api/runs/{uuid4()}/candidates/{uuid4()}/review",
    ]:
        assert raw.put(path, json={}, headers=headers).status_code == 403
    assert client.get("/api/config", headers={"Authorization": "Bearer invalid"}).status_code == 401
    assert (
        client.post(
            "/api/agent-actions/" + str(uuid4()) + "/decision",
            json={},
            headers={"X-Vowedit-CSRF": "wrong"},
        ).status_code
        == 403
    )


def test_revocation_nested_assets_and_no_secret_in_context(client, images, agent):
    svc, principal, token = agent
    _, _, draft, _ = ready(client, images, agent)
    svc.authorize(principal, "asset", draft["source_asset_id"])
    unrelated = payload(client, images)["source_image"]
    with pytest.raises(AppError, match="FORBIDDEN_RESOURCE"):
        svc.authorize(principal, "asset", unrelated)
    output = json.dumps(svc.get_edit(principal, draft["id"]))
    assert token not in output and token_digest(token) not in output
    with svc.repo.transaction() as db:
        db.execute("UPDATE agent_credentials SET revoked=1 WHERE id=?", (principal,))
    assert (
        client.get(
            "/api/agent/capabilities", headers={"Authorization": f"Bearer {token}"}
        ).status_code
        == 401
    )


def test_migration_isolated_legacy_and_reentrant(tmp_path):
    database = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(database) as db:
        db.execute(
            "CREATE TABLE assets(id TEXT PRIMARY KEY,kind TEXT,width INTEGER,height INTEGER)"
        )
        db.execute("INSERT INTO assets VALUES ('fixture','original',64,64)")
    repo = Repository(database)
    assert repo.asset("fixture")["width"] == 64
    Repository(database)
    with repo.connection() as db:
        assert db.execute("SELECT count(*) FROM editing_drafts").fetchone()[0] == 0


def test_migration_failure_rolls_back_and_controlled_backup_restores(tmp_path, monkeypatch):
    import shutil

    database = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(database) as db:
        db.execute(
            "CREATE TABLE assets(id TEXT PRIMARY KEY,kind TEXT,width INTEGER,height INTEGER)"
        )
        db.execute("INSERT INTO assets VALUES ('fixture','original',64,64)")
    backup = tmp_path / "controlled-backup.sqlite3"
    shutil.copyfile(database, backup)
    original = sqlite3.connect

    class FailingConnection(sqlite3.Connection):
        def execute(self, sql, *args, **kwargs):
            if "CREATE TABLE IF NOT EXISTS agent_action_requests" in sql:
                raise sqlite3.OperationalError("controlled migration fault")
            return super().execute(sql, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(
            sqlite3, "connect", lambda *a, **kw: original(*a, **kw, factory=FailingConnection)
        )
        with pytest.raises(sqlite3.OperationalError):
            Repository(database)
    with original(database) as db:
        assert not db.execute(
            "SELECT name FROM sqlite_master WHERE name='editing_drafts'"
        ).fetchone()
        assert db.execute("SELECT width FROM assets").fetchone()[0] == 64
    Repository(database)
    restored = tmp_path / "restored.sqlite3"
    shutil.copyfile(backup, restored)
    with original(restored) as db:
        assert db.execute("SELECT width FROM assets").fetchone()[0] == 64
        assert not db.execute(
            "SELECT name FROM sqlite_master WHERE name='editing_drafts'"
        ).fetchone()


def test_worker_checks_approved_config_before_spy_call(client, images, agent, service):
    # Stop worker first so the controlled queued batch cannot race this config change.
    service.close()
    svc, principal, _, request = ready(client, images, agent)
    calls = []
    original = service.providers["mock"].generate
    service.providers["mock"].generate = lambda r: (calls.append(r.index), original(r))[1]
    pending = svc.request(principal, request)
    applied = svc.decide(pending["id"], Decision(decision_key=uuid4(), accept=True))
    service.providers["mock"].timeout = 99
    service.process(service.repo.next_job())
    assert calls == []
    assert (
        service.repo.get(applied["result_ids"]["run_id"])["error"]["code"]
        == "APPROVAL_CONFIG_CHANGED"
    )


def test_saved_draft_restart_and_activity_cursor(client, images, agent, service):
    from backend.services import ImageEditService

    svc, principal, draft, request = ready(client, images, agent)
    pending = svc.request(principal, request)
    restarted = AgentService(ImageEditService(service.repo.path.parent))
    assert restarted.get_edit(principal, draft["id"])["contract"] == draft["contract"]
    assert restarted.action(principal, pending["id"])["state"] == "pending"
    first = restarted.activity(principal, "draft", draft["id"], 0, 1)
    second = restarted.activity(principal, "draft", draft["id"], first["next_cursor"], 100)
    cursors = [e["cursor"] for e in first["entries"] + second["entries"]]
    assert cursors == sorted(set(cursors))


def test_failed_mask_file_is_not_visible(client, images, agent, service, monkeypatch):
    svc, principal, draft, _ = ready(client, images, agent)
    before = rows(service, "assets")

    def failed(_):
        raise OSError("controlled file failure")

    monkeypatch.setattr(service.assets, "save", failed)
    with pytest.raises(OSError):
        svc.propose(
            principal,
            ProposeContract(
                draft_id=draft["id"],
                expected_revision=draft["revision"],
                request_key=uuid4(),
                instruction="Paint blue",
                change={"kind": "rectangles", "rectangles": [{"x0": 2, "y0": 2, "x1": 8, "y1": 8}]},
            ),
        )
    assert rows(service, "assets") == before
    assert svc.get_edit(principal, draft["id"])["contract"] == draft["contract"]


def test_action_union_forbids_agent_confirmations():
    with pytest.raises(ValueError):
        action_adapter.validate_python(
            {
                "action": "adopt",
                "run_id": str(uuid4()),
                "candidate_id": str(uuid4()),
                "expected_selection_revision": 0,
                "decision_fingerprint": "a" * 64,
                "request_key": str(uuid4()),
                "confirmations": ["review_pending"],
            }
        )


def test_review_change_stales_selection_and_continue_is_empty(client, images, agent, service):
    from backend.tests.test_integration import wait_run

    svc, principal, _, request = ready(client, images, agent)
    action = svc.request(principal, request)
    result = svc.decide(action["id"], Decision(decision_key=uuid4(), accept=True))
    run_id = result["result_ids"]["run_id"]
    run = wait_run(client, run_id)
    candidate = next(c for c in run["candidates"] if c["evaluation"]["eligible"])
    snapshot = svc.get_run(principal, run_id)
    adopt = svc.request(
        principal,
        SelectionAction(
            action="adopt",
            run_id=run_id,
            candidate_id=candidate["id"],
            expected_selection_revision=0,
            decision_fingerprint=snapshot["decision_fingerprint"],
            request_key=uuid4(),
        ),
    )
    service.review(run_id, candidate["id"], Review(verdict="pass"))
    assert svc.decide(adopt["id"], Decision(decision_key=uuid4(), accept=True))["state"] == "stale"
    snapshot = svc.get_run(principal, run_id)
    adopt = svc.request(
        principal,
        SelectionAction(
            action="adopt",
            run_id=run_id,
            candidate_id=candidate["id"],
            expected_selection_revision=0,
            decision_fingerprint=snapshot["decision_fingerprint"],
            request_key=uuid4(),
        ),
    )
    svc.decide(adopt["id"], Decision(decision_key=uuid4(), accept=True))
    snapshot = svc.get_run(principal, run_id)
    continuation = svc.request(
        principal,
        SelectionAction(
            action="continue",
            run_id=run_id,
            candidate_id=candidate["id"],
            expected_selection_revision=snapshot["revision"],
            decision_fingerprint=snapshot["decision_fingerprint"],
            request_key=uuid4(),
        ),
    )
    decision = Decision(decision_key=uuid4(), accept=True)
    with service.repo.connection() as db:
        db.execute(
            "CREATE TRIGGER fail_draft BEFORE INSERT ON editing_drafts "
            "BEGIN SELECT RAISE(ABORT,'fixture'); END"
        )
    with pytest.raises(sqlite3.IntegrityError):
        svc.decide(continuation["id"], decision)
    assert service.repo.get(run_id).get("continuation_starters", []) == []
    with service.repo.connection() as db:
        db.execute("DROP TRIGGER fail_draft")
    applied = svc.decide(continuation["id"], decision)
    assert svc.decide(continuation["id"], decision)["result_ids"] == applied["result_ids"]
    child = svc.get_edit(principal, applied["result_ids"]["draft_id"])
    assert child["contract"] is None and child["strokes"] == []
    assert child["parent_run_id"] == run_id
    assert svc.pixel_hash(child["source_asset_id"]) == svc.pixel_hash(candidate["image"])
    assert len(service.repo.get(run_id)["continuation_starters"]) == 1


def test_human_generation_uses_pending_card_and_scoped_result(client, images, agent, service):
    svc, principal, draft, request = ready(client, images, agent)
    response = client.post(
        f"/api/editing-drafts/{draft['id']}/generation-request",
        json=request.model_dump(mode="json"),
    )
    assert response.status_code == 200
    action = response.json()
    assert action["request_actor"] == "user" and action["state"] == "pending"
    assert rows(service, "jobs") == 0
    result = client.post(
        f"/api/agent-actions/{action['id']}/decision",
        json={"accept": True, "decision_key": str(uuid4())},
    ).json()
    assert result["state"] == "applied"
    assert rows(service, "jobs") == 1
    assert svc.get_run(principal, result["result_ids"]["run_id"])["provider"] == "mock"


def test_agent_evaluation_retry_never_regenerates(client, images, agent, service):
    from backend.agent_schemas import RetryAction
    from backend.tests.test_integration import wait_run

    svc, principal, _, request = ready(client, images, agent)
    action = svc.request(principal, request)
    run_id = svc.decide(action["id"], Decision(decision_key=uuid4(), accept=True))[
        "result_ids"
    ]["run_id"]
    completed = wait_run(client, run_id)
    entries = svc.activity(principal, "run", run_id, 0, 100)["entries"]
    assert not any(e["event"] == "user_reviewed" for e in entries)
    service.close()
    # Controlled failed-evaluation persisted fixture retains the generated pixels.
    service.repo.mutate(run_id, lambda r: r.update(status="failed_evaluation"))
    calls = []
    service.providers["mock"].generate = lambda r: calls.append(r.index)
    snapshot = svc.get_run(principal, run_id)
    retry = svc.request(principal, RetryAction(
        action="retry_evaluation", run_id=run_id,
        expected_state_fingerprint=snapshot["expected_state_fingerprint"], request_key=uuid4(),
    ))
    decision = Decision(decision_key=uuid4(), accept=True)
    svc.decide(retry["id"], decision)
    svc.decide(retry["id"], decision)
    service.process(service.repo.next_job())
    result = service.repo.get(run_id)
    assert result["status"] == "completed" and calls == []
    assert [c["image"] for c in result["candidates"]] == [
        c["image"] for c in completed["candidates"]
    ]


def test_shared_client_reads_do_not_expose_other_clients_actions(client, images, agent):
    svc, principal, draft, request = ready(client, images, agent)
    first = svc.request(principal, request)
    other, token = str(uuid4()), secrets.token_hex(32)
    register(svc.repo, token, other)
    headers = {"Authorization": f"Bearer {token}"}
    path = f"/api/agent/editing-drafts/{draft['id']}"
    assert client.get(path, headers=headers).status_code == 403
    assert client.post("/api/agent-grants", json={
        "client_id": other, "kind": "draft", "id": draft["id"],
    }).status_code == 200
    read = client.get(path, headers=headers)
    assert read.status_code == 200 and read.json()["pending_requests"] == []
    assert svc.action(principal, first["id"])["state"] == "pending"
    with pytest.raises(AppError, match="FORBIDDEN_RESOURCE"):
        svc.action(other, first["id"])


def test_generation_retry_needs_fresh_approval_and_replay_is_one_batch(
    client, images, agent, service,
):
    from backend.agent_schemas import RetryAction
    from backend.tests.test_integration import wait_run

    svc, principal, _, request = ready(client, images, agent)
    calls = []
    original = service.providers["mock"].generate

    def generate(value):
        calls.append(value.index)
        if len(calls) <= 1:
            raise AppError("PROVIDER_UNAVAILABLE", "Controlled Mock outage")
        return original(value)

    service.providers["mock"].generate = generate
    first = svc.request(principal, request)
    assert calls == []
    parent = svc.decide(first["id"], Decision(decision_key=uuid4(), accept=True))[
        "result_ids"
    ]["run_id"]
    failed = wait_run(client, parent)
    assert failed["status"] == "failed_generation" and len(calls) == 1
    snapshot = svc.get_run(principal, parent)
    payload = dict(action="retry_generation", run_id=parent,
                   expected_state_fingerprint=snapshot["expected_state_fingerprint"])
    rejected = svc.request(principal, RetryAction(**payload, request_key=uuid4()))
    svc.decide(rejected["id"], Decision(decision_key=uuid4(), accept=False))
    assert len(calls) == 1 and rows(service, "runs") == 1
    pending = svc.request(principal, RetryAction(**payload, request_key=uuid4()))
    assert len(calls) == 1
    decision = Decision(decision_key=uuid4(), accept=True)
    applied = svc.decide(pending["id"], decision)
    assert svc.decide(pending["id"], decision)["result_ids"] == applied["result_ids"]
    child = wait_run(client, applied["result_ids"]["run_id"])
    assert child["status"] == "completed" and len(calls) == 4
    assert rows(service, "runs") == 2 and service.repo.get(parent)["candidates"] == []
