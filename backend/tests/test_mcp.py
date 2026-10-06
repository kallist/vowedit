import asyncio
import json
import os
import secrets
import socket
import subprocess
import sys
import time
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from textwrap import dedent
from uuid import uuid4

import httpx
import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from pydantic import AnyUrl

from backend.agent_auth import register
from backend.agent_credentials import verify_private, write_private
from backend.mcp_client import AgentClient
from backend.persistence import Repository


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_real_sdk_stdio_scoped_flow_schema_resources_and_revocation(tmp_path):
    root = tmp_path / "v03-validation-data"
    root.mkdir()
    credential = tmp_path / "credential.json"
    port, principal, token = free_port(), str(uuid4()), secrets.token_hex(32)
    repo = Repository(root / "vowedit.sqlite3")
    register(repo, token, principal)
    write_private(credential, {"token": token, "api_port": port, "client_id": principal})
    verify_private(credential)
    env = {k: v for k, v in os.environ.items() if not k.startswith(("COMFYUI_", "RUNNINGHUB_"))}
    env.update(VOWEDIT_DATA_DIR=str(root.resolve()), PYTHON_DOTENV_DISABLED="1")
    host = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "backend.tests.agent_test_host:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        with httpx.Client(trust_env=False) as http:
            for _ in range(100):
                try:
                    if http.get(f"http://127.0.0.1:{port}/api/config").status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                time.sleep(0.1)
            else:
                raise AssertionError("Isolated HTTP host failed to start")

        async def flow():
            params = StdioServerParameters(
                command=sys.executable,
                args=["-m", "backend.mcp_server", "--credential", str(credential), "--no-open"],
                env=env,
            )
            async with stdio_client(params) as (reader, writer):
                async with ClientSession(
                    reader, writer, read_timeout_seconds=timedelta(seconds=10)
                ) as session:
                    initialized = await session.initialize()
                    assert initialized.serverInfo.name == "vowedit"
                    tools = (await session.list_tools()).tools
                    assert len(tools) == 9
                    assert not any("approve" in t.name or "review" in t.name for t in tools)
                    create_schema = next(
                        t.inputSchema for t in tools if t.name == "vowedit_create_edit"
                    )
                    assert create_schema["additionalProperties"] is False
                    assert create_schema["properties"]["request_key"]["format"] == "uuid"
                    assert all(t.annotations.destructiveHint is False for t in tools)
                    templates = (await session.list_resource_templates()).resourceTemplates
                    assert len(templates) == 2
                    caps = await session.call_tool("vowedit_get_capabilities", {})
                    assert caps.structuredContent["api_version"] == "agent-api-v1"
                    assert caps.structuredContent["host_connection"] == {
                        "transport": "stdio", "initialized": True,
                        "mcp_apps_html_advertised": False,
                    }
                    args = {"request_key": str(uuid4())}
                    result = await session.call_tool("vowedit_create_edit", args)
                    assert not result.isError, result.content
                    draft = result.structuredContent
                    assert draft["status"] == "awaiting_image"
                    assert draft["open_status"] == "not_requested"
                    assert (await session.call_tool("vowedit_create_edit", args)).structuredContent[
                        "id"
                    ] == draft["id"]
                    resource = await session.read_resource(
                        AnyUrl(f"vowedit://drafts/{draft['id']}")
                    )
                    assert json.loads(resource.contents[0].text)["id"] == draft["id"]
                    malformed = await session.call_tool(
                        "vowedit_create_edit", {**args, "actor": "user"}
                    )
                    assert (
                        malformed.isError
                        and malformed.structuredContent["error"]["code"] == "INVALID_INPUT"
                    )
                    unknown = await session.call_tool(
                        "vowedit_get_edit", {"draft_id": str(uuid4())}
                    )
                    assert (
                        unknown.isError
                        and unknown.structuredContent["error"]["code"] == "FORBIDDEN_RESOURCE"
                    )
                    with repo.transaction() as db:
                        assert db.execute("SELECT count(*) FROM jobs").fetchone()[0] == 0
                        db.execute(
                            "UPDATE agent_credentials SET revoked=1 WHERE id=?", (principal,)
                        )
                    revoked = await session.call_tool("vowedit_get_capabilities", {})
                    assert (
                        revoked.isError
                        and revoked.structuredContent["error"]["code"] == "UNAUTHORIZED"
                    )
                    assert token not in json.dumps(draft)

        asyncio.run(flow())
    finally:
        host.terminate()
        host.wait(timeout=10)


