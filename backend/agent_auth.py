"""Single-user local trust: scoped Agent digest registry and independent browser sessions."""

import hashlib
import hmac
import json
import secrets
import threading
import time
from typing import Any

from fastapi import Request

from backend.agent_services import web_port
from backend.persistence import Repository
from backend.schemas import AppError


def token_digest(token: str) -> str:
    try:
        raw = bytes.fromhex(token)
    except ValueError:
        raw = b""
    if len(raw) != 32:
        raise AppError("UNAUTHORIZED", "Agent credential is invalid or revoked.", 401)
    return hashlib.sha256(raw).hexdigest()


class LocalAuth:
    def __init__(self, repo: Repository):
        self.repo = repo
        self._session_lock = threading.RLock()
        self.sessions: dict[str, tuple[str, float]] = {}

    @staticmethod
    def trusted_browser(request: Request) -> bool:
        allowed = {f"http://127.0.0.1:{web_port()}", f"http://localhost:{web_port()}"}
        origin = request.headers.get("origin")
        site = request.headers.get("sec-fetch-site")
        return (
            origin in allowed or (origin is None and site in {"same-origin", "same-site"})
        ) and site != "cross-site"

    def bootstrap(self, request: Request) -> tuple[str, str]:
        with self._session_lock:
            return self._bootstrap(request)

    def _bootstrap(self, request: Request) -> tuple[str, str]:
        if request.headers.get("authorization") or not self.trusted_browser(request):
            raise AppError("UNAUTHORIZED", "Open VowEdit from the local Web application.", 401)
        existing = request.cookies.get("vowedit_browser", "")
        value = self.sessions.get(existing)
        if value and value[1] > time.time():
            return existing, value[0]
        self.sessions = {k: v for k, v in self.sessions.items() if v[1] > time.time()}
        if len(self.sessions) >= 64:
            raise AppError("SESSION_LIMIT", "Too many local browser sessions.", 429)
        session, csrf = secrets.token_hex(32), secrets.token_hex(32)
        self.sessions[session] = csrf, time.time() + 43200
        return session, csrf

    def principal(self, request: Request) -> str:
        authorization = request.headers.get("authorization")
        if authorization is not None:
            if not authorization.startswith("Bearer "):
                raise AppError("UNAUTHORIZED", "Use an active scoped credential.", 401)
            digest = token_digest(authorization[7:])
            with self.repo.connection() as db:
                rows = db.execute("SELECT id,digest,revoked FROM agent_credentials").fetchall()
            match = None
            for row in rows:
                if hmac.compare_digest(row["digest"], digest) and not row["revoked"]:
                    match = str(row["id"])
            if match is None:
                raise AppError("UNAUTHORIZED", "Agent credential is invalid or revoked.", 401)
            return match
        with self._session_lock:
            value = self.sessions.get(request.cookies.get("vowedit_browser", ""))
        if not value or value[1] <= time.time():
            raise AppError("UNAUTHORIZED", "Reload VowEdit to establish a browser session.", 401)
        if request.method not in {"GET", "HEAD"}:
            if not self.trusted_browser(request) or not hmac.compare_digest(
                value[0], request.headers.get("x-vowedit-csrf", "")
            ):
                raise AppError("CSRF_REJECTED", "Reload VowEdit before saving.", 403)
        return "user"


def register(repo: Repository, token: str, client_id: str) -> None:
    with repo.transaction() as db:
        db.execute(
            "INSERT INTO agent_credentials VALUES (?,?,0,?) ON CONFLICT(id) "
            "DO UPDATE SET digest=excluded.digest,revoked=0",
            (client_id, token_digest(token), json.dumps({})),
        )


def public_error(exc: AppError) -> dict[str, Any]:
    return {"error": {"code": exc.code, "message": exc.message}}
