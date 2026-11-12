"""The resolver's access log: what a row holds, and how it reaches BigQuery."""

import json
import time
from datetime import datetime, timezone

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

import access_log
from studio_endpoints import create_trilogy_router

PAYLOAD = {
    "imports": [],
    "full_model": {"name": "", "sources": []},
    "dialect": "duckdb",
    "queries": [
        {"query": "select 1 -> one;", "label": "a"},
        {"query": "select 2 -> two;", "label": "b"},
    ],
}

#: trilogy-cloud's terraform/schemas/resolver_requests.json, column for column.
#: A change here is a change there (and the other way round).
SCHEMA_COLUMNS = [
    "request_id",
    "requested_at",
    "method",
    "route",
    "path",
    "status",
    "latency_ms",
    "queue_ms",
    "request_bytes",
    "dialect",
    "query_count",
    "client_ip",
    "edge_region",
    "user_agent",
    "origin",
    "host",
    "machine_id",
    "country",
    "asn",
    "as_org",
]


class RecordingLog:
    def __init__(self):
        self.records: list[access_log.AccessRecord] = []

    def record(self, record):
        self.records.append(record)


@pytest.fixture
def logged():
    """The studio router behind the same middleware stack main.py builds."""
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex="https://trilogydata.dev",
        allow_methods=["*"],
        allow_headers=["Authorization"],
    )
    app.include_router(create_trilogy_router())

    @app.get("/health")
    async def health():
        return {"status": "healthy"}

    log = RecordingLog()
    app.add_middleware(access_log.AccessLogMiddleware, log=log)
    with TestClient(app) as client:
        yield client, log.records


def test_a_gated_request_records_its_route_dialect_and_batch(logged):
    client, records = logged
    response = client.post(
        "/generate_queries",
        json=PAYLOAD,
        headers={
            "Fly-Client-IP": "203.0.113.9",
            "Fly-Region": "ewr",
            "Origin": "https://trilogydata.dev",
            "User-Agent": "Mozilla/5.0",
        },
    )
    assert response.status_code == 200, response.text
    [row] = records
    assert row.method == "POST"
    assert row.route == "/generate_queries"
    assert row.path is None
    assert row.status == 200
    assert row.dialect == "duck_db"
    assert row.query_count == 2
    assert row.queue_ms is not None and row.queue_ms >= 0
    assert row.latency_ms >= row.queue_ms
    assert row.request_bytes and row.request_bytes > 0
    assert row.client_ip == "203.0.113.9"
    assert row.edge_region == "ewr"
    assert row.origin == "https://trilogydata.dev"
    assert row.user_agent == "Mozilla/5.0"


def test_nothing_from_the_body_but_dialect_and_count(logged):
    client, records = logged
    client.post("/generate_queries", json=PAYLOAD)
    row = access_log.bigquery_row(records[0])
    text = json.dumps(row)
    assert "select 1" not in text and "one" not in text


def test_an_unmatched_path_is_kept_with_ids_masked(logged):
    client, records = logged
    response = client.get(
        "/.env/0f8fe2c4-8e0b-4b8e-9a43-6c1f1e2f3a4b/12345678?secret=x"
    )
    assert response.status_code == 404
    [row] = records
    assert row.route == access_log.UNMATCHED_ROUTE
    assert row.path == "/.env/:id/:id"


def test_a_preflight_is_named_not_counted_as_a_probe(logged):
    client, records = logged
    client.options(
        "/generate_queries",
        headers={
            "Origin": "https://trilogydata.dev",
            "Access-Control-Request-Method": "POST",
        },
    )
    [row] = records
    assert row.route == access_log.PREFLIGHT_ROUTE
    assert row.path is None


def test_health_is_not_recorded(logged):
    client, records = logged
    assert client.get("/health").status_code == 200
    assert records == []


def test_a_gate_refusal_is_a_503_row(monkeypatch, logged):
    import threading

    import studio_endpoints

    client, records = logged
    studio_endpoints._gate()
    monkeypatch.setattr(studio_endpoints, "_slots", threading.BoundedSemaphore(0))
    monkeypatch.setattr(studio_endpoints, "_executor_pid", __import__("os").getpid())
    assert client.post("/generate_queries", json=PAYLOAD).status_code == 503
    [row] = records
    assert row.status == 503
    assert row.queue_ms is None
    assert row.dialect == "duck_db"


def test_the_row_matches_the_bigquery_schema():
    record = access_log.AccessRecord(
        requested_at=datetime(2026, 11, 12, 5, 10, 0, 123456, tzinfo=timezone.utc),
        method="POST",
        route="/generate_query",
        status=200,
        latency_ms=12,
    )
    row = access_log.bigquery_row(record)
    assert list(row) == SCHEMA_COLUMNS
    assert row["requested_at"] == "2026-11-12T05:10:00.123456Z"


