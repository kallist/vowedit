"""Canonical drafts and bounded, human-decided commands over the existing service."""

import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from backend.agent_masks import materialize
from backend.agent_schemas import (
    ActionRequest,
    CreateEdit,
    Decision,
    DraftPatch,
    GenerateAction,
    ProposeContract,
    SelectionAction,
)
from backend.candidate_plans import compile_plan, fingerprint
from backend.persistence import now
from backend.reporting import issues, report
from backend.schemas import AppError, Continuation, CreateRun, EditContract, Selection
from backend.services import ImageEditService

FEATURES = [
    "editing-drafts-v1",
    "agent-proposals-v1",
    "human-actions-v1",
    "activity-v1",
    "candidate-plans-v1",
    "report-v2",
    "continuations-v1",
]


def web_port() -> int:
    port = int(os.getenv("VOWEDIT_WEB_PORT", "3000"))
    if not 1024 <= port <= 65535:
        raise ValueError("Invalid local Web port")
    return port


def ui_url(kind: str, identifier: str) -> str:
    from uuid import UUID

    route = {"draft": "drafts", "run": "edit"}[kind]
    return f"http://127.0.0.1:{web_port()}/{route}/{UUID(identifier)}"


def provider_binding(service: ImageEditService, name: str) -> dict[str, Any]:
    provider = service.providers.get(name)
    if provider is None:
        raise AppError("PROVIDER_UNAVAILABLE", "Provider is not configured.", 503)
    # Explicit non-secret allowlist. Never vars(provider), environment or credential hashes.
    config = {
        key: getattr(provider, key)
        for key in ("base_url", "checkpoint", "workflow_id", "api_origin", "timeout")
        if hasattr(provider, key)
    }
    if name in {"runninghub", "comfyui"}:
        graph = "z-image-inpaint-api.json" if name == "runninghub" else "inpaint-api.json"
        path = __import__("pathlib").Path(__file__).resolve().parent.parent / "workflows" / graph
        config["workflow_digest"] = hashlib.sha256(path.read_bytes()).hexdigest()
    recipient = str(config.get("api_origin", config.get("base_url", "local Mock")))
    return {
        "provider": name,
        "configuration_fingerprint": fingerprint(config),
        "recipient": recipient,
        "candidate_count": 3,
        "cost": "none" if name == "mock" else "unknown",
        "outbound": [] if name == "mock" else ["original", "CHANGE mask", "instructions"],
    }


