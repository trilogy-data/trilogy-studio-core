"""The standalone engine app: private by default, browser-readable when keyed."""

from __future__ import annotations

from fastapi.testclient import TestClient

import app as engine_app
import remote_engine

KEY = "tre_app_test"
STUDIO = "https://trilogydata.dev"


def keyed() -> remote_engine.EngineSettings:
    return remote_engine.EngineSettings(
        api_keys={"tester": remote_engine.hash_key(KEY)}
    )


def test_without_keys_only_health_is_served() -> None:
    client = TestClient(engine_app.create_app(remote_engine.EngineSettings()))
    assert client.get("/health").status_code == 200
    assert client.get("/v1/info").status_code == 404
    response = client.post("/v1/connect", json={"driver": "databricks", "config": {}})
    assert response.status_code == 404


def test_keyed_routes_require_the_key() -> None:
    client = TestClient(engine_app.create_app(keyed()))
    assert client.get("/v1/info").status_code == 401
    ok = client.get("/v1/info", headers={"Authorization": f"Bearer {KEY}"})
    assert ok.status_code == 200
    assert "databricks" in ok.json()["drivers"]


def test_the_service_defaults_to_strict_egress(monkeypatch) -> None:
    monkeypatch.delenv("TRILOGY_ENGINE_STRICT_EGRESS", raising=False)
    assert remote_engine.EngineSettings.from_env(hosted=True).policy.strict
    monkeypatch.setenv("TRILOGY_ENGINE_STRICT_EGRESS", "0")
    assert not remote_engine.EngineSettings.from_env(hosted=True).policy.strict


def test_cors_preflight_and_exposed_headers() -> None:
    client = TestClient(engine_app.create_app(keyed()))
    preflight = client.options(
        "/v1/connect",
        headers={
            "Origin": STUDIO,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == STUDIO

    response = client.get(
        "/v1/info", headers={"Authorization": f"Bearer {KEY}", "Origin": STUDIO}
    )
    exposed = response.headers["access-control-expose-headers"]
    for header in remote_engine.EXPOSED_HEADERS:
        assert header in exposed

    other = client.options(
        "/v1/connect",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in other.headers
