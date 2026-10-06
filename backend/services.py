import hashlib
import json
import logging
import time
from pathlib import Path
from threading import Event, Thread
from typing import Any
from uuid import uuid4

from filelock import FileLock, Timeout
from PIL import Image

from backend.candidate_plans import compile_plan, fingerprint
from backend.evaluation import evaluate, rank_candidates, validate_masks
from backend.persistence import Repository, now
from backend.preparation import NOTICE, boundary_lock
from backend.providers import GenerationRequest, ImageEditProvider, MockImageEditProvider
from backend.reporting import issues, report
from backend.schemas import (
    AppError,
    Continuation,
    CreateEditingDraft,
    CreateImportedRun,
    CreateRun,
    PrepareCandidate,
    Review,
    Selection,
    UpdateEditingDraft,
)
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

    def _validate_draft(self, source_id: str, data: dict[str, Any]) -> None:
        source = self.repo.asset(source_id, "original")
        self.assets.load(source_id)
        if data["continuation_starter_id"]:
            starter = self.draft(data["continuation_starter_id"])
            if starter["source_image"] != source_id:
                raise AppError("DRAFT_CONFLICT", "Starter source differs.", 409)
        for stroke in data["strokes"]:
            if any(p["x"] > source["width"] or p["y"] > source["height"] for p in stroke["points"]):
                raise AppError("INVALID_INPUT", "Stroke is outside the source image.", 422)
        for masks in (data["seed_masks"], data["checkpoint"]):
            for asset_id in masks.values():
                if asset_id:
                    self.repo.asset(asset_id, "mask")
                    if self.assets.load(asset_id).size != (source["width"], source["height"]):
                        raise AppError("DRAFT_CONFLICT", "Mask dimensions differ.", 409)
        for asset_id in data["raw_candidates"]:
            if asset_id:
                self.repo.asset(asset_id, "candidate")
                self.assets.load(asset_id)
        for index, asset_id in enumerate(data["effective_candidates"]):
            if asset_id:
                asset = self.repo.asset(asset_id)
                if asset["kind"] == "prepared_candidate":
                    self.normalized_raw(asset_id)
                    metadata = self.assets.preparation(asset_id)
                    if (
                        metadata["source_image"] != source_id
                        or metadata["raw_candidate_asset"] != data["raw_candidates"][index]
                        or metadata["generation_source_label"] != data["source_label"]
                        or metadata["preparation"]["change_mask"] != data["checkpoint"]["change"]
                    ):
                        raise AppError(
                            "DRAFT_CONFLICT", "Prepared candidate contract differs.", 409
                        )
                elif asset["kind"] != "candidate" or asset_id != data["raw_candidates"][index]:
                    raise AppError("DRAFT_CONFLICT", "Candidate source differs.", 409)
                if self.assets.load(asset_id).size != (source["width"], source["height"]):
                    raise AppError("DRAFT_CONFLICT", "Candidate dimensions differ.", 409)
        if (
            data["plan_fingerprint"]
            and compile_plan(data["instruction"])["fingerprint"] != (data["plan_fingerprint"])
        ):
            raise AppError("PLAN_CONFLICT", "Saved plan differs.", 409)

    def create_editing_draft(self, request: CreateEditingDraft) -> dict[str, Any]:
        data = request.data.model_dump(mode="json")
        source = str(request.source_image)
        return self.repo.create_editing_draft(
            str(uuid4()),
            source,
            data,
            str(request.request_key),
            fingerprint({"source_image": source, "data": data}),
            lambda: self._validate_draft(source, data),
        )

    def update_editing_draft(
        self,
        draft_id: str,
        request: UpdateEditingDraft,
    ) -> dict[str, Any]:
        data = request.data.model_dump(mode="json")

        def validate(draft: dict[str, Any]) -> None:
            old = draft["data"]
            if old["continuation_starter_id"] != data["continuation_starter_id"]:
                raise AppError("DRAFT_CONFLICT", "Starter binding is immutable.", 409)
            changed = any(
                old[k] != data[k]
                for k in (
                    "strokes",
                    "seed_masks",
                    "instruction",
                    "keep_label",
                    "threshold",
                    "background",
                )
            )
            # Contract edits must acknowledge invalidation before preparing new artifacts.
            if changed and (
                any(data["checkpoint"].values())
                or data["plan_fingerprint"]
                or any(
                    a and self.repo.asset(a)["kind"] == "prepared_candidate"
                    for a in data["effective_candidates"]
                )
            ):
                raise AppError(
                    "DRAFT_CONFLICT", "Clear old preparation before changing intent.", 409
                )
            self._validate_draft(draft["source_image"], data)

        return self.repo.update_editing_draft(
            draft_id,
            request.expected_revision,
            str(request.mutation_key),
            fingerprint(request.model_dump(mode="json", exclude={"mutation_key"})),
            data,
            validate,
        )

    def _draft_submission(
        self,
        draft: dict[str, Any],
        request: CreateRun | CreateImportedRun,
    ) -> None:
        data = draft["data"]
        self._validate_draft(draft["source_image"], data)
        checkpoint = data["checkpoint"]
        expected = {
            "change": {"instruction": data["instruction"], "mask": checkpoint["change"]},
            "keep": (
                [
                    {
                        "type": "manual_region",
                        "label": data["keep_label"],
                        "mask": checkpoint["keep"],
                        "threshold": data["threshold"],
                    }
                ]
                if checkpoint["keep"]
                else []
            ),
            "background_threshold": data["threshold"] if data["background"] else None,
        }
        matches = (
            draft["source_image"] == str(request.source_image)
            and request.contract.model_dump(mode="json") == expected
            and data["continuation_starter_id"]
            == (str(request.continuation_draft_id) if request.continuation_draft_id else None)
        )
        if isinstance(request, CreateRun):
            matches = (
                matches
                and data["mode"] == "generate"
                and data["provider"] == request.provider
                and request.candidate_mode == "strategy-v1"
                and data["plan_fingerprint"] == request.preview_fingerprint
            )
        else:
            matches = (
                matches
                and data["mode"] == "import"
                and data["source_label"] == request.source_label
                and data["effective_candidates"] == [str(a) for a in request.candidate_images]
            )
        if not matches:
            raise AppError("DRAFT_CONFLICT", "Submit the last acknowledged draft contract.", 409)

    def create(
        self,
        request: CreateRun,
        parent: str | None = None,
        frozen_plan: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if request.provider not in self.providers:
            raise AppError(
                "PROVIDER_UNAVAILABLE", "This provider is not configured on the server.", 503
            )
        return self._submit(request, parent, frozen_plan)

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

    def normalized_raw(self, asset_id: str) -> Image.Image:
        self.repo.asset(asset_id, "prepared_candidate")
        metadata = self.assets.preparation(asset_id)
        try:
            self.repo.asset(metadata["source_image"], "original")
            self.repo.asset(metadata["raw_candidate_asset"], "candidate")
            recipe = metadata["preparation"]
            self.repo.asset(recipe["change_mask"], "mask")
            source = self.assets.load(metadata["source_image"])
            raw = self.assets.load(metadata["raw_candidate_asset"])
            change = self.assets.load(recipe["change_mask"])
            validate_masks(source, change, [])
            _, expected = boundary_lock(source, raw, change)
            expected["change_mask"] = recipe["change_mask"]
            if recipe != expected or self.assets.load(asset_id).size != source.size:
                raise ValueError("Recipe mismatch")
            return raw.convert("RGB").resize(
                source.size,
                resample=Image.Resampling.LANCZOS,
                box=tuple(recipe["normalization"]["crop_box"]),
            )
        except (KeyError, TypeError, ValueError, AppError) as exc:
            raise AppError(
                "PREPARATION_UNAVAILABLE", "Aligned raw preview is unavailable.", 409
            ) from exc

    def _submit(
        self,
        request: CreateRun | CreateImportedRun,
        parent: str | None = None,
        frozen_plan: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self.repo.asset(str(request.source_image), "original")
        self.repo.asset(str(request.contract.change.mask), "mask")
        for rule in request.contract.keep:
            self.repo.asset(str(rule.mask), "mask")
        payload = request.model_dump(mode="json")
        editing_id = payload.pop("editing_draft_id", None)
        editing_revision = payload.pop("expected_draft_revision", None)
        if editing_id is not None:
            payload.update(editing_draft_id=editing_id, expected_draft_revision=editing_revision)
        # Preserve the exact V0.1 hash shape for legacy pending/ambiguous requests.
        draft_id = payload.pop("continuation_draft_id", None)
        plan = None
        if isinstance(request, CreateRun):
            mode = payload.pop("candidate_mode")
            preview = payload.pop("preview_fingerprint")
            if mode == "strategy-v1":
                replay = self.repo.submitted_run(str(request.request_key))
                replay_plan = (replay or {}).get("candidate_plan")
                if (
                    replay_plan
                    and replay_plan["fingerprint"] == preview
                    and replay_plan["slots"][0]["base_instruction"]
                    == request.contract.change.instruction
                ):
                    plan = replay_plan
                else:
                    plan = frozen_plan or compile_plan(request.contract.change.instruction)
                if preview != plan["fingerprint"]:
                    raise AppError("PLAN_CONFLICT", "Preview changed. Review the plan again.", 409)
                payload.update(candidate_mode=mode, candidate_plan=plan, hash_version="plan-v1")
            elif preview is not None:
                raise AppError(
                    "INVALID_INPUT", "Legacy mode does not accept a plan fingerprint.", 422
                )
        lineage: dict[str, Any] = {}
        if draft_id:
            draft = self.draft(draft_id)
            if draft["source_image"] != str(request.source_image):
                raise AppError("DRAFT_CONFLICT", "Original does not belong to this starter.", 409)
            lineage = dict(
                continuation_draft_id=draft_id,
                parent_run_id=draft["parent_run_id"],
                parent_candidate_id=draft["parent_candidate_id"],
                root_run_id=draft["root_run_id"],
                derivation_kind="continuation",
            )
            payload["continuation_draft_id"] = draft_id
        if parent:
            ancestor = self.repo.get(parent)
            lineage = dict(
                parent_run_id=parent,
                parent_candidate_id=None,
                root_run_id=ancestor.get("root_run_id", parent),
                derivation_kind="generation_retry",
            )
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
                    self.normalized_raw(str(image_id))  # Verify the complete saved recipe.
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
        run.update(lineage, user_selected_candidate_id=None, selection_revision=0)
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
        binding = None
        if editing_id is not None:
            binding = (
                editing_id,
                int(editing_revision),
                lambda draft: self._draft_submission(draft, request),
            )
            run["editing_draft_id"] = editing_id
        actual_id = self.repo.submit(run, job, draft_binding=binding)
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
            | {
                "request_key": request_key,
                "candidate_mode": run.get("candidate_mode", "legacy-seeds-v1"),
                "preview_fingerprint": (run.get("candidate_plan") or {}).get("fingerprint"),
            }
        )
        return self.create(request, parent=run_id, frozen_plan=run.get("candidate_plan"))

    def _selection_candidate(
        self,
        run: dict[str, Any],
        request: Selection,
        *,
        continuing: bool = False,
    ) -> dict[str, Any]:
        if run["status"] not in {"completed", "partial"}:
            raise AppError("JOB_CONFLICT", "Wait for the edit to finish.", 409)
        candidate = next(
            (c for c in run["candidates"] if c["id"] == str(request.candidate_id)), None
        )
        if candidate is None:
            raise AppError("CANDIDATE_MISSING", "Candidate not found.", 404)
        self.repo.asset(candidate["image"])
        self.assets.load(candidate["image"])
        if continuing and run.get("user_selected_candidate_id") != candidate["id"]:
            raise AppError("SELECTION_CONFLICT", "Adopt this candidate before continuing.", 409)
        if run.get("selection_revision", 0) != request.expected_selection_revision:
            raise AppError("SELECTION_CONFLICT", "Selection changed. Refresh this edit.", 409)
        if not set(issues(candidate)).issubset(request.confirmations):
            raise AppError("CONFIRMATION_REQUIRED", "Confirm each candidate issue first.", 409)
        return candidate

    def select(self, run_id: str, request: Selection) -> dict[str, Any]:
        def update(run: dict[str, Any]) -> None | bool:
            # Identical desired state is a no-op even after a lost response.
            if run.get("user_selected_candidate_id") == str(request.candidate_id):
                repeated = request.model_copy(
                    update={
                        "expected_selection_revision": run.get("selection_revision", 0),
                        "confirmations": [
                            "review_pending",
                            "semantic_fail",
                            "pixel_ineligible",
                            "evaluation_missing",
                        ],
                    }
                )
                self._selection_candidate(run, repeated)
                return False
            candidate = self._selection_candidate(run, request)
            run["user_selected_candidate_id"] = candidate["id"]
            run["selection_revision"] = run.get("selection_revision", 0) + 1
            return None

        return self.repo.mutate(run_id, update)

    def draft(self, draft_id: str) -> dict[str, Any]:
        draft = self.repo.starter(draft_id)
        if draft is None:
            raise AppError("DRAFT_NOT_FOUND", "Continuation starter not found.", 404)
        self.repo.asset(draft["source_image"], "original")
        self.assets.load(draft["source_image"])
        return draft

    def continue_edit(self, run_id: str, request: Continuation) -> dict[str, Any]:
        payload_hash = fingerprint(
            {
                "operation": "continuation-v1",
                "parent": run_id,
                **request.model_dump(mode="json", exclude={"request_key"}),
            }
        )
        existing = self.repo.starter(str(request.request_key), request_key=True)
        if existing:
            if existing["payload_hash"] != payload_hash:
                raise AppError("JOB_CONFLICT", "Request key belongs to another continuation.", 409)
            return existing
        run = self.repo.get(run_id)
        candidate = self._selection_candidate(run, request, continuing=True)
        image = self.assets.load(candidate["image"])
        # Atomic file precedes transaction. Failed/racing commands may leave an orphan only.
        source_id = self.assets.save(image)
        draft = dict(
            id=str(uuid4()),
            request_key=str(request.request_key),
            payload_hash=payload_hash,
            source_image=source_id,
            parent_run_id=run_id,
            parent_candidate_id=candidate["id"],
            root_run_id=run.get("root_run_id", run_id),
            artifact_kind="locked"
            if candidate.get("generation_metadata", {}).get("preparation")
            else "candidate",
            created_at=now(),
            source_candidate_asset=candidate["image"],
            confirmed_issues=request.confirmations,
            source_size=list(image.size),
        )

        def validate(current: dict[str, Any]) -> None:
            self._selection_candidate(current, request, continuing=True)
            self.assets.load(source_id)

        return self.repo.register_starter(run_id, draft, validate, image.width, image.height)

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
            "report_extension": report(run),
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
                                run["candidate_plan"]["slots"][index]["effective_instruction"]
                                if run.get("candidate_plan")
                                else run["contract"]["change"]["instruction"],
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
                            "candidate_plan": run["candidate_plan"]["slots"][index]
                            if run.get("candidate_plan")
                            else None,
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