class AgentService:
    def __init__(self, service: ImageEditService):
        self.service, self.repo = service, service.repo

    def authorize(self, principal: str, kind: str, identifier: str) -> None:
        if principal == "user":
            return
        with self.repo.connection() as db:
            row = db.execute(
                "SELECT grants,revoked FROM agent_credentials WHERE id=?", (principal,)
            ).fetchone()
            if not row or row["revoked"]:
                raise AppError("UNAUTHORIZED", "Configure an active local Agent client.", 401)
            grants = json.loads(row["grants"])
            if identifier in grants.get(kind, []):
                return
            # Only assets nested in explicitly granted contexts, including raw/prepared lineage.
            if kind == "asset":
                for draft_id in grants.get("draft", []):
                    draft = self._draft(draft_id)
                    if identifier in self._draft_assets(draft):
                        return
                for run_id in grants.get("run", []):
                    run = self.service.repo.get(run_id)
                    assets = {run["source_image"], run["contract"]["change"]["mask"]}
                    assets.update(k["mask"] for k in run["contract"]["keep"])
                    for c in run["candidates"]:
                        assets.update(str(c.get(k)) for k in ("image", "ghost"))
                        meta = c.get("generation_metadata", {})
                        assets.update(
                            str(meta.get(k))
                            for k in ("raw_candidate_asset", "prepared_candidate_asset")
                        )
                    if identifier in assets:
                        return
        raise AppError(
            "FORBIDDEN_RESOURCE", "This context has not been shared with this client.", 403
        )

    @staticmethod
    def _draft_assets(draft: dict[str, Any]) -> set[str]:
        assets = {str(draft.get("source_asset_id"))}
        if draft.get("contract"):
            assets.add(draft["contract"]["change"]["mask"])
            assets.update(k["mask"] for k in draft["contract"]["keep"])
        return assets

    def grant(self, principal: str, kind: str, identifier: str) -> None:
        with self.repo.connection() as db:
            row = db.execute(
                "SELECT grants,revoked FROM agent_credentials WHERE id=?", (principal,)
            ).fetchone()
            if not row or row["revoked"]:
                raise AppError("UNAUTHORIZED", "Client is unavailable.", 401)
            grants = json.loads(row[0])
            grants.setdefault(kind, [])
            if identifier not in grants[kind]:
                grants[kind].append(identifier)
            db.execute(
                "UPDATE agent_credentials SET grants=? WHERE id=?", (json.dumps(grants), principal)
            )

    def _draft(self, identifier: str) -> dict[str, Any]:
        with self.repo.connection() as db:
            row = db.execute("SELECT data FROM editing_drafts WHERE id=?", (identifier,)).fetchone()
        if not row:
            raise AppError("DRAFT_NOT_FOUND", "Editing draft not found.", 404)
        return json.loads(row[0])  # type: ignore[no-any-return]

    def _save_draft(self, draft: dict[str, Any]) -> None:
        with self.repo.connection() as db:
            db.execute(
                "INSERT INTO editing_drafts VALUES (?,?) ON CONFLICT(id) "
                "DO UPDATE SET data=excluded.data",
                (draft["id"], json.dumps(draft)),
            )

    @staticmethod
    def _cas(draft: dict[str, Any], revision: int) -> None:
        if draft["submitted_run_id"] or draft["revision"] != revision:
            raise AppError(
                "REVISION_CONFLICT", "Draft changed. Reload or preserve local edits.", 409
            )

    def _replay(self, principal: str, key: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        with self.repo.connection() as db:
            row = db.execute(
                "SELECT payload_hash,data FROM agent_action_requests "
                "WHERE principal=? AND request_key=?",
                (principal, key),
            ).fetchone()
        if row:
            if row[0] != fingerprint(payload):
                raise AppError("IDEMPOTENCY_CONFLICT", "Request key has another payload.", 409)
            return json.loads(row[1])  # type: ignore[no-any-return]
        return None

    def _record(self, principal: str, payload: dict[str, Any], data: dict[str, Any]) -> None:
        with self.repo.connection() as db:
            db.execute(
                "INSERT INTO agent_action_requests VALUES (?,?,?,?,?)",
                (
                    data["id"],
                    principal,
                    payload["request_key"],
                    fingerprint(payload),
                    json.dumps(data),
                ),
            )

    def _save_action(self, action: dict[str, Any]) -> None:
        with self.repo.connection() as db:
            db.execute(
                "UPDATE agent_action_requests SET data=? WHERE id=?",
                (json.dumps(action), action["id"]),
            )

    def _new_draft(
        self, source: str | None, principal: str, starter: str | None = None
    ) -> dict[str, Any]:
        draft: dict[str, Any] = dict(
            id=str(uuid4()),
            revision=0,
            instruction="",
            source_asset_id=source,
            contract=None,
            provider="mock",
            strokes=[],
            submitted_run_id=None,
            starter_id=starter,
            presented_revision=None,
            created_at=now(),
        )
        if starter:
            lineage = self.service.draft(starter)
            draft.update({key: lineage[key] for key in
                          ("parent_run_id", "parent_candidate_id", "root_run_id")})
        self._save_draft(draft)
        if principal != "user":
            self.grant(principal, "draft", draft["id"])
        with self.repo.connection() as db:
            self.repo.activity(
                db,
                "draft_created",
                "system" if starter else "agent" if principal != "user" else "user",
                draft_id=draft["id"],
            )
        return draft

    def create(self, principal: str, request: CreateEdit) -> dict[str, Any]:
        payload = request.model_dump(mode="json")
        with self.repo.transaction():
            replay = self._replay(principal, str(request.request_key), payload)
            if replay:
                return self.get_edit(principal, replay["draft_id"])
            source = str(request.source_asset_id) if request.source_asset_id else None
            if source:
                self.authorize(principal, "asset", source)
                self.repo.asset(source, "original")
            draft = self._new_draft(source, principal)
            self._record(
                principal,
                payload,
                dict(
                    id=str(uuid4()),
                    action="create",
                    state="applied",
                    draft_id=draft["id"],
                    result_ids={},
                ),
            )
            return self.get_edit(principal, draft["id"])

    def get_edit(self, principal: str, identifier: str) -> dict[str, Any]:
        self.authorize(principal, "draft", identifier)
        with self.repo.transaction() as db:
            draft = self._draft(identifier)
            actions = db.execute(
                "SELECT data FROM agent_action_requests WHERE "
                "json_extract(data,'$.draft_id')=? AND "
                "json_extract(data,'$.action') NOT IN ('create','save') "
                "AND (?='user' OR principal=?) ORDER BY rowid DESC LIMIT 100",
                (identifier, principal, principal),
            ).fetchall()
            pending = [self.action(principal, json.loads(r[0])["id"]) for r in actions]
            plan = (
                compile_plan(draft["contract"]["change"]["instruction"])
                if draft["contract"]
                else None
            )
            dimensions = (
                self.repo.asset(draft["source_asset_id"], "original")
                if draft["source_asset_id"]
                else None
            )
            return {
                **draft,
                "draft_id": identifier,
                "context_kind": "draft",
                "context_id": identifier,
                "source_dimensions": dimensions,
                "pending_requests": pending,
                "plan": plan,
                "status": "submitted"
                if draft["submitted_run_id"]
                else "editing"
                if dimensions
                else "awaiting_image",
                "approval_state": "pending"
                if any(a["state"] == "pending" for a in pending)
                else "none",
                "ui_mode": "web-fallback",
                "ui_url": ui_url("draft", identifier),
                "next_step": "Open the exact draft in VowEdit to review and confirm.",
            }

    def patch(self, identifier: str, request: DraftPatch) -> dict[str, Any]:
        payload = {"draft_id": identifier, **request.model_dump(mode="json")}
        if len(json.dumps(payload).encode()) > 65536:
            raise AppError("INVALID_INPUT", "Saved strokes exceed the 64 KB context limit.", 422)
        with self.repo.transaction() as db:
            replay = self._replay("user", str(request.request_key), payload)
            if replay:
                return self.get_edit("user", replay["draft_id"])
            draft = self._draft(identifier)
            self._cas(draft, request.expected_revision)
            source = (
                str(request.source_asset_id)
                if request.source_asset_id
                else draft["source_asset_id"]
            )
            if source:
                self.repo.asset(source, "original")
            if draft["source_asset_id"] and source != draft["source_asset_id"]:
                # Source replacement forks; old source, masks and evidence remain recoverable.
                draft = self._new_draft(source, "user")
            draft.update(
                source_asset_id=source,
                provider=request.provider,
                contract=request.contract.model_dump(mode="json") if request.contract else None,
                instruction=request.contract.change.instruction
                if request.contract
                else request.instruction,
                strokes=[stroke.model_dump(mode="json") for stroke in request.strokes],
            )
            if request.contract:
                self._validate_contract(draft)
            draft["revision"] += 1
            draft["presented_revision"] = None
            self.repo.stale_actions(db, draft_id=identifier)
            self._save_draft(draft)
            self.repo.activity(db, "user_saved", "user", draft_id=draft["id"])
            self._record(
                "user",
                payload,
                dict(
                    id=str(uuid4()),
                    action="save",
                    state="applied",
                    draft_id=draft["id"],
                    result_ids={},
                ),
            )
            return self.get_edit("user", draft["id"])

    def _validate_contract(self, draft: dict[str, Any]) -> None:
        if not draft["source_asset_id"]:
            raise AppError("SOURCE_REQUIRED", "Attach an original in VowEdit first.", 409)
        contract = EditContract.model_validate(draft["contract"])
        self.repo.asset(str(contract.change.mask), "mask")
        for rule in contract.keep:
            self.repo.asset(str(rule.mask), "mask")
        from backend.evaluation import validate_masks

        validate_masks(
            self.service.assets.load(draft["source_asset_id"]),
            self.service.assets.load(str(contract.change.mask)),
            [self.service.assets.load(str(r.mask)) for r in contract.keep],
        )

    def binding(self, draft: dict[str, Any]) -> dict[str, Any]:
        self._validate_contract(draft)
        return {
            "revision": draft["revision"],
            "source_and_masks": {
                identifier: self.pixel_hash(identifier) for identifier in self._draft_assets(draft)
            },
            "contract": draft["contract"],
            "plan": compile_plan(draft["contract"]["change"]["instruction"]),
            **provider_binding(self.service, draft["provider"]),
        }

    def pixel_hash(self, identifier: str) -> str:
        image = self.service.assets.load(identifier)
        return hashlib.sha256(str((image.mode, image.size)).encode() + image.tobytes()).hexdigest()

    def run_fingerprint(self, run: dict[str, Any]) -> str:
        return fingerprint(
            {
                "contract": run["contract"],
                "plan": run.get("candidate_plan"),
                "provider": run["provider"],
                "source_and_masks": {
                    i: self.pixel_hash(i)
                    for i in self._draft_assets(
                        {"source_asset_id": run["source_image"], "contract": run["contract"]}
                    )
                },
                "status": run["status"],
                "job_id": run["job_id"],
                "selection_revision": run["selection_revision"],
                "selection": run["user_selected_candidate_id"],
                "candidates": [
                    {
                        "id": c["id"],
                        "pixels": self.pixel_hash(c["image"]),
                        "evaluation": c["evaluation"],
                        "review": c["manual_review"],
                    }
                    for c in run["candidates"]
                ],
            }
        )

    def propose(self, principal: str, request: ProposeContract) -> dict[str, Any]:
        identifier = str(request.draft_id)
        self.authorize(principal, "draft", identifier)
        payload = request.model_dump(mode="json")
        with self.repo.transaction() as db:
            replay = self._replay(principal, str(request.request_key), payload)
            if replay:
                return self.action(principal, replay["id"])
            draft = self._draft(identifier)
            self._cas(draft, request.expected_revision)
            if not draft["source_asset_id"]:
                raise AppError("SOURCE_REQUIRED", "Attach an original in VowEdit first.", 409)
            contract = materialize(
                self.service,
                draft["source_asset_id"],
                request,
                lambda asset: self.authorize(principal, "asset", asset),
            )
            action = self._pending(
                principal,
                "accept_contract",
                draft_id=identifier,
                frozen={
                    "revision": draft["revision"],
                    "contract": contract,
                    "source_pixels": self.pixel_hash(draft["source_asset_id"]),
                    "mask_pixels": {
                        i: self.pixel_hash(i)
                        for i in self._draft_assets(
                            {"contract": contract, "source_asset_id": draft["source_asset_id"]}
                        )
                    },
                },
            )
            self._record(principal, payload, action)
            self.repo.activity(
                db, "proposal_submitted", "agent", draft_id=identifier, action_id=action["id"]
            )
            return self.action(principal, action["id"])

    @staticmethod
    def _pending(principal: str, action: str, **values: Any) -> dict[str, Any]:
        return {
            "id": str(uuid4()),
            "principal": principal,
            "action": action,
            "state": "pending",
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            "result_ids": {},
            **values,
        }

    def request(self, principal: str, request: ActionRequest) -> dict[str, Any]:
        kind = "draft" if isinstance(request, GenerateAction) else "run"
        identifier = str(
            request.draft_id if isinstance(request, GenerateAction) else request.run_id
        )
        self.authorize(principal, kind, identifier)
        payload = request.model_dump(mode="json")
        with self.repo.transaction():
            replay = self._replay(principal, str(request.request_key), payload)
            if replay:
                return self.action(principal, replay["id"])
            if isinstance(request, GenerateAction):
                draft = self._draft(identifier)
                self._cas(draft, request.expected_revision)
                frozen = self.binding(draft)
                if (
                    request.plan_fingerprint != frozen["plan"]["fingerprint"]
                    or request.provider != draft["provider"]
                ):
                    raise AppError("ACTION_STALE", "Review the current saved plan.", 409)
            else:
                run = self.repo.get(identifier)
                frozen = {"run_fingerprint": self.run_fingerprint(run)}
                expected = (
                    request.decision_fingerprint
                    if isinstance(request, SelectionAction)
                    else request.expected_state_fingerprint
                )
                if expected != frozen["run_fingerprint"]:
                    raise AppError("ACTION_STALE", "Run changed. Read it again.", 409)
                if isinstance(request, SelectionAction):
                    if request.expected_selection_revision != run["selection_revision"]:
                        raise AppError("REVISION_CONFLICT", "Selection changed.", 409)
                    candidate = next(
                        (c for c in run["candidates"] if c["id"] == str(request.candidate_id)), None
                    )
                    if not candidate:
                        raise AppError("CANDIDATE_MISSING", "Candidate not found.", 404)
                    if (
                        request.action == "continue"
                        and run["user_selected_candidate_id"] != candidate["id"]
                    ):
                        raise AppError("SELECTION_CONFLICT", "Adopt this candidate first.", 409)
                    frozen.update(
                        candidate_id=candidate["id"],
                        candidate_asset=candidate["image"],
                        candidate_index=candidate["index"],
                        evaluation=candidate.get("evaluation"),
                        manual_review=candidate.get("manual_review"),
                        selection_revision=run["selection_revision"],
                        required_confirmations=issues(candidate),
                    )
                elif request.action == "retry_generation":
                    frozen.update(provider_binding(self.service, run["provider"]))
                    frozen.update(contract=run["contract"], plan=run.get("candidate_plan"))
            action = self._pending(
                principal, request.action, frozen=frozen, **{f"{kind}_id": identifier}
            )
            self._record(principal, payload, action)
            with self.repo.connection() as db:
                self.repo.activity(
                    db,
                    "action_requested",
                    "user" if principal == "user" else "agent",
                    action_id=action["id"],
                    **{f"{kind}_id": identifier},
                    facts={"action": request.action},
                )
            return self.action(principal, action["id"])

    def action(self, principal: str, identifier: str) -> dict[str, Any]:
        with self.repo.transaction() as db:
            row = db.execute(
                "SELECT data FROM agent_action_requests WHERE id=?", (identifier,)
            ).fetchone()
            if not row:
                raise AppError("ACTION_NOT_FOUND", "Action not found.", 404)
            action = json.loads(row[0])
            if principal != "user" and principal != action["principal"]:
                raise AppError("FORBIDDEN_RESOURCE", "Action belongs to another client.", 403)
            kind = "draft" if action.get("draft_id") else "run"
            self.authorize(principal, kind, action[f"{kind}_id"])
            if action["state"] == "pending":
                reason = self._invalid(action)
                if reason:
                    action["state"] = reason
                    self._save_action(action)
                    self.repo.activity(
                        db,
                        f"action_{reason}",
                        "system",
                        action_id=identifier,
                        **{f"{kind}_id": action[f"{kind}_id"]},
                    )
            return {
                **action,
                "action_id": identifier,
                "action_state": action["state"],
                "request_actor": "user" if action["principal"] == "user" else "agent",
                "context_kind": kind,
                "context_id": action[f"{kind}_id"],
                "ui_url": ui_url(kind, action[f"{kind}_id"]),
                "ui_mode": "web-fallback",
                "result_ui_url": ui_url("draft", action["result_ids"]["draft_id"])
                if action["result_ids"].get("draft_id")
                else ui_url("run", action["result_ids"]["run_id"])
                if action["result_ids"].get("run_id")
                else None,
                "error": {
                    "code": "ACTION_EXPIRED" if action["state"] == "expired" else "ACTION_STALE"
                }
                if action["state"] in {"expired", "stale"}
                else None,
                "approval_state": action["state"],
                "next_step": "Review in VowEdit; pending does not mean executed.",
            }

    def _invalid(self, action: dict[str, Any]) -> str | None:
        if datetime.fromisoformat(action["expires_at"]) <= datetime.now(timezone.utc):
            return "expired"
        frozen = action["frozen"]
        try:
            self.authorize(
                action["principal"],
                "draft" if action.get("draft_id") else "run",
                str(action.get("draft_id", action.get("run_id"))),
            )
            if action.get("draft_id"):
                draft = self._draft(action["draft_id"])
                if draft["submitted_run_id"] or draft["revision"] != frozen["revision"]:
                    return "stale"
                if action["action"] == "generate" and self.binding(draft) != frozen:
                    return "stale"
                if action["action"] == "accept_contract" and (
                    self.pixel_hash(draft["source_asset_id"]) != frozen["source_pixels"]
                    or any(self.pixel_hash(i) != h for i, h in frozen["mask_pixels"].items())
                ):
                    return "stale"
            else:
                run = self.repo.get(action["run_id"])
                if self.run_fingerprint(run) != frozen["run_fingerprint"]:
                    return "stale"
                if action["action"] == "retry_generation" and any(
                    frozen[k] != v
                    for k, v in provider_binding(self.service, run["provider"]).items()
                ):
                    return "stale"
        except (AppError, OSError):
            return "stale"
        return None

    def presented(self, identifier: str, revision: int) -> dict[str, Any]:
        with self.repo.transaction():
            draft = self._draft(identifier)
            if draft["revision"] != revision:
                raise AppError("REVISION_CONFLICT", "Reload the presented contract.", 409)
            draft["presented_revision"] = revision
            self._save_draft(draft)
        return {"presented": True, "approval": False}

    def decide(self, identifier: str, decision: Decision) -> dict[str, Any]:
        with self.repo.transaction() as db:
            row = db.execute(
                "SELECT data FROM agent_action_requests WHERE id=?", (identifier,)
            ).fetchone()
            if not row:
                raise AppError("ACTION_NOT_FOUND", "Action not found.", 404)
            saved = json.loads(row[0])
            # Replay precedes TTL, revision and selection checks.
            if saved.get("decision_key"):
                if saved["decision_key"] == str(decision.decision_key) and saved[
                    "decision_hash"
                ] == fingerprint(decision.model_dump(mode="json")):
                    return self.action("user", identifier)
                raise AppError("DECISION_ALREADY_APPLIED", "This request was already decided.", 409)
            action = self.action("user", identifier)
            if action["state"] != "pending":
                # Commit stale/expired observation, then the route returns its machine state.
                return action
            if not decision.accept:
                action["state"] = "rejected"
                self.repo.activity(
                    db,
                    "user_rejected",
                    "user",
                    action_id=identifier,
                    draft_id=action.get("draft_id"),
                    run_id=action.get("run_id"),
                )
            else:
                # Only visible after commit; exclude this accepted action from peer staling.
                action["state"] = "applied"
                self._save_action(action)
                self.repo.activity(
                    db,
                    "user_accepted",
                    "user",
                    action_id=identifier,
                    draft_id=action.get("draft_id"),
                    run_id=action.get("run_id"),
                    facts={"action": action["action"]},
                )
                self._apply(action, decision)
            action.update(
                decision_key=str(decision.decision_key),
                decision_hash=fingerprint(decision.model_dump(mode="json")),
            )
            self._save_action(action)
            return self.action("user", identifier)

    def _apply(self, action: dict[str, Any], decision: Decision) -> None:
        operation, frozen = action["action"], action["frozen"]
        principal = action["principal"]
        if operation in {"accept_contract", "generate"}:
            draft = self._draft(action["draft_id"])
            if draft["presented_revision"] != draft["revision"]:
                raise AppError("UI_REQUIRED", "Load this draft in VowEdit before confirming.", 409)
            if operation == "accept_contract":
                draft.update(
                    contract=frozen["contract"],
                    instruction=frozen["contract"]["change"]["instruction"],
                    revision=draft["revision"] + 1,
                    presented_revision=None,
                    strokes=[],
                )
                self._validate_contract(draft)
                with self.repo.connection() as db:
                    self.repo.stale_actions(db, draft_id=draft["id"])
                self._save_draft(draft)
                return
            run = self.service.create(
                CreateRun.model_validate(
                    {
                        "source_image": draft["source_asset_id"],
                        "contract": draft["contract"],
                        "provider": draft["provider"],
                        "request_key": action["id"],
                        "candidate_mode": "strategy-v1",
                        "preview_fingerprint": frozen["plan"]["fingerprint"],
                        "continuation_draft_id": draft["starter_id"],
                    }
                )
            )
            draft["submitted_run_id"] = run["id"]
            self._save_draft(draft)
            self._bind_run(action, run)
        else:
            run_id = action["run_id"]
            if operation in {"adopt", "continue"}:
                selection = dict(
                    candidate_id=frozen["candidate_id"],
                    expected_selection_revision=frozen["selection_revision"],
                    confirmations=decision.confirmations,
                )
                if operation == "adopt":
                    run = self.service.select(run_id, Selection.model_validate(selection))
                    action["result_ids"] = {"run_id": run["id"]}
                else:
                    starter = self.service.continue_edit(
                        run_id,
                        Continuation.model_validate({**selection, "request_key": action["id"]}),
                    )
                    with self.repo.connection() as db:
                        self.repo.activity(
                            db,
                            "continuation_registered",
                            "system",
                            run_id=run_id,
                            action_id=action["id"],
                            facts={"starter_id": starter["id"]},
                        )
                    draft = self._new_draft(starter["source_image"], principal, starter["id"])
                    action["result_ids"] = {"starter_id": starter["id"], "draft_id": draft["id"]}
            elif operation == "retry_generation":
                run = self.service.retry_generation(run_id, action["id"])
                self._bind_run(action, run)
            elif operation == "retry_evaluation":
                run = self.service.retry_evaluation(run_id, action["id"])
                action["result_ids"] = {"run_id": run["id"]}

    def _bind_run(self, action: dict[str, Any], run: dict[str, Any]) -> None:
        binding = {
            "action_id": action["id"],
            "draft_id": action.get("draft_id"),
            "source_and_masks": {
                i: self.pixel_hash(i)
                for i in self._draft_assets(
                    {"source_asset_id": run["source_image"], "contract": run["contract"]}
                )
            },
            **provider_binding(self.service, run["provider"]),
        }
        self.repo.mutate(run["id"], lambda r: r.update(agent_binding=binding))
        if action["principal"] != "user":
            self.grant(action["principal"], "run", run["id"])
        elif action.get("draft_id"):
            # Existing explicit draft grants include this draft's one submitted result.
            with self.repo.connection() as db:
                rows = db.execute(
                    "SELECT id,grants FROM agent_credentials WHERE revoked=0"
                ).fetchall()
            for row in rows:
                if action["draft_id"] in json.loads(row["grants"]).get("draft", []):
                    self.grant(row["id"], "run", run["id"])
        action["result_ids"] = {"run_id": run["id"], "job_id": run["job_id"]}
        with self.repo.connection() as db:
            self.repo.activity(
                db,
                "generation_queued",
                "system",
                run_id=run["id"],
                draft_id=action.get("draft_id"),
                action_id=action["id"],
            )

    def get_run(self, principal: str, identifier: str) -> dict[str, Any]:
        self.authorize(principal, "run", identifier)
        run = self.repo.get(identifier)
        state = self.run_fingerprint(run)
        with self.repo.connection() as db:
            rows = db.execute(
                "SELECT id FROM agent_action_requests WHERE "
                "json_extract(data,'$.run_id')=? AND principal=? "
                "ORDER BY rowid DESC LIMIT 100",
                (identifier, principal),
            ).fetchall()
        requests = [self.action(principal, r[0]) for r in rows]
        return {
            "pending_requests": requests,
            "context_kind": "run",
            "context_id": identifier,
            "run_id": identifier,
            "job_id": run["job_id"],
            "draft_id": run.get("agent_binding", {}).get("draft_id"),
            "approval_action_id": run.get("agent_binding", {}).get("action_id"),
            "source_asset_id": run["source_image"],
            "contract": run["contract"],
            "candidate_plan": run.get("candidate_plan"),
            "error": run.get("error"),
            "failures": run.get("failures", []),
            "generation_retry_safe": run.get("generation_retry_safe", False),
            "snapshot_fingerprint": state,
            "decision_fingerprint": state,
            "expected_state_fingerprint": state,
            "revision": run["selection_revision"],
            "status": run["status"],
            "provider": run["provider"],
            "candidates": [
                {
                    k: c.get(k)
                    for k in (
                        "id",
                        "index",
                        "evaluation",
                        "manual_review",
                        "rank",
                        "generation_metadata",
                        "image",
                        "ghost",
                        "error",
                        "candidate_plan",
                    )
                }
                for c in run["candidates"]
            ],
            "adopted_candidate_id": run["user_selected_candidate_id"],
            "ui_url": ui_url("run", identifier),
            "ui_mode": "web-fallback",
            "approval_state": "none",
            "next_step": "Review final pixels and report in VowEdit.",
        }

    def get_report(self, principal: str, identifier: str) -> dict[str, Any]:
        result = self.get_run(principal, identifier)
        return {**result, "report": report(self.repo.get(identifier))}

    def activity(
        self, principal: str, kind: str, identifier: str, after: int, limit: int
    ) -> dict[str, Any]:
        self.authorize(principal, kind, identifier)
        field = {"draft": "draft_id", "run": "run_id"}[kind]
        linked_action = (self.repo.get(identifier).get("agent_binding", {}).get("action_id")
                         if kind == "run" else None)
        with self.repo.connection() as db:
            rows = db.execute(
                f"SELECT * FROM activity_entries WHERE ({field}=? OR action_id=?) AND cursor>? "
                "ORDER BY cursor LIMIT ?",
                (identifier, linked_action, after, limit),
            ).fetchall()
        entries = [{**dict(row), "facts": json.loads(row["facts"])} for row in rows]
        return {
            "context_kind": kind,
            "context_id": identifier,
            "entries": entries,
            "next_cursor": entries[-1]["cursor"] if entries else after,
            "ui_url": ui_url(kind, identifier),
            "ui_mode": "web-fallback",
            "next_step": "Read the next page using next_cursor.",
        }