def test_masking():
    assert access_log.mask_path("/wp-login.php") == "/wp-login.php"
    assert access_log.mask_path("/a/" + "x" * 40) == "/a/:token"
    assert access_log.mask_path("/v/" + "ab" * 10) == "/v/:id"
    assert len(access_log.mask_path("/" + "a/" * 400)) <= access_log.MAX_PATH_CHARS


@pytest.mark.parametrize(
    ("env", "message"),
    [
        ({"ACCESS_LOG": "bigquery"}, "ACCESS_LOG_TABLE"),
        ({"ACCESS_LOG": "bigquery", "ACCESS_LOG_TABLE": "p.d.t"}, "GCP_SA_KEY"),
        (
            {"ACCESS_LOG": "bigquery", "ACCESS_LOG_TABLE": "p.d", "GCP_SA_KEY": "{}"},
            "project.dataset.table",
        ),
        ({"ACCESS_LOG": "database"}, "not one of"),
    ],
)
def test_a_misconfigured_log_says_so_and_stays_off(monkeypatch, caplog, env, message):
    for key in ("ACCESS_LOG", "ACCESS_LOG_TABLE", "GCP_SA_KEY"):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    with caplog.at_level("ERROR", logger="trilogy.access_log"):
        assert access_log.from_env() is None
    assert message in caplog.text


def test_geo_enrichment():
    class Reader:
        def __init__(self, answer):
            self.answer = answer

        def get(self, ip):
            if ip == "not-an-ip":
                raise ValueError(ip)
            return self.answer

    geo = access_log.Geo(
        Reader({"country": {"iso_code": "DE"}}),
        Reader(
            {
                "autonomous_system_number": 24940,
                "autonomous_system_organization": "Hetzner Online GmbH",
            }
        ),
    )
    record = access_log.AccessRecord(
        requested_at=datetime.now(timezone.utc),
        method="GET",
        route="/",
        status=200,
        latency_ms=1,
        client_ip="198.51.100.4",
    )
    geo.enrich(record)
    assert (record.country, record.asn, record.as_org) == (
        "DE",
        24940,
        "Hetzner Online GmbH",
    )
    bad = access_log.AccessRecord(
        requested_at=datetime.now(timezone.utc),
        method="GET",
        route="/",
        status=200,
        latency_ms=1,
        client_ip="not-an-ip",
    )
    geo.enrich(bad)
    assert bad.country is None


def test_off_by_default(monkeypatch):
    monkeypatch.delenv("ACCESS_LOG", raising=False)
    assert access_log.from_env() is None


def _service_account() -> dict:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    return {
        "client_email": "resolver@example.iam.gserviceaccount.com",
        "private_key": pem,
        "private_key_id": "k1",
    }


def test_insert_signs_once_and_streams_rows():
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
        return httpx.Response(200, json={"kind": "bigquery#tableDataInsertAllResponse"})

    table = access_log.BigQueryTable(
        "proj.api_logs.resolver_requests", _service_account()
    )
    table.http = httpx.Client(transport=httpx.MockTransport(handler))
    record = access_log.AccessRecord(
        requested_at=datetime.now(timezone.utc),
        method="POST",
        route="/generate_query",
        status=200,
        latency_ms=5,
    )
    table.insert([record])
    table.insert([record])

    token_calls = [c for c in calls if c.url.host == "oauth2.googleapis.com"]
    inserts = [c for c in calls if c.url.host == "bigquery.googleapis.com"]
    assert len(token_calls) == 1, "the token is cached"
    assert len(inserts) == 2
    assert inserts[0].url.path.endswith(
        "/projects/proj/datasets/api_logs/tables/resolver_requests/insertAll"
    )
    assert inserts[0].headers["Authorization"] == "Bearer tok"
    body = json.loads(inserts[0].content)
    assert body["rows"][0]["insertId"] == record.request_id


def test_a_row_refusal_is_an_error():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
        return httpx.Response(200, json={"insertErrors": [{"index": 0}]})

    table = access_log.BigQueryTable("p.d.t", _service_account())
    table.http = httpx.Client(transport=httpx.MockTransport(handler))
    record = access_log.AccessRecord(
        requested_at=datetime.now(timezone.utc),
        method="GET",
        route="/",
        status=200,
        latency_ms=1,
    )
    with pytest.raises(RuntimeError, match="refused the batch"):
        table.insert([record])


def test_the_writer_batches_and_survives_a_failed_write():
    written: list[list[access_log.AccessRecord]] = []
    attempts = {"n": 0}

    def write(batch):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise RuntimeError("bigquery is down")
        written.append(batch)

    log = access_log.AccessLog(write, flush_interval=0.05)
    record = access_log.AccessRecord(
        requested_at=datetime.now(timezone.utc),
        method="GET",
        route="/",
        status=200,
        latency_ms=1,
    )
    log.record(record)
    deadline = time.monotonic() + 2
    while attempts["n"] < 1 and time.monotonic() < deadline:
        time.sleep(0.01)
    log.record(record)
    log.record(record)
    while not written and time.monotonic() < deadline:
        time.sleep(0.01)
    assert written and sum(len(b) for b in written) == 2
