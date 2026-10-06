import io
import os
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any, Literal
from uuid import UUID

from dotenv import load_dotenv
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.middleware.trustedhost import TrustedHostMiddleware

from backend.body_limit import BodyLimitMiddleware
from backend.candidate_plans import compile_plan
from backend.providers import LocalComfyUIImageEditProvider
from backend.reporting import report
from backend.runninghub import RunningHubImageEditProvider
from backend.schemas import (
    AppError,
    Continuation,
    CreateImportedRun,
    CreateRun,
    PrepareCandidate,
    PreviewPlan,
    Retry,
    Review,
    Selection,
)
from backend.services import ImageEditService
from backend.storage import MAX_BYTES

load_dotenv()


def create_app(service: ImageEditService | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.service.start()
        try:
            yield
        finally:
            app.state.service.close()

    app = FastAPI(title="VowEdit", lifespan=lifespan)
    app.state.service = service or ImageEditService(Path(os.getenv("VOWEDIT_DATA_DIR", "data")))
    if service is None and os.getenv("COMFYUI_BASE_URL") and os.getenv("COMFYUI_CHECKPOINT"):
        app.state.service.providers["comfyui"] = LocalComfyUIImageEditProvider(
            os.environ["COMFYUI_BASE_URL"],
            os.environ["COMFYUI_CHECKPOINT"],
            float(os.getenv("COMFYUI_TIMEOUT_SECONDS", "180")),
            stop=app.state.service.stop,
        )
    if service is None and all(
        os.getenv(key) for key in ("RUNNINGHUB_API_KEY", "RUNNINGHUB_WORKFLOW_ID")
    ):
        app.state.service.providers["runninghub"] = RunningHubImageEditProvider(
            os.environ["RUNNINGHUB_API_KEY"],
            os.environ["RUNNINGHUB_WORKFLOW_ID"],
            api_origin=os.getenv("RUNNINGHUB_API_ORIGIN", "https://www.runninghub.cn"),
            stop=app.state.service.stop,
            timeout=float(os.getenv("RUNNINGHUB_TIMEOUT_SECONDS", "180")),
        )
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
    )
    app.add_middleware(BodyLimitMiddleware)

    @app.middleware("http")
    async def local_boundary(request: Request, call_next: Any) -> Any:
        origin = request.headers.get("origin")
        allowed = {
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        }
        if (origin and origin not in allowed) or request.headers.get(
            "sec-fetch-site"
        ) == "cross-site":
            return JSONResponse(
                {"error": {"code": "ORIGIN_REJECTED", "message": "Local access only."}}, 403
            )
        try:
            size = int(request.headers.get("content-length", "0"))
        except ValueError:
            size = MAX_BYTES + 1_000_001
        if size > MAX_BYTES + 1_000_000:
            return JSONResponse(
                {"error": {"code": "INVALID_IMAGE", "message": "Upload too large."}}, 413
            )
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse({"error": {"code": exc.code, "message": exc.message}}, exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            {
                "error": {
                    "code": "INVALID_INPUT",
                    "message": "Check required fields, identifiers and thresholds.",
                }
            },
            422,
        )

    @app.exception_handler(OSError)
    @app.exception_handler(sqlite3.Error)
    async def storage_error(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            {
                "error": {
                    "code": "STORAGE_FAILED",
                    "message": "Local storage is unavailable. Check disk space and permissions.",
                }
            },
            503,
        )

    def svc() -> ImageEditService:
        return app.state.service  # type: ignore[no-any-return]

    @app.get("/api/config")
    def config() -> dict[str, Any]:
        names = list(svc().providers)
        configured = os.getenv("VOWEDIT_PROVIDER", "mock")
        return {
            "providers": names,
            "default_provider": configured if configured in names else "mock",
            "max_image_side": 1536,
            "max_upload_mb": 10,
        }

    @app.post("/api/assets", status_code=201)
    def upload(
        file: Annotated[UploadFile, File()],
        kind: Literal["original", "mask", "candidate"] = "original",
    ) -> dict[str, Any]:
        data = file.file.read(MAX_BYTES + 1)
        asset_id, width, height = svc().assets.upload(
            data, file.filename or "", file.content_type or "", kind
        )
        svc().repo.add_asset(asset_id, kind, width, height)
        return {"id": asset_id, "width": width, "height": height, "url": f"/api/assets/{asset_id}"}

    @app.get("/api/assets/{asset_id}")
    def asset(asset_id: UUID) -> FileResponse:
        svc().repo.asset(str(asset_id))
        path = svc().assets.path(str(asset_id))
        if not path.is_file():
            raise AppError("ASSET_NOT_FOUND", "Saved asset is missing.", 404)
        return FileResponse(path, media_type="image/png")

    @app.post("/api/runs", status_code=202)
    def create(request: CreateRun) -> dict[str, Any]:
        return svc().create(request)

    @app.post("/api/candidate-plans")
    def candidate_plans(request: PreviewPlan) -> dict[str, Any]:
        return compile_plan(request.instruction)

    @app.get("/api/prepared-candidates/{asset_id}/normalized-raw")
    def normalized_raw(asset_id: UUID) -> Response:
        image = svc().normalized_raw(str(asset_id))
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return Response(buffer.getvalue(), media_type="image/png")

    @app.put("/api/runs/{run_id}/selection")
    def selection(run_id: UUID, request: Selection) -> dict[str, Any]:
        return svc().select(str(run_id), request)

    @app.post("/api/runs/{run_id}/continuations", status_code=201)
    def continuation(run_id: UUID, request: Continuation) -> dict[str, Any]:
        return svc().continue_edit(str(run_id), request)

    @app.get("/api/drafts/{draft_id}")
    def draft(draft_id: UUID) -> dict[str, Any]:
        return svc().draft(str(draft_id))

    @app.get("/api/runs/{run_id}/report")
    def get_report(run_id: UUID) -> dict[str, Any]:
        return report(svc().repo.get(str(run_id)))

    @app.post("/api/imported-runs", status_code=202)
    def create_imported(request: CreateImportedRun) -> dict[str, Any]:
        return svc().create_imported(request)

    @app.post("/api/prepared-candidates", status_code=201)
    def prepare_candidate(request: PrepareCandidate) -> dict[str, Any]:
        return svc().prepare_candidate(request)

    @app.get("/api/runs")
    def history() -> list[dict[str, Any]]:
        return [
            {
                key: run[key]
                for key in ("id", "status", "created_at", "source_image", "contract", "provider")
            }
            | {key: run.get(key) for key in ("source_label", "parent_run_id",
                 "parent_candidate_id", "root_run_id", "derivation_kind")}
            for run in svc().repo.history()
        ]

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: UUID) -> dict[str, Any]:
        return svc().repo.get(str(run_id))

    @app.post("/api/runs/{run_id}/retry-generation", status_code=202)
    def retry_generation(run_id: UUID, request: Retry) -> dict[str, Any]:
        return svc().retry_generation(str(run_id), str(request.request_key))

    @app.post("/api/runs/{run_id}/retry-evaluation", status_code=202)
    def retry_evaluation(run_id: UUID, request: Retry) -> dict[str, Any]:
        return svc().retry_evaluation(str(run_id), str(request.request_key))

    @app.put("/api/runs/{run_id}/candidates/{candidate_id}/review")
    def review(run_id: UUID, candidate_id: UUID, request: Review) -> dict[str, Any]:
        return svc().review(str(run_id), str(candidate_id), request)

    @app.get("/api/runs/{run_id}/receipt")
    def receipt(run_id: UUID) -> JSONResponse:
        return JSONResponse(
            svc().receipt(str(run_id)),
            headers={"Content-Disposition": f'attachment; filename="vowedit-{run_id}.json"'},
        )

    return app
