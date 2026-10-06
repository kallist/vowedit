import json
import sqlite3
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.schemas import AppError, check_transition


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Repository:
    def __init__(self, path: Path):
        self.path = path
        with self.connection() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                BEGIN IMMEDIATE;
                CREATE TABLE IF NOT EXISTS assets (
                    id TEXT PRIMARY KEY, kind TEXT NOT NULL, width INTEGER, height INTEGER
                );
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL,
                    data TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
                    request_key TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL,
                    kind TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS editing_drafts (
                    id TEXT PRIMARY KEY, source_image TEXT NOT NULL REFERENCES assets(id),
                    data TEXT NOT NULL, revision INTEGER NOT NULL,
                    creation_key TEXT NOT NULL UNIQUE, creation_hash TEXT NOT NULL,
                    mutation_key TEXT, mutation_hash TEXT,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    submitted_run_id TEXT REFERENCES runs(id)
                );
                COMMIT;
            """)

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def add_asset(self, asset_id: str, kind: str, width: int, height: int) -> None:
        with self.connection() as db:
            db.execute("INSERT INTO assets VALUES (?, ?, ?, ?)", (asset_id, kind, width, height))

    def asset(self, asset_id: str, kind: str | None = None) -> dict[str, Any]:
        with self.connection() as db:
            row = db.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
        if row is None or (kind and row["kind"] != kind):
            raise AppError("ASSET_NOT_FOUND", "The requested image or mask was not found.", 404)
        return dict(row)

    def submitted_run(self, request_key: str) -> dict[str, Any] | None:
        with self.connection() as db:
            row = db.execute(
                "SELECT runs.data FROM jobs JOIN runs ON runs.id=jobs.run_id "
                "WHERE jobs.request_key=?",
                (request_key,),
            ).fetchone()
        return json.loads(row[0]) if row else None

    def get(self, run_id: str) -> dict[str, Any]:
        with self.connection() as db:
            row = db.execute("SELECT data FROM runs WHERE id=?", (run_id,)).fetchone()
        if row is None:
            raise AppError("RUN_NOT_FOUND", "Edit not found.", 404)
        return self.compatible(json.loads(row["data"]))

    @staticmethod
    def compatible(run: dict[str, Any]) -> dict[str, Any]:
        defaults = dict(
            candidate_mode="legacy-seeds-v1",
            candidate_plan=None,
            user_selected_candidate_id=None,
            selection_revision=0,
            parent_candidate_id=None,
            continuation_draft_id=None,
            root_run_id=run["id"],
            derivation_kind="generation_retry" if run.get("parent_run_id") else None,
        )
        return {**defaults, **run}

    def history(self) -> list[dict[str, Any]]:
        with self.connection() as db:
            rows = db.execute("SELECT data FROM runs ORDER BY created_at DESC LIMIT 50").fetchall()
        return [self.compatible(json.loads(row["data"])) for row in rows]

    def submit(
        self,
        run: dict[str, Any],
        job: dict[str, str],
        *,
        retry: bool = False,
        draft_binding: tuple[str, int, Callable[[dict[str, Any]], None]] | None = None,
    ) -> str:
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT * FROM jobs WHERE request_key=?", (job["request_key"],)
            ).fetchone()
            if existing:
                if existing["payload_hash"] != job["payload_hash"]:
                    raise AppError(
                        "JOB_CONFLICT", "Request key was already used for another edit.", 409
                    )
                return str(existing["run_id"])
            if draft_binding:
                draft_id, revision, validate = draft_binding
                draft = self._editing_draft(db, draft_id)
                if draft["submitted_run_id"] or draft["revision"] != revision:
                    raise AppError("DRAFT_CONFLICT", "Draft changed or was already submitted.", 409)
                validate(draft)
            active = db.execute(
                "SELECT COUNT(*) FROM jobs WHERE status IN ('queued','generating','evaluating')"
            ).fetchone()[0]
            if active >= 8:
                raise AppError(
                    "QUEUE_FULL", "The local queue is full. Wait for an edit to finish.", 429
                )
            if retry:
                row = db.execute("SELECT data FROM runs WHERE id=?", (run["id"],)).fetchone()
                current = json.loads(row["data"])
                check_transition(current["status"], "queued")
                if not current["candidates"] or (
                    current["status"] == "partial"
                    and not any(c.get("evaluation") is None for c in current["candidates"])
                ):
                    raise AppError("JOB_CONFLICT", "There are no failed evaluations to retry.", 409)
                current.update(status="queued", job_id=job["id"], updated_at=now(), error=None)
                run = current
                db.execute(
                    "UPDATE runs SET status=?, data=? WHERE id=?",
                    ("queued", json.dumps(run), run["id"]),
                )
            else:
                db.execute(
                    "INSERT INTO runs VALUES (?, ?, ?, ?)",
                    (run["id"], run["status"], run["created_at"], json.dumps(run)),
                )
            db.execute(
                "INSERT INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    job["id"],
                    run["id"],
                    job["request_key"],
                    job["payload_hash"],
                    job["kind"],
                    "queued",
                    now(),
                ),
            )
            if draft_binding:
                db.execute(
                    "UPDATE editing_drafts SET submitted_run_id=?, updated_at=? WHERE id=?",
                    (run["id"], now(), draft_binding[0]),
                )
        return str(run["id"])

    @staticmethod
    def _editing_draft(db: sqlite3.Connection, draft_id: str) -> dict[str, Any]:
        row = db.execute("SELECT * FROM editing_drafts WHERE id=?", (draft_id,)).fetchone()
        if row is None:
            raise AppError("DRAFT_NOT_FOUND", "Editing draft not found.", 404)
        result = dict(row)
        result["data"] = json.loads(result["data"])
        asset = db.execute("SELECT width, height FROM assets WHERE id=?",
                           (result["source_image"],)).fetchone()
        result["source_size"] = [asset[0], asset[1]]
        return {
            k: v
            for k, v in result.items()
            if k not in {"creation_key", "creation_hash", "mutation_key", "mutation_hash"}
        }

    def editing_draft(self, draft_id: str) -> dict[str, Any]:
        with self.connection() as db:
            return self._editing_draft(db, draft_id)

    def create_editing_draft(
        self,
        draft_id: str,
        source: str,
        data: dict[str, Any],
        key: str,
        hashed: str,
        validate: Callable[[], None],
    ) -> dict[str, Any]:
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT id, creation_hash FROM editing_drafts WHERE creation_key=?", (key,)
            ).fetchone()
            if existing:
                if existing["creation_hash"] != hashed:
                    raise AppError("DRAFT_CONFLICT", "Creation key belongs to another draft.", 409)
                return self._editing_draft(db, existing["id"])
            validate()
            db.execute(
                "INSERT INTO editing_drafts VALUES (?, ?, ?, 0, ?, ?, NULL, NULL, ?, ?, NULL)",
                (draft_id, source, json.dumps(data), key, hashed, now(), now()),
            )
            return self._editing_draft(db, draft_id)

    def update_editing_draft(
        self,
        draft_id: str,
        revision: int,
        key: str,
        hashed: str,
        data: dict[str, Any],
        validate: Callable[[dict[str, Any]], None],
    ) -> dict[str, Any]:
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            draft = self._editing_draft(db, draft_id)
            row = db.execute(
                "SELECT mutation_key, mutation_hash FROM editing_drafts WHERE id=?", (draft_id,)
            ).fetchone()
            if draft["submitted_run_id"]:
                raise AppError("DRAFT_CONFLICT", "Submitted draft is read-only.", 409)
            if row["mutation_key"] == key:
                if row["mutation_hash"] != hashed or draft["revision"] != revision + 1:
                    raise AppError("DRAFT_CONFLICT", "Mutation key conflicts.", 409)
                return draft
            if draft["revision"] != revision:
                raise AppError("DRAFT_CONFLICT", "Draft changed in another view. Reload.", 409)
            validate(draft)
            db.execute(
                "UPDATE editing_drafts SET data=?, revision=revision+1, mutation_key=?, "
                "mutation_hash=?, updated_at=? WHERE id=?",
                (json.dumps(data), key, hashed, now(), draft_id),
            )
            return self._editing_draft(db, draft_id)

    def mutate(
        self,
        run_id: str,
        update: Callable[[dict[str, Any]], None | bool],
        *,
        job_id: str | None = None,
        status: str | None = None,
    ) -> dict[str, Any]:
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT data FROM runs WHERE id=?", (run_id,)).fetchone()
            if row is None:
                raise AppError("RUN_NOT_FOUND", "Edit not found.", 404)
            run = json.loads(row["data"])
            if job_id and run["job_id"] != job_id:
                raise AppError("JOB_CONFLICT", "A newer attempt owns this edit.", 409)
            if status:
                check_transition(run["status"], status)
            if update(run) is False:
                return self.compatible(run)
            if status:
                run["status"] = status
                db.execute("UPDATE jobs SET status=? WHERE id=?", (status, run["job_id"]))
            run["updated_at"] = now()
            db.execute(
                "UPDATE runs SET status=?, data=? WHERE id=?",
                (run["status"], json.dumps(run), run_id),
            )
        return self.compatible(run)

    @staticmethod
    def _starter(db: sqlite3.Connection, field: str, value: str) -> dict[str, Any] | None:
        # field is an internal constant; user input is always a bound parameter.
        if field not in {"id", "request_key"}:
            raise ValueError("Invalid starter lookup")
        row = db.execute(
            "SELECT draft.value FROM runs, "
            "json_each(runs.data, '$.continuation_starters') AS draft "
            "WHERE json_extract(draft.value, ?) = ? LIMIT 1",
            (f"$.{field}", value),
        ).fetchone()
        return json.loads(row[0]) if row else None

    def starter(self, value: str, *, request_key: bool = False) -> dict[str, Any] | None:
        with self.connection() as db:
            return self._starter(db, "request_key" if request_key else "id", value)

    def register_starter(
        self,
        run_id: str,
        draft: dict[str, Any],
        validate: Callable[[dict[str, Any]], None],
        width: int,
        height: int,
    ) -> dict[str, Any]:
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = self._starter(db, "request_key", draft["request_key"])
            if existing:
                if existing["payload_hash"] != draft["payload_hash"]:
                    raise AppError(
                        "JOB_CONFLICT", "Request key belongs to another continuation.", 409
                    )
                return existing
            row = db.execute("SELECT data FROM runs WHERE id=?", (run_id,)).fetchone()
            if row is None:
                raise AppError("RUN_NOT_FOUND", "Edit not found.", 404)
            run = json.loads(row[0])
            validate(run)
            db.execute(
                "INSERT INTO assets VALUES (?, 'original', ?, ?)",
                (draft["source_image"], width, height),
            )
            run.setdefault("continuation_starters", []).append(draft)
            db.execute("UPDATE runs SET data=? WHERE id=?", (json.dumps(run), run_id))
        return draft

    def next_job(self) -> dict[str, Any] | None:
        with self.connection() as db:
            row = db.execute(
                "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1"
            ).fetchone()
        return dict(row) if row else None

    def recover(self) -> None:
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            rows = db.execute(
                "SELECT data FROM runs WHERE status IN ('generating','evaluating')"
            ).fetchall()
            for row in rows:
                run = json.loads(row["data"])
                # Outputs survive restart. Evaluation can be safely repeated, generation cannot.
                run["status"] = "failed_evaluation" if run["candidates"] else "failed_generation"
                run["error"] = {
                    "code": "PROCESS_INTERRUPTED",
                    "message": "The app stopped during this job. Saved candidates are preserved.",
                }
                run["generation_retry_safe"] = run["provider"] == "mock"
                run["updated_at"] = now()
                db.execute(
                    "UPDATE runs SET status=?, data=? WHERE id=?",
                    (run["status"], json.dumps(run), run["id"]),
                )
                db.execute("UPDATE jobs SET status=? WHERE id=?", (run["status"], run["job_id"]))
