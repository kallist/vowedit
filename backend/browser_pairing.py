"""Loopback browser credentials. No domain state or raw persisted secrets."""

import hashlib
import hmac
import json
import os
import re
import secrets
import time
from pathlib import Path
from threading import RLock
from typing import Any
from uuid import UUID, uuid4

from backend.schemas import AppError

EXTENSION = re.compile(r"chrome-extension://[a-p]{32}\Z")
WEB_ORIGINS = {"http://127.0.0.1:3000", "http://localhost:3000"}
LOCAL_ORIGINS = WEB_ORIGINS | {"http://127.0.0.1:8000", "http://localhost:8000"}


def digest(secret: str, size: int) -> str:
    if not re.fullmatch(r"[0-9a-f]{" + str(size * 2) + "}", secret):
        raise AppError("PAIRING_REFUSED", "Pair again using a new code.", 401)
    return hashlib.sha256(bytes.fromhex(secret)).hexdigest()


def extension_origin(origin: str) -> str:
    if not EXTENSION.fullmatch(origin):
        raise AppError("PAIRING_REFUSED", "Check the extension ID.", 403)
    return origin


class BrowserPairings:
    def __init__(self, path: Path):
        self.path = path
        self.lock = RLock()
        self.pending: dict[str, dict[str, Any]] = {}
        self.attempts: list[float] = []
        self.records: list[dict[str, Any]] = []
        self.corrupt = False
        if path.exists():
            try:
                document = json.loads(path.read_text(encoding="utf-8"))
                if document["version"] != 1 or len(document["pairs"]) > 8:
                    raise ValueError("Invalid registry")
                for record in document["pairs"]:
                    UUID(record["id"])
                    extension_origin(record["origin"])
                    if (
                        set(record) != {"id", "origin", "digest", "expires_at"}
                        or not re.fullmatch(r"[0-9a-f]{64}", record["digest"])
                        or not isinstance(record["expires_at"], (float, int))
                        or not 0 < record["expires_at"] < 1e12
                    ):
                        raise ValueError("Invalid registry")
                self.records = document["pairs"]
            except (ValueError, KeyError, TypeError, AppError, OSError):
                self.corrupt = True

    def healthy(self) -> None:
        if self.corrupt:
            raise AppError("PAIRING_UNAVAILABLE", "Local pairing registry needs repair.", 503)

    def _save(self, records: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f".{uuid4()}.tmp")
        try:
            with temporary.open("x", encoding="utf-8") as stream:
                if os.name != "nt":
                    os.chmod(temporary, 0o600)
                json.dump({"version": 1, "pairs": records}, stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    def bootstrap(self, origin: str) -> dict[str, Any]:
        extension_origin(origin)
        with self.lock:
            self.healthy()
            self.pending = {k: v for k, v in self.pending.items() if v["expiry"] > time.time()}
            if len(self.pending) >= 16:
                raise AppError("PAIRING_REFUSED", "Try pairing later.", 429)
            code = secrets.token_hex(20)
            self.pending[digest(code, 20)] = {"origin": origin, "expiry": time.time() + 300}
            return {"code": code, "expires_in": 300}

    def exchange(self, code: str, origin: str) -> dict[str, Any]:
        extension_origin(origin)
        with self.lock:
            self.healthy()
            self.attempts = [t for t in self.attempts if t > time.time() - 60]
            if len(self.attempts) >= 32:
                raise AppError("PAIRING_REFUSED", "Try pairing later.", 429)
            self.attempts.append(time.time())
            hashed = digest(code, 20)
            matched = next(
                (
                    k
                    for k, v in self.pending.items()
                    if hmac.compare_digest(k, hashed)
                    and v["origin"] == origin
                    and v["expiry"] > time.time()
                ),
                None,
            )
            if matched is None:
                raise AppError("PAIRING_REFUSED", "Pair again using a new code.", 401)
            active = [r for r in self.records if r["expires_at"] > time.time()]
            if len(active) >= 8:
                raise AppError("PAIRING_REFUSED", "Revoke an unused pairing first.", 409)
            token = secrets.token_hex(32)
            record = {
                "id": str(uuid4()),
                "origin": origin,
                "digest": digest(token, 32),
                "expires_at": time.time() + 30 * 86400,
            }
            self._save([*active, record])  # Failure retains the code and never returns a token.
            self.records = [*active, record]
            del self.pending[matched]
            return {**self.public(record), "token": token}

    @staticmethod
    def public(record: dict[str, Any]) -> dict[str, Any]:
        return {k: record[k] for k in ("id", "origin", "expires_at")}

    def authenticate(self, token: str, origin: str, browser_origin: str | None) -> str:
        extension_origin(origin)
        hashed = digest(token, 32)
        with self.lock:
            self.healthy()
            record = next(
                (
                    r
                    for r in self.records
                    if hmac.compare_digest(r["digest"], hashed)
                    and r["origin"] == origin
                    and r["expires_at"] > time.time()
                ),
                None,
            )
            if record is None or (browser_origin is not None and browser_origin != origin):
                raise AppError("PAIRING_REFUSED", "Reconnect or pair again.", 401)
            return str(record["id"])

    def can_preflight(self, origin: str, *, exchange: bool) -> bool:
        with self.lock:
            if self.corrupt or not EXTENSION.fullmatch(origin):
                return False
            if exchange:
                return any(
                    p["origin"] == origin and p["expiry"] > time.time()
                    for p in self.pending.values()
                )
            return any(
                r["origin"] == origin and r["expires_at"] > time.time() for r in self.records
            )

    def list(self) -> list[dict[str, Any]]:
        with self.lock:
            self.healthy()
            return [self.public(r) for r in self.records if r["expires_at"] > time.time()]

    def revoke(self, pairing_id: str) -> None:
        with self.lock:
            self.healthy()
            records = [r for r in self.records if r["id"] != pairing_id]
            self._save(records)
            self.records = records


def extension_route(method: str, path: str) -> bool:
    """Explicit method/route grant, independent of client-supplied metadata."""
    uid = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
    routes = {
        "GET": [
            r"config",
            r"runs",
            f"assets/{uid}",
            f"runs/{uid}(?:/report|/receipt)?",
            f"drafts/{uid}",
            f"editing-drafts/{uid}",
            f"prepared-candidates/{uid}/normalized-raw",
        ],
        "POST": [
            r"assets",
            r"candidate-plans",
            r"runs",
            r"imported-runs",
            r"prepared-candidates",
            r"editing-drafts",
            f"runs/{uid}/(?:continuations|retry-generation|retry-evaluation)",
        ],
        "PUT": [
            f"editing-drafts/{uid}",
            f"runs/{uid}/selection",
            f"runs/{uid}/candidates/{uid}/review",
        ],
        "DELETE": [r"browser-pairing/current"],
    }
    return any(re.fullmatch(f"/api/{route}", path) for route in routes.get(method, []))
