from typing import Any
from uuid import UUID

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse

from backend.agent_auth import LocalAuth
from backend.agent_schemas import (
    ActionRequest,
    CreateEdit,
    Decision,
    DraftPatch,
    GenerateAction,
    Grant,
    Presented,
    ProposeContract,
)
from backend.agent_services import FEATURES, AgentService
from backend.schemas import AppError


def install_agent_routes(app: FastAPI) -> None:
    agent = AgentService(app.state.service)
    auth = LocalAuth(agent.repo)
    app.state.agent, app.state.auth = agent, auth
    router = APIRouter(prefix="/api")

    @router.post("/browser-session")
    def bootstrap(request: Request) -> JSONResponse:
        session, csrf = auth.bootstrap(request)
        response = JSONResponse({"csrf": csrf})
        response.set_cookie(
            "vowedit_browser", session, httponly=True, samesite="strict", max_age=43200, path="/"
        )
        return response

    @router.get("/agent/capabilities")
    def capabilities() -> dict[str, Any]:
        return {
            "api_version": "agent-api-v1",
            "features": FEATURES,
            "limits": {"candidate_count": 3, "activity_limit": 100, "ttl_seconds": 600},
            "service_status": "available",
            "ui_mode": "web-fallback",
        }

    def principal(request: Request) -> str:
        return str(request.state.principal)

    @router.post("/agent/editing-drafts", status_code=201)
    def create(request: Request, payload: CreateEdit) -> dict[str, Any]:
        return agent.create(principal(request), payload)

    @router.get("/agent/editing-drafts/{draft_id}")
    def get_edit(request: Request, draft_id: UUID) -> dict[str, Any]:
        return agent.get_edit(principal(request), str(draft_id))

    @router.put("/editing-drafts/{draft_id}")
    def patch(draft_id: UUID, payload: DraftPatch) -> dict[str, Any]:
        return agent.patch(str(draft_id), payload)

    @router.post("/editing-drafts/{draft_id}/presented")
    def presented(draft_id: UUID, payload: Presented) -> dict[str, Any]:
        return agent.presented(str(draft_id), payload.expected_revision)

    @router.post("/editing-drafts/{draft_id}/generation-request")
    def human_generation(draft_id: UUID, payload: GenerateAction) -> dict[str, Any]:
        if str(payload.draft_id) != str(draft_id):
            raise AppError("INVALID_INPUT", "Draft locator mismatch.", 422)
        return agent.request("user", payload)

    @router.post("/agent/proposals")
    def propose(request: Request, payload: ProposeContract) -> dict[str, Any]:
        if principal(request) == "user":
            raise AppError("AGENT_REQUIRED", "Contract proposals require a scoped client.", 403)
        return agent.propose(principal(request), payload)

    @router.post("/agent/actions")
    def action(request: Request, payload: ActionRequest) -> dict[str, Any]:
        if principal(request) == "user":
            raise AppError("AGENT_REQUIRED", "Agent requests require a scoped client.", 403)
        return agent.request(principal(request), payload)

    @router.get("/agent/actions/{action_id}")
    def get_action(request: Request, action_id: UUID) -> dict[str, Any]:
        return agent.action(principal(request), str(action_id))

    @router.post("/agent-actions/{action_id}/decision")
    def decision(action_id: UUID, payload: Decision) -> dict[str, Any]:
        return agent.decide(str(action_id), payload)

    @router.post("/agent-grants")
    def grant(payload: Grant) -> dict[str, Any]:
        identifier = str(payload.id)
        if payload.kind == "draft":
            agent._draft(identifier)
        elif payload.kind == "run":
            agent.repo.get(identifier)
        else:
            agent.repo.asset(identifier)
        with agent.repo.transaction() as db:
            agent.grant(str(payload.client_id), payload.kind, identifier)
            agent.repo.activity(
                db, "context_shared", "user",
                draft_id=identifier if payload.kind == "draft" else None,
                run_id=identifier if payload.kind == "run" else None,
                facts={"kind": payload.kind, "id": identifier}
            )
        return {"shared": True, "image_read_scope": "only assets of this context"}

    @router.get("/agent/runs/{run_id}")
    def run(request: Request, run_id: UUID) -> dict[str, Any]:
        return agent.get_run(principal(request), str(run_id))

    @router.get("/agent/runs/{run_id}/report")
    def report(request: Request, run_id: UUID) -> dict[str, Any]:
        return agent.get_report(principal(request), str(run_id))

    @router.get("/agent/{kind}/{context_id}/activity")
    def activity(
        request: Request, kind: str, context_id: UUID, after_cursor: int = 0, limit: int = 50
    ) -> dict[str, Any]:
        if kind not in {"draft", "run"} or after_cursor < 0 or not 1 <= limit <= 100:
            raise AppError("INVALID_INPUT", "Use a bounded draft/run activity scope.", 422)
        return agent.activity(principal(request), kind, str(context_id), after_cursor, limit)

    @router.get("/agent/runs/{run_id}/actions")
    def actions(request: Request, run_id: UUID) -> list[dict[str, Any]]:
        agent.authorize(principal(request), "run", str(run_id))
        with agent.repo.connection() as db:
            rows = db.execute(
                "SELECT id FROM agent_action_requests WHERE "
                "json_extract(data,'$.run_id')=? AND (?='user' OR principal=?) "
                "ORDER BY rowid DESC LIMIT 100",
                (str(run_id), principal(request), principal(request)),
            ).fetchall()
        return [agent.action(principal(request), r[0]) for r in rows]

    app.include_router(router)
