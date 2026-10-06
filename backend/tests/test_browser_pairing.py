import json
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from backend.api import create_app
from backend.browser_pairing import BrowserPairings
from backend.schemas import AppError

ORIGIN = "chrome-extension://" + "a" * 32
OTHER = "chrome-extension://" + "b" * 32
WEB = {
    "Origin": "http://127.0.0.1:3000",
    "X-VowEdit-Local": "1",
    "Content-Type": "application/json",
}


def paired(client):
    code = client.post(
        "/api/browser-pairing/bootstrap", headers=WEB, json={"origin": ORIGIN}
    ).json()["code"]
    result = client.post(
        "/api/browser-pairing/exchange",
        headers={
            "Origin": ORIGIN,
            "X-VowEdit-Extension-Origin": ORIGIN,
        },
        json={"origin": ORIGIN, "code": code},
    )
    assert result.status_code == 200, result.text
    record = result.json()
    return record, {
        "Authorization": "Bearer " + record["token"],
        "X-VowEdit-Extension-Origin": ORIGIN,
    }


def test_handoff_requires_approval_and_bound_browser_origin(client):
    assert client.get("/api/browser-pairings", headers=WEB).json() == []
    assert client.post("/api/browser-pairing/bootstrap", json={"origin": ORIGIN}).status_code == 403
    code = client.post(
        "/api/browser-pairing/bootstrap", headers=WEB, json={"origin": ORIGIN}
    ).json()["code"]
    for origin in [OTHER, "null", "https://random.example"]:
        assert client.post(
            "/api/browser-pairing/exchange",
            headers={
                "Origin": origin,
                "X-VowEdit-Extension-Origin": origin,
            },
            json={"origin": origin, "code": code},
        ).status_code in {401, 403}
    good = client.post(
        "/api/browser-pairing/exchange",
        headers={
            "Origin": ORIGIN,
            "X-VowEdit-Extension-Origin": ORIGIN,
        },
        json={"origin": ORIGIN, "code": code},
    )
    assert good.status_code == 200
    assert (
        client.post(
            "/api/browser-pairing/exchange",
            headers={
                "Origin": ORIGIN,
                "X-VowEdit-Extension-Origin": ORIGIN,
            },
            json={"origin": ORIGIN, "code": code},
        ).status_code
        == 401
    )


@pytest.mark.parametrize("origin", ["https://evil.example", "http://evil.example", "null", OTHER])
def test_valid_token_wrong_origin_rejected(client, origin):
    _, headers = paired(client)
    assert client.get("/api/config", headers={**headers, "Origin": origin}).status_code == 401


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Sec-Fetch-Site": "none"},
        {"Sec-Fetch-Site": "cross-site"},
        {"Origin": "null"},
        {"Origin": ORIGIN},
        {"X-VowEdit-Extension-Origin": ORIGIN},
        {"Authorization": "Bearer invalid"},
        {"Origin": "http://127.0.0.1:3000", "Authorization": ""},
        {"Origin": "http://127.0.0.1:3000", "X-VowEdit-Extension-Origin": ""},
        {"Origin": "http://127.0.0.1:3000", "Authorization": "Bearer invalid"},
    ],
)
def test_no_legacy_fallback(service, headers):
    with TestClient(create_app(service), headers=headers) as anonymous:
        for method in ["GET", "POST"]:
            assert anonymous.request(method, "/api/config").status_code in {401, 403}


def test_originless_extension_get_and_revocation_cors(client, service):
    record, headers = paired(client)
    # Explicit None removes the default test Web Origin; authentic Chrome headers tested separately.
    client.headers.pop("origin", None)
    assert client.get("/api/config", headers=headers).status_code == 200
    assert client.get("/api/config").status_code == 403
    assert client.get("/api/config", headers={"Sec-Fetch-Site": "same-origin"}).status_code == 200
    extension_headers = {**headers, "Origin": ORIGIN}
    for path in ["/api/browser-pairings", "/api/browser-pairing/bootstrap"]:
        assert client.get(path, headers=extension_headers).status_code == 403
    preflight = client.options(
        "/api/runs",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": (
                "authorization,content-type,x-vowedit-extension-origin"
            ),
        },
    )
    assert preflight.status_code == 204
    assert service.repo.history() == []
    revoked = client.delete("/api/browser-pairing/current", headers=extension_headers)
    assert revoked.status_code == 200
    assert revoked.headers["access-control-allow-origin"] == ORIGIN
    assert client.get("/api/config", headers=headers).status_code == 401
    assert record["token"] not in service.repo.path.read_bytes().decode("latin1")


def test_simple_forms_and_no_cors_fail_before_business(client, service):
    for origin in ["https://random.example", "null"]:
        response = client.post(
            "/api/runs",
            headers={"Origin": origin, "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors"},
            data={"provider": "mock"},
        )
        assert response.status_code == 403
    assert service.repo.history() == []


