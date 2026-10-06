import hashlib
import json
import logging
import time
from pathlib import Path
from threading import Event, Thread
from typing import Any
from uuid import uuid4

from filelock import FileLock, Timeout

from backend.evaluation import evaluate, rank_candidates, validate_masks
from backend.persistence import Repository, now
from backend.preparation import NOTICE, boundary_lock
from backend.providers import GenerationRequest, ImageEditProvider, MockImageEditProvider
from backend.schemas import AppError, CreateImportedRun, CreateRun, PrepareCandidate, Review
from backend.storage import AssetStore

logger = logging.getLogger("vowedit.jobs")


class ImageEditService:
    def __init__(self, root: Path, providers: dict[str, ImageEditProvider] | None = None):
        root.mkdir(parents=True, exist_ok=True)
        self.lock = FileLock(root / ".worker.lock")
        self.repo = Repository(root / "vowedit.sqlite3")
        self.assets = AssetStore(root / "assets")
        self.providers = providers or {"mock": MockImageEditProvider()}
        self.stop = Event()
        self.wake = Event()
        self.thread: Thread | None = None

    def start(self) -> None:
        try:
            self.lock.acquire(timeout=0)
        except Timeout as exc:
            raise RuntimeError("Use one API worker per VowEdit data directory.") from exc
        self.repo.recover()
        self.thread = Thread(target=self._worker, daemon=True, name="vowedit-worker")
        self.thread.start()

    def close(self) -> None:
        self.stop.set()
        self.wake.set()
        if self.thread:
            self.thread.join(timeout=12)
        if not self.thread or not self.thread.is_alive():
            self.lock.release()

    def _contract_images(self, run: dict[str, Any]) -> tuple[Any, Any, list[Any]]:
        contract = run["contract"]
        source = self.assets.load(run["source_image"])
        change = self.assets.load(contract["change"]["mask"])
        keeps = [self.assets.load(rule["mask"]) for rule in contract["keep"]]
        return source, change, keeps

    def create(self, request: CreateRun, parent: str | None = None) -> dict[str, Any]:
        if request.provider not in self.providers:
            raise AppError(
                "PROVIDER_UNAVAILABLE", "This provider is not configured on the server.", 503
            )
        return self._submit(request, parent)

    def create_imported(self, request: CreateImportedRun) -> dict[str, Any]:
        if not request.contract.keep:
            raise AppError("KEEP_REQUIRED", "Imported edits require a KEEP mask.")
        return self._submit(request)

    def prepare_candidate(self, request: PrepareCandidate) -> dict[str, Any]:
        if not request.contract.keep:
            raise AppError("KEEP_REQUIRED", "Imported edits require a KEEP mask.")
        self.repo.asset(str(request.source_image), "original")
        self.repo.asset(str(request.candidate_image), "candidate")
        self.repo.asset(str(request.contract.change.mask), "mask")
        for rule in request.contract.keep:
            self.repo.asset(str(rule.mask), "mask")
        source, change, keeps = self._contract_images(request.model_dump(mode="json"))
        validate_masks(source, change, keeps)
        raw = self.assets.load(str(request.candidate_image))
        final, preparation = boundary_lock(source, raw, change)
        preparation["change_mask"] = str(request.contract.change.mask)
        image_id = self.assets.save(final)
        metadata = {
            "generation_source": "external",
            "generation_source_label": request.source_label,
            "raw_candidate_asset": str(request.candidate_image),
            "prepared_candidate_asset": image_id,
            "source_image": str(request.source_image),
            "preparation": preparation,
        }
        self.assets.save_preparation(image_id, metadata)
        # Files + provenance precede DB registration: failures leave only unreferenced files.
        self.repo.add_asset(image_id, "prepared_candidate", final.width, final.height)
        return {
            "id": image_id,
            "width": final.width,
            "height": final.height,
            "url": f"/api/assets/{image_id}",
            "metadata": metadata,
        }

    def _submit(
        self, request: CreateRun | CreateImportedRun, parent: str | None = None
    ) -> dict[str, Any]:
        self.repo.asset(str(request.source_image), "original")
        self.repo.asset(str(request.contract.change.mask), "mask")
        for rule in request.contract.keep:
            self.repo.asset(str(rule.mask), "mask")
        payload = request.model_dump(mode="json")
        source, change, keeps = self._contract_images(payload)
        validate_masks(source, change, keeps)
        candidates = []
        imported = isinstance(request, CreateImportedRun)
        if isinstance(request, CreateImportedRun):
            payload.update(provider="imported", candidate_count=3, candidate_source="imported")
            for index, image_id in enumerate(request.candidate_images):
                asset = self.repo.asset(str(image_id))
                if asset["kind"] not in {"candidate", "prepared_candidate"}:
                    raise AppError("ASSET_NOT_FOUND", "The requested candidate was not found.", 404)
                preparation_metadata = {}
                if asset["kind"] == "prepared_candidate":
                    preparation_metadata = self.assets.preparation(str(image_id))
                    if (
                        preparation_metadata["source_image"] != str(request.source_image)
                        or preparation_metadata["preparation"]["change_mask"]
                        != str(request.contract.change.mask)
                        or preparation_metadata["generation_source_label"] != request.source_label
                    ):
                        raise AppError(
                            "PREPARATION_CONFLICT",
                            "Prepared candidate belongs to a different source, "
                            "CHANGE mask or source label.",
                            409,
                        )
                if self.assets.load(str(image_id)).size != source.size:
                    raise AppError(
                        "CANDIDATE_SIZE_MISMATCH",
                        "Candidate dimensions must match the original. No resizing is performed.",
                    )
                candidates.append(
                    {
                        "id": str(uuid4()),
                        "index": index,
                        "image": str(image_id),
                        "seed": None,
                        "evaluation": None,
                        "ghost": None,
                        "rank": None,
                        "error": None,
                        "manual_review": {"verdict": "pending", "notes": ""},
                        "generation_metadata": {
                            "provider": "imported",
                            "source": "external",
                            "source_label": request.source_label,
                            "simulation": False,
                            **preparation_metadata,
                        },
                    }
                )
        run_id, job_id = str(uuid4()), str(uuid4())
        stamp = now()
        run = dict(
            payload,
            id=run_id,
            job_id=job_id,
            status="queued",
            created_at=stamp,
            updated_at=stamp,
            candidates=candidates,
            provider_jobs=[],
            failures=[],
            error=None,
            selected_candidate_id=None,
            no_good_candidate=False,
            generation_retry_safe=not imported,
            parent_run_id=parent,
        )
        payload.pop("request_key")
        payload["parent_run_id"] = parent
        job = {
            "id": job_id,
            "request_key": str(request.request_key),
            "kind": "evaluation" if imported else "generation",
            "payload_hash": hashlib.sha256(
                json.dumps(payload, sort_keys=True).encode()
            ).hexdigest(),
        }
        actual_id = self.repo.submit(run, job)
        self.wake.set()
        return self.repo.get(actual_id)

    def retry_generation(self, run_id: str, request_key: str) -> dict[str, Any]:
        run = self.repo.get(run_id)
        if run["provider"] == "imported":
            raise AppError(
                "GENERATION_NOT_APPLICABLE", "Imported edits only support evaluation retries.", 409
            )
        if run["status"] not in {"failed_generation", "partial", "completed", "failed_evaluation"}:
            raise AppError("JOB_CONFLICT", "Wait for the current job to finish.", 409)
        if not run["generation_retry_safe"]:
            raise AppError(
                "PROVIDER_STATE_UNKNOWN",
                "Inspect the provider queue first. This ambiguous job cannot be retried.",
                409,
            )
        request = CreateRun.model_validate(
            {key: run[key] for key in ("source_image", "contract", "provider", "candidate_count")}
            | {"request_key": request_key}
        )
        return self.create(request, parent=run_id)

    def retry_evaluation(self, run_id: str, request_key: str) -> dict[str, Any]:
        run = self.repo.get(run_id)
        job = {
            "id": str(uuid4()),
            "request_key": request_key,
            "kind": "evaluation",
            "payload_hash": hashlib.sha256(f"evaluation:{run_id}".encode()).hexdigest(),
        }
        actual_id = self.repo.submit(run, job, retry=True)
        self.wake.set()
        return self.repo.get(actual_id)

    def review(self, run_id: str, candidate_id: str, review: Review) -> dict[str, Any]:
        def update(run: dict[str, Any]) -> None:
            if run["status"] not in {"completed", "partial"}:
                raise AppError("JOB_CONFLICT", "Wait for evaluation to finish.", 409)
            candidate = next((c for c in run["candidates"] if c["id"] == candidate_id), None)
            if candidate is None:
                raise AppError("CANDIDATE_MISSING", "Candidate not found.", 404)
            candidate["manual_review"] = review.model_dump()

        return self.repo.mutate(run_id, update)

    def receipt(self, run_id: str) -> dict[str, Any]:
        run = self.repo.get(run_id)
        if run["status"] not in {"completed", "partial"}:
            raise AppError("RECEIPT_UNAVAILABLE", "A receipt needs a completed evaluation.", 409)
        selected = next(
            (c for c in run["candidates"] if c["id"] == run["selected_candidate_id"]), None
        )
        return {
            "receipt_version": "v1",
            "run_id": run_id,
            "provider": run["provider"],
            "simulation": run["provider"] == "mock",
            "contract": run["contract"],
            "source_image": run["source_image"],
            "generated": 0 if run["provider"] == "imported" else len(run["candidates"]),
            **(
                {
                    "imported": len(run["candidates"]),
                    "generation_source": "external-import",
                    "source_label": run["source_label"],
                    "generation_notice": "Candidates were generated externally and imported "
                    "into VowEdit for evaluation.",
                    "constraint_enforcement": [
                        {"candidate_id": c["id"], **c["generation_metadata"]}
                        for c in run["candidates"]
                        if c["generation_metadata"].get("preparation")
                    ],
                    "preparation_notice": NOTICE
                    if any(c["generation_metadata"].get("preparation") for c in run["candidates"])
                    else None,
                    "evaluation_source": "VowEdit rgb-mae-v1",
                }
                if run["provider"] == "imported"
                else {}
            ),
            "requested": 3,
            "selected": selected,
            "candidates": run["candidates"],
            "no_good_candidate": run["no_good_candidate"],
            "failures": run["failures"],
            "generation_seconds": run.get("generation_seconds"),
            "created_at": run["created_at"],
            "disclaimer": "Pixel similarity is not prompt adherence, identity or image quality. "
            "Semantic adherence and artifacts require human review.",
        }

    def _worker(self) -> None:
        while not self.stop.is_set():
            try:
                job = self.repo.next_job()
                if job:
                    self.process(job)
                    continue
            except Exception:
                # No exception strings: SDK errors may contain keys, URLs or private paths.
                logger.error("worker_error category=STORAGE_FAILED")
            self.wake.wait(0.2)
            self.wake.clear()

    def process(self, job: dict[str, Any]) -> None:
        run_id, job_id = job["run_id"], job["id"]
        stage = "generating" if job["kind"] == "generation" else "evaluating"
        try:
            run = self.repo.mutate(run_id, lambda r: None, job_id=job_id, status=stage)
            logger.info(
                "run=%s job=%s provider=%s state=%s", run_id, job_id, run["provider"], stage
            )
            source, change, keeps = self._contract_images(run)
            if stage == "generating":
                started = time.monotonic()
                for index in range(3):
                    if self.stop.is_set():
                        return
                    try:

                        def record_provider_job(identifier: str, i: int = index) -> None:
                            self.repo.mutate(
                                run_id,
                                lambda r: r["provider_jobs"].append({"index": i, "id": identifier}),
                                job_id=job_id,
                            )

                        output = self.providers[run["provider"]].generate(
                            GenerationRequest(
                                source,
                                change,
                                run["contract"]["change"]["instruction"],
                                index,
                                4100 + index,
                                record_provider_job,
                            )
                        )
                        asset_id = self.assets.save(output)
                        self.repo.add_asset(asset_id, "candidate", output.width, output.height)
                        candidate = {
                            "id": str(uuid4()),
                            "index": index,
                            "image": asset_id,
                            "seed": 4100 + index,
                            "evaluation": None,
                            "ghost": None,
                            "rank": None,
                            "error": None,
                            "manual_review": {"verdict": "pending", "notes": ""},
                            "generation_metadata": {
                                "provider": run["provider"],
                                "simulation": run["provider"] == "mock",
                            },
                        }

                        def append_candidate(
                            r: dict[str, Any], c: dict[str, Any] = candidate
                        ) -> None:
                            r["candidates"].append(c)

                        self.repo.mutate(run_id, append_candidate, job_id=job_id)
                    except Exception as exc:
                        code = (
                            exc.code
                            if isinstance(exc, AppError)
                            else (
                                "PROVIDER_FAILED"
                                if run["provider"] == "mock"
                                else "PROVIDER_STATE_UNKNOWN"
                            )
                        )
                        message = (
                            exc.message
                            if isinstance(exc, AppError)
                            else "Candidate generation failed."
                        )

                        def failed(
                            r: dict[str, Any], i: int = index, c: str = code, m: str = message
                        ) -> None:
                            r["failures"].append({"index": i, "code": c, "message": m})
                            if c == "PROVIDER_STATE_UNKNOWN":
                                r["generation_retry_safe"] = False

                        self.repo.mutate(run_id, failed, job_id=job_id)
                        if code in {
                            "PROVIDER_STATE_UNKNOWN",
                            "PROVIDER_UNAVAILABLE",
                            "MODEL_MISSING",
                            "PROVIDER_RATE_LIMIT",
                            "PROVIDER_AUTH",
                            "PROVIDER_BALANCE",
                        }:
                            break
                run = self.repo.mutate(
                    run_id,
                    lambda r: r.update(generation_seconds=round(time.monotonic() - started, 3)),
                    job_id=job_id,
                )
                if not run["candidates"]:
                    self.repo.mutate(
                        run_id,
                        lambda r: r.update(error=r["failures"][0]),
                        job_id=job_id,
                        status="failed_generation",
                    )
                    return
                stage = "evaluating"
                run = self.repo.mutate(run_id, lambda r: None, job_id=job_id, status=stage)
            for candidate in run["candidates"]:
                if candidate["evaluation"] is not None:
                    continue
                if self.stop.is_set():
                    return
                try:
                    result, ghost = evaluate(
                        source,
                        self.assets.load(candidate["image"]),
                        change,
                        keeps,
                        run["contract"]["keep"],
                        run["contract"]["background_threshold"],
                    )
                    ghost_id = self.assets.save(ghost)
                    self.repo.add_asset(ghost_id, "ghost", ghost.width, ghost.height)
                    candidate.update(evaluation=result, ghost=ghost_id, error=None)
                except Exception:
                    candidate["error"] = {
                        "code": "EVALUATION_FAILED",
                        "message": "Evaluation failed. The candidate image is preserved.",
                    }

                def save_evaluation(r: dict[str, Any], c: dict[str, Any] = candidate) -> None:
                    r["candidates"] = [
                        c if old["id"] == c["id"] else old for old in r["candidates"]
                    ]

                self.repo.mutate(run_id, save_evaluation, job_id=job_id)
            run = self.repo.get(run_id)
            ranked = rank_candidates(run["candidates"])
            evaluated = [c for c in ranked if c["evaluation"] is not None]
            if not evaluated:
                status = "failed_evaluation"
            elif len(evaluated) < 3:
                status = "partial"
            else:
                status = "completed"
            selected = next((c["id"] for c in evaluated if c["evaluation"]["eligible"]), None)
            self.repo.mutate(
                run_id,
                lambda r: r.update(
                    candidates=ranked,
                    selected_candidate_id=selected,
                    no_good_candidate=selected is None,
                    error={
                        "code": "EVALUATION_FAILED",
                        "message": "Retry evaluation of saved images.",
                    }
                    if status == "failed_evaluation"
                    else None,
                ),
                job_id=job_id,
                status=status,
            )
            logger.info("run=%s job=%s state=%s", run_id, job_id, status)
        except Exception as exc:
            if isinstance(exc, AppError) and exc.code == "JOB_CONFLICT":
                return
            terminal = "failed_evaluation" if stage == "evaluating" else "failed_generation"
            self.repo.mutate(
                run_id,
                lambda r: r.update(
                    error={
                        "code": "EVALUATION_FAILED" if stage == "evaluating" else "STORAGE_FAILED",
                        "message": "The job could not finish. Saved images are preserved.",
                    }
                ),
                job_id=job_id,
                status=terminal,
            )