def test_private_file_fails_closed_and_opener_failure_keeps_exact_url(tmp_path, monkeypatch):
    credential = tmp_path / "owner.json"
    write_private(credential, {"token": secrets.token_hex(32), "api_port": free_port()})
    client = AgentClient(credential)
    context = {"ui_url": f"http://127.0.0.1:3000/drafts/{uuid4()}"}

    def failed(*args, **kwargs):
        raise OSError("controlled opener failure")

    if os.name == "nt":
        monkeypatch.setattr(os, "startfile", failed)
    else:
        monkeypatch.setattr(subprocess, "run", failed)
    result = client.open_ui(context)
    assert result["open_status"] == "failed"
    assert result["ui_url"] == context["ui_url"] and result["page_visible"] == "unverified"
    with pytest.raises(Exception, match="UI_OPEN_FAILED"):
        client.open_ui({"ui_url": "https://evil.example/"})
    client.http.close()


def test_service_unavailable_has_bounded_machine_error(tmp_path):
    credential = tmp_path / "owner.json"
    write_private(credential, {"token": secrets.token_hex(32), "api_port": free_port()})
    client = AgentClient(credential)
    try:
        with pytest.raises(Exception, match="SERVICE_UNAVAILABLE"):
            client.request("GET", "/api/agent/capabilities")
    finally:
        client.http.close()


@pytest.mark.parametrize("fault", ["timeout", "oversize", "unsafe_error"])
def test_adapter_timeout_size_and_untrusted_error_are_bounded(tmp_path, fault):
    credential = tmp_path / "owner.json"
    write_private(credential, {"token": secrets.token_hex(32), "api_port": free_port()})
    client = AgentClient(credential)
    client.http.close()

    def response(request):
        if fault == "timeout":
            raise httpx.ReadTimeout("secret external detail", request=request)
        if fault == "oversize":
            return httpx.Response(200, content=b"x" * (512 * 1024 + 1))
        return httpx.Response(503, json={"error": {"code": "secret injected detail"}})

    client.http = httpx.Client(transport=httpx.MockTransport(response),
                              base_url="http://127.0.0.1:8000")
    expected = {"timeout": "SERVICE_UNAVAILABLE", "oversize": "RESPONSE_TOO_LARGE",
                "unsafe_error": "SERVICE_ERROR"}[fault]
    try:
        with pytest.raises(Exception, match=expected) as error:
            client.request("GET", "/api/agent/capabilities")
        assert "secret" not in str(error.value)
    finally:
        client.http.close()


def test_actual_owner_permission_rejection(tmp_path):
    credential = tmp_path / "permission-fixture.json"
    write_private(credential, {"token": secrets.token_hex(32), "api_port": free_port()})
    if os.name == "nt":
        result = subprocess.run(
            ["icacls.exe", str(credential), "/grant", "*S-1-5-32-545:R"],
            capture_output=True, timeout=15,
        )
        assert result.returncode == 0, "Controlled ACL fixture setup failed"
    else:
        credential.chmod(0o644)
    with pytest.raises(PermissionError):
        AgentClient(credential)


def test_inherited_owner_data_directory_is_ignored_before_app_import():
    # A controlled sentinel folder, deliberately outside the allowed validation-root names.
    fixture_parent = Path(__file__).resolve().parents[2] / ".local"
    fixture_parent.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="owner-config-fixture-", dir=fixture_parent) as directory:
        owner_fixture = Path(directory)
        sentinel = owner_fixture / "preserved.txt"
        sentinel.write_text("untouched owner fixture", encoding="utf-8")
        script = dedent("""
    import os
    from pathlib import Path
    import backend.tests
    assert Path(os.environ['VOWEDIT_DATA_DIR']).is_absolute()
    assert 'v03-validation-data' in Path(os.environ['VOWEDIT_DATA_DIR']).parts
    assert os.environ['VOWEDIT_DATA_DIR'] != os.environ['VOWEDIT_OWNER_FIXTURE']
    assert not any(k.startswith(('COMFYUI_', 'RUNNINGHUB_')) for k in os.environ)
    assert os.environ['PYTHON_DOTENV_DISABLED'] == '1'
    from backend.api import create_app
    app = create_app()
    assert app.state.service.repo.path.parent == Path(os.environ['VOWEDIT_DATA_DIR'])
    """)
        result = subprocess.run(
            [sys.executable, "-c", script],
            env={**os.environ, "VOWEDIT_DATA_DIR": str(owner_fixture),
                 "VOWEDIT_OWNER_FIXTURE": str(owner_fixture),
                 "COMFYUI_BASE_URL": "fixture-provider-value",
                 "RUNNINGHUB_API_KEY": "fixture-not-a-real-key"},
            capture_output=True, timeout=15,
        )
        assert result.returncode == 0, "Test imports must ignore inherited owner configuration"
        assert list(owner_fixture.iterdir()) == [sentinel]
        assert sentinel.read_text(encoding="utf-8") == "untouched owner fixture"
