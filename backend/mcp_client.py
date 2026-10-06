"""Bounded HTTP adapter. No database, provider, worker or service construction."""

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

import httpx

from backend.agent_credentials import verify_private
from backend.schemas import AppError

MAX_RESPONSE = 512 * 1024


class AgentClient:
    def __init__(self, credential: Path, *, no_open: bool = False):
        verify_private(credential)
        config = json.loads(credential.read_text(encoding="utf-8"))
        port = config["api_port"]
        if type(port) is not int or not 1024 <= port <= 65535:
            raise ValueError("Invalid numeric loopback port")
        token = config["token"]
        if not isinstance(token, str) or not re.fullmatch(r"[a-f0-9]{64}", token):
            raise ValueError("Invalid credential")
        self.no_open = no_open
        self.http = httpx.Client(
            base_url=f"http://127.0.0.1:{port}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
            trust_env=False,
            follow_redirects=False,
        )

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        try:
            with self.http.stream(method, path, json=payload) as response:
                chunks = bytearray()
                for chunk in response.iter_bytes():
                    chunks.extend(chunk)
                    if len(chunks) > MAX_RESPONSE:
                        raise AppError("RESPONSE_TOO_LARGE", "Use the exact VowEdit page.", 502)
                data = json.loads(chunks)
                if not response.is_success:
                    error = data.get("error", {})
                    # Server codes only; external free-form messages never go into tool errors.
                    code = error.get("code", "SERVICE_ERROR")
                    if not isinstance(code, str) or not re.fullmatch(r"[A-Z_]{1,64}", code):
                        code = "SERVICE_ERROR"
                    raise AppError(
                        code,
                        "Open VowEdit to inspect and recover this request.",
                        response.status_code,
                    )
                return data
        except (httpx.HTTPError, ValueError) as exc:
            raise AppError(
                "SERVICE_UNAVAILABLE",
                "Start the existing loopback FastAPI and Next Web services, then retry.",
                503,
            ) from exc

    def open_ui(self, context: dict[str, Any]) -> dict[str, Any]:
        url = context["ui_url"]
        if not re.fullmatch(
            r"http://127\.0\.0\.1:[0-9]{4,5}/(?:drafts|edit)/"
            r"[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}",
            url,
        ):
            raise AppError("UI_OPEN_FAILED", "Server returned an invalid exact UI link.", 502)
        if self.no_open:
            return {
                **context,
                "open_status": "not_requested",
                "page_visible": "unverified",
                "next_step": "Open the exact ui_url in a browser.",
            }
        try:
            if os.name == "nt":
                os.startfile(url)
            else:
                subprocess.run(
                    ["xdg-open", url],
                    timeout=5,
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            return {
                **context,
                "open_status": "requested",
                "page_visible": "unverified",
                "next_step": "Verify the exact draft/run loaded in VowEdit.",
            }
        except (OSError, subprocess.SubprocessError):
            return {
                **context,
                "open_status": "failed",
                "error": {"code": "UI_OPEN_FAILED"},
                "page_visible": "unverified",
                "next_step": "Open the retained ui_url manually.",
            }