def test_registry_restart_digest_expiry_corrupt_and_write_failure(tmp_path, monkeypatch):
    path = tmp_path / ".security/pairs.json"
    registry = BrowserPairings(path)
    code = registry.bootstrap(ORIGIN)["code"]
    original_save = registry._save
    monkeypatch.setattr(registry, "_save", lambda _: (_ for _ in ()).throw(OSError("fixture")))
    with pytest.raises(OSError):
        registry.exchange(code, ORIGIN)
    assert not path.exists() and len(registry.pending) == 1
    monkeypatch.setattr(registry, "_save", original_save)
    record = registry.exchange(code, ORIGIN)
    text = path.read_text()
    assert record["token"] not in text and code not in text
    restarted = BrowserPairings(path)
    assert restarted.authenticate(record["token"], ORIGIN, None) == record["id"]
    restarted.records[0]["expires_at"] = time.time() - 1
    with pytest.raises(AppError):
        restarted.authenticate(record["token"], ORIGIN, None)
    path.write_text('{"version":1,"pairs":[{"token":"synthetic-secret"}]}')
    with pytest.raises(AppError, match="PAIRING_UNAVAILABLE"):
        BrowserPairings(path).bootstrap(ORIGIN)
    assert "digest" not in json.dumps(registry.list())


def test_concurrent_code_consumption_and_bounded_pending(tmp_path):
    registry = BrowserPairings(tmp_path / "pairs.json")
    code = registry.bootstrap(ORIGIN)["code"]

    def exchange(_):
        try:
            return registry.exchange(code, ORIGIN)
        except AppError:
            return None

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(exchange, range(4)))
    assert sum(r is not None for r in results) == 1
    for _ in range(16):
        registry.bootstrap(ORIGIN)
    with pytest.raises(AppError):
        registry.bootstrap(ORIGIN)


def test_expired_code_capacity_and_revoke_failure(tmp_path, monkeypatch):
    registry = BrowserPairings(tmp_path / "pairs.json")
    code = registry.bootstrap(ORIGIN)["code"]
    for entry in registry.pending.values():
        entry["expiry"] = time.time() - 1
    with pytest.raises(AppError):
        registry.exchange(code, ORIGIN)
    records = []
    for _ in range(8):
        records.append(registry.exchange(registry.bootstrap(ORIGIN)["code"], ORIGIN))
    ninth = registry.bootstrap(ORIGIN)["code"]
    with pytest.raises(AppError):
        registry.exchange(ninth, ORIGIN)
    original = registry._save
    monkeypatch.setattr(registry, "_save", lambda _: (_ for _ in ()).throw(OSError("fixture")))
    with pytest.raises(OSError):
        registry.revoke(records[0]["id"])
    assert registry.authenticate(records[0]["token"], ORIGIN, None) == records[0]["id"]
    monkeypatch.setattr(registry, "_save", original)
    registry.revoke(records[0]["id"])
    with pytest.raises(AppError):
        registry.authenticate(records[0]["token"], ORIGIN, None)
    assert registry.exchange(ninth, ORIGIN)["id"]


@pytest.mark.parametrize("host", ["evil.example", "127.0.0.1.evil.example", "192.168.0.1"])
def test_authenticated_dns_rebinding_is_rejected(client, host):
    _, headers = paired(client)
    assert client.get("/api/config", headers={**headers, "Host": host}).status_code == 400


def test_synthetic_credentials_never_enter_domain_or_logs(client, service, images, caplog):
    from backend.tests.conftest import payload
    from backend.tests.test_integration import wait_run

    record, headers = paired(client)
    client.headers.pop("origin", None)
    client.headers.update(headers)
    body = payload(client, images)
    run_id = client.post("/api/runs", json=body).json()["id"]
    run = wait_run(client, run_id)
    exported = client.get(f"/api/runs/{run_id}/receipt").text
    assert record["token"] not in json.dumps(run) + exported + caplog.text
    assert record["token"] not in service.repo.path.read_bytes().decode("latin1")
    for asset in service.assets.root.glob("*.png"):
        assert record["token"].encode() not in asset.read_bytes()


def test_api_restart_restores_authority_and_acknowledged_draft(tmp_path, images):
    from uuid import uuid4

    from backend.providers import MockImageEditProvider
    from backend.services import ImageEditService
    from backend.tests.conftest import payload

    with TestClient(
        create_app(ImageEditService(tmp_path, {"mock": MockImageEditProvider()})),
        headers={"Origin": WEB["Origin"]},
    ) as first:
        body = payload(first, images)
        record, headers = paired(first)
        saved = first.post(
            "/api/editing-drafts",
            json={
                "source_image": body["source_image"],
                "request_key": str(uuid4()),
                "data": {"instruction": "Acknowledged before restart"},
            },
        ).json()
    with TestClient(
        create_app(ImageEditService(tmp_path, {"mock": MockImageEditProvider()})),
        headers={**headers, "Origin": ORIGIN},
    ) as restarted:
        assert restarted.get(f"/api/editing-drafts/{saved['id']}").json() == saved
        assert restarted.get("/api/config").status_code == 200
        assert restarted.delete("/api/browser-pairing/current").json() == {"revoked": True}
        assert restarted.get("/api/config").status_code == 401
        assert record["token"] not in (tmp_path / ".security/browser-pairings.json").read_text()
