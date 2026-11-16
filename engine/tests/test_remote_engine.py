"""The remote engine against a scripted Databricks.

`FakeDatabricks` answers the Statement Execution API through an httpx
MockTransport, so these run offline. Live coverage is
`test_remote_engine_live.py`, skipped unless DATABRICKS_* are set.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pyarrow as pa
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import databricks_engine as dbx
import remote_engine

KEY = "tre_test_key"
AUTH = {"Authorization": f"Bearer {KEY}"}
HOST = "http://localhost"
WAREHOUSE = "wh123"
TOKEN = "dapi-secret"
CALLER = {"host": HOST, "httpPath": f"/sql/1.0/warehouses/{WAREHOUSE}", "token": TOKEN}


def ipc(table: pa.Table) -> bytes:
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return sink.getvalue().to_pybytes()


def lz4_frame(data: bytes) -> bytes:
    sink = pa.BufferOutputStream()
    with pa.output_stream(sink, compression="lz4") as out:
        out.write(data)
    return sink.getvalue().to_pybytes()


class FakeDatabricks:
    """Just enough of /api/2.0/sql to drive the engine."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.statements: dict[str, dict[str, Any]] = {}
        self.downloads: dict[str, bytes] = {}
        self.canceled: list[str] = []
        self.submitted: list[dict[str, Any]] = []
        # Polls a statement stays RUNNING for, keyed by SQL text.
        self.slow: dict[str, int] = {}
        self.chunks: dict[str, list[bytes]] = {}
        self.compression: str | None = None
        self.manifest_bytes: int | None = None
        self.link_host = HOST

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if path.startswith("/download/"):
            assert "authorization" not in request.headers, "token sent to storage"
            return httpx.Response(200, content=self.downloads[path])
        if request.headers.get("authorization") != f"Bearer {TOKEN}":
            return httpx.Response(401, json={"message": "bad token"})
        if path == f"/api/2.0/sql/warehouses/{WAREHOUSE}":
            return httpx.Response(200, json={"id": WAREHOUSE, "state": "STOPPED"})
        if path == dbx.STATEMENTS_PATH and request.method == "POST":
            body = json.loads(request.content)
            self.submitted.append(body)
            sid = f"0000-stmt-{len(self.statements):04d}"
            self.statements[sid] = {"body": body, "polls": 0}
            return httpx.Response(200, json=self.state_of(sid))
        if path.endswith("/cancel"):
            sid = path.split("/")[-2]
            self.canceled.append(sid)
            self.statements[sid]["canceled"] = True
            return httpx.Response(200, json={})
        if "/result/chunks/" in path:
            sid, index = path.split("/")[-4], int(path.split("/")[-1])
            return httpx.Response(200, json={"external_links": [self.link(sid, index)]})
        sid = path.split("/")[-1]
        self.statements[sid]["polls"] += 1
        return httpx.Response(200, json=self.state_of(sid))

    def link(self, sid: str, index: int) -> dict[str, Any]:
        chunks = self.chunks[self.statements[sid]["body"]["statement"]]
        url = f"/download/{sid}/{index}"
        data = chunks[index]
        self.downloads[url] = lz4_frame(data) if self.compression else data
        link: dict[str, Any] = {
            "external_link": f"{self.link_host}{url}",
            "http_headers": {"x-ms-blob-type": "BlockBlob"},
        }
        if index + 1 < len(chunks):
            link["next_chunk_internal_link"] = (
                f"{dbx.STATEMENTS_PATH}/{sid}/result/chunks/{index + 1}"
            )
        return link

    def state_of(self, sid: str) -> dict[str, Any]:
        record = self.statements[sid]
        sql = record["body"]["statement"]
        if record.get("canceled"):
            return {"statement_id": sid, "status": {"state": "CANCELED"}}
        if record["polls"] < self.slow.get(sql, 0):
            return {"statement_id": sid, "status": {"state": "RUNNING"}}
        if sql.startswith("FAIL"):
            return {
                "statement_id": sid,
                "status": {
                    "state": "FAILED",
                    "error": {"message": "[TABLE_OR_VIEW_NOT_FOUND] nope"},
                },
            }
        manifest: dict[str, Any] = {
            "schema": {
                "columns": [
                    {"name": "id", "type_name": "LONG"},
                    {
                        "name": "amount",
                        "type_name": "DECIMAL",
                        "type_precision": 10,
                        "type_scale": 2,
                    },
                ]
            }
        }
        if self.compression:
            manifest["result_compression"] = self.compression
        if self.manifest_bytes is not None:
            manifest["total_byte_count"] = self.manifest_bytes
        response: dict[str, Any] = {
            "statement_id": sid,
            "status": {"state": "SUCCEEDED"},
            "manifest": manifest,
        }
        if record["body"]["format"] == "JSON_ARRAY":
            response["result"] = {"data_array": self.rows_for(sql)}
        elif self.chunks.get(sql):
            response["result"] = {"external_links": [self.link(sid, 0)]}
        else:
            response["result"] = {}
        return response

    @staticmethod
    def rows_for(sql: str) -> list[list[str | None]]:
        if "information_schema.tables" in sql:
            return [["orders", "MANAGED", "all orders"], ["v_orders", "VIEW", None]]
        if "information_schema.columns" in sql:
            return [
                ["id", "bigint", "NO", None],
                ["tags", "array<string>", "YES", "labels"],
            ]
        if "information_schema.catalogs" in sql:
            return [["main"], ["samples"]]
        return []


def make_client(
    fake: FakeDatabricks,
    server: bool = True,
    **overrides: Any,
) -> TestClient:
    settings = remote_engine.EngineSettings(
        api_keys={"tester": remote_engine.hash_key(KEY)},
        server_databricks=(
            dbx.DatabricksSettings.from_values(
                HOST, None, WAREHOUSE, TOKEN, "main", "sales"
            )
            if server
            else None
        ),
        poll_seconds=overrides.pop("poll_seconds", 5),
        **overrides,
    )
    app = FastAPI()
    app.include_router(
        remote_engine.create_engine_router(settings, transport=fake.transport()),
        prefix="/engine",
    )
    return TestClient(app)


@pytest.fixture
def fake() -> FakeDatabricks:
    return FakeDatabricks()


@pytest.fixture(autouse=True)
def fast_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(dbx.time, "sleep", lambda _s: None)


def decode(response: httpx.Response) -> pa.Table:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == remote_engine.ARROW_MEDIA_TYPE
    return pa.ipc.open_stream(response.content).read_all()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def test_requires_api_key(fake: FakeDatabricks) -> None:
    client = make_client(fake)
    assert client.get("/engine/v1/info").status_code == 401
    bad = client.get("/engine/v1/info", headers={"Authorization": "Bearer nope"})
    assert bad.status_code == 401
    assert client.get("/engine/v1/info", headers=AUTH).status_code == 200
    # Nothing reached Databricks without a key.
    assert fake.requests == []


def test_custom_auth_dependency_replaces_bearer(fake: FakeDatabricks) -> None:
    """`trilogy serve` mounts the router behind its own X-Trilogy-Token."""
    from fastapi import Header, HTTPException

    def serve_token(x_trilogy_token: str | None = Header(default=None)) -> str:
        if x_trilogy_token != "serve-token":
            raise HTTPException(401, "bad token")
        return "serve"

    settings = remote_engine.EngineSettings(
        server_databricks=dbx.DatabricksSettings.from_values(
            HOST, None, WAREHOUSE, TOKEN
        )
    )
    app = FastAPI()
    app.include_router(
        remote_engine.create_engine_router(
            settings, auth=serve_token, transport=fake.transport()
        )
    )
    client = TestClient(app)
    assert client.post("/v1/connect", json={}).status_code == 401
    ok = client.post("/v1/connect", json={}, headers={"X-Trilogy-Token": "serve-token"})
    assert ok.status_code == 200, ok.text


def test_disabled_without_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    # The app then mounts /health only: tests/test_app.py.
    monkeypatch.delenv("TRILOGY_ENGINE_API_KEYS", raising=False)
    assert not remote_engine.EngineSettings.from_env(hosted=True).enabled


def test_parse_api_keys_drops_malformed() -> None:
    digest = remote_engine.hash_key("k")
    keys = remote_engine.parse_api_keys(f"a:{digest}, b:short, :{digest}, c:{'z' * 64}")
    assert keys == {"a": digest}


# ---------------------------------------------------------------------------
# Connect and credentials
# ---------------------------------------------------------------------------


def test_connect_with_server_warehouse(fake: FakeDatabricks) -> None:
    response = make_client(fake).post("/engine/v1/connect", json={}, headers=AUTH)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "queryType": "databricks",
        "capabilities": {"cancel": True, "describe": True},
    }
    # A metadata call, not a statement: it must not start the warehouse.
    assert [r.url.path for r in fake.requests] == [
        f"/api/2.0/sql/warehouses/{WAREHOUSE}"
    ]


def test_connect_with_caller_credentials(fake: FakeDatabricks) -> None:
    response = make_client(fake, server=False).post(
        "/engine/v1/connect", json={"config": CALLER}, headers=AUTH
    )
    assert response.status_code == 200, response.text


def test_caller_host_never_receives_server_token(fake: FakeDatabricks) -> None:
    """Naming a host without a token must not borrow the server's token."""
    response = make_client(fake).post(
        "/engine/v1/connect",
        json={"config": {"host": "https://evil.example"}},
        headers=AUTH,
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_request"
    assert "token is required" in response.json()["message"]
    assert fake.requests == []


def test_no_warehouse_configured(fake: FakeDatabricks) -> None:
    response = make_client(fake, server=False).post(
        "/engine/v1/connect", json={}, headers=AUTH
    )
    assert response.status_code == 400
    assert "no Databricks warehouse configured" in response.json()["message"]


def test_caller_credentials_can_be_disabled(fake: FakeDatabricks) -> None:
    client = make_client(fake, allow_caller_credentials=False)
    refused = client.post("/engine/v1/connect", json={"config": CALLER}, headers=AUTH)
    assert refused.status_code == 400
    # Catalog / schema overrides are still fine.
    ok = client.post(
        "/engine/v1/connect", json={"config": {"catalog": "x"}}, headers=AUTH
    )
    assert ok.status_code == 200


def test_bad_token_message_has_hint_and_no_secret(fake: FakeDatabricks) -> None:
    config = {**CALLER, "token": "wrong-token"}
    response = make_client(fake).post(
        "/engine/v1/connect", json={"config": config}, headers=AUTH
    )
    assert response.status_code == 502
    message = response.json()["message"]
    assert "Databricks API error (401)" in message and "access token" in message
    assert "wrong-token" not in message


# ---------------------------------------------------------------------------
# Execute
# ---------------------------------------------------------------------------


def test_execute_multi_chunk_lz4(fake: FakeDatabricks) -> None:
    sql = "SELECT id, amount FROM orders"
    fake.compression = "LZ4_FRAME"
    fake.chunks[sql] = [
        ipc(pa.table({"id": [1, 2]})),
        ipc(pa.table({"id": [3]})),
    ]
    response = make_client(fake).post(
        "/engine/v1/statements", json={"sql": sql}, headers=AUTH
    )
    table = decode(response)
    assert table.column("id").to_pylist() == [1, 2, 3]
    assert response.headers["X-Row-Count"] == "3"
    assert response.headers["X-Statement-Id"].startswith("0000-stmt-")
    body = fake.submitted[0]
    assert body["disposition"] == "EXTERNAL_LINKS" and body["format"] == "ARROW_STREAM"
    assert body["catalog"] == "main" and body["schema"] == "sales"


def test_execute_empty_result_keeps_columns(fake: FakeDatabricks) -> None:
    response = make_client(fake).post(
        "/engine/v1/statements", json={"sql": "SELECT 1 WHERE false"}, headers=AUTH
    )
    table = decode(response)
    assert table.num_rows == 0
    assert table.schema.names == ["id", "amount"]
    assert table.schema.field("amount").type == pa.decimal128(10, 2)


def test_slow_statement_is_submit_then_poll(fake: FakeDatabricks) -> None:
    sql = "SELECT slow"
    fake.slow[sql] = 50
    fake.chunks[sql] = [ipc(pa.table({"id": [7]}))]
    client = make_client(fake, poll_seconds=1)
    first = client.post("/engine/v1/statements", json={"sql": sql}, headers=AUTH)
    assert first.status_code == 202
    statement_id = first.json()["statementId"]
    fake.slow[sql] = 0
    done = client.post(f"/engine/v1/statements/{statement_id}", json={}, headers=AUTH)
    assert decode(done).column("id").to_pylist() == [7]


def test_cancel(fake: FakeDatabricks) -> None:
    sql = "SELECT forever"
    fake.slow[sql] = 10_000
    client = make_client(fake, poll_seconds=1)
    statement_id = client.post(
        "/engine/v1/statements", json={"sql": sql}, headers=AUTH
    ).json()["statementId"]
    canceled = client.post(
        f"/engine/v1/statements/{statement_id}/cancel", json={}, headers=AUTH
    )
    assert canceled.json() == {"canceled": True}
    assert fake.canceled == [statement_id]
    after = client.post(f"/engine/v1/statements/{statement_id}", json={}, headers=AUTH)
    assert after.status_code == 409 and after.json()["code"] == "canceled"


def test_failed_statement_passes_message_through(fake: FakeDatabricks) -> None:
    response = make_client(fake).post(
        "/engine/v1/statements", json={"sql": "FAIL please"}, headers=AUTH
    )
    assert response.status_code == 502
    assert response.json()["message"] == "[TABLE_OR_VIEW_NOT_FOUND] nope"


def test_statement_id_is_validated(fake: FakeDatabricks) -> None:
    response = make_client(fake).post(
        "/engine/v1/statements/..%2F..%2Fwarehouses", json={}, headers=AUTH
    )
    assert response.status_code in (400, 404)
    assert fake.requests == []


def test_parameters_bind_by_bare_name(fake: FakeDatabricks) -> None:
    sql = "SELECT * FROM t WHERE a = :p0 AND b = :p1 AND c::string = :flag"
    response = make_client(fake).post(
        "/engine/v1/statements",
        json={
            "sql": sql,
            "parameters": {":p0": 1, "p0": 2, ":p1": "x", "flag": True, "unused": 5},
        },
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    assert fake.submitted[0]["parameters"] == [
        {"name": "flag", "value": "true", "type": "BOOLEAN"},
        {"name": "p0", "value": "2", "type": "BIGINT"},
        {"name": "p1", "value": "x", "type": "STRING"},
    ]


def test_list_parameter_rejected(fake: FakeDatabricks) -> None:
    response = make_client(fake).post(
        "/engine/v1/statements",
        json={"sql": "SELECT :xs", "parameters": {"xs": [1, 2]}},
        headers=AUTH,
    )
    assert response.status_code == 502
    assert "list or struct" in response.json()["message"]
    assert fake.submitted == []


def test_result_size_cap_from_manifest(fake: FakeDatabricks) -> None:
    sql = "SELECT big"
    fake.chunks[sql] = [ipc(pa.table({"id": [1]}))]
    fake.manifest_bytes = 10_000_000
    response = make_client(fake, max_result_bytes=1_000_000).post(
        "/engine/v1/statements", json={"sql": sql}, headers=AUTH
    )
    assert response.status_code == 413
    assert response.json()["code"] == "too_large"
    assert not any(r.url.path.startswith("/download/") for r in fake.requests)


def test_busy_engine_sheds_load(fake: FakeDatabricks) -> None:
    response = make_client(fake, max_inflight=0).post(
        "/engine/v1/connect", json={}, headers=AUTH
    )
    assert response.status_code == 503
    assert response.json()["code"] == "overloaded"
    assert response.headers["Retry-After"] == "2"
    assert fake.requests == []


def test_script_runs_each_statement(fake: FakeDatabricks) -> None:
    response = make_client(fake).post(
        "/engine/v1/script",
        json={"sql": "CREATE TEMP VIEW a AS SELECT ';'; -- done;\nSELECT 2;"},
        headers=AUTH,
    )
    assert response.status_code == 204, response.text
    assert [s["statement"] for s in fake.submitted] == [
        "CREATE TEMP VIEW a AS SELECT ';'",
        "-- done;\nSELECT 2",
    ]


# ---------------------------------------------------------------------------
# Describe
# ---------------------------------------------------------------------------


def test_describe_tables_and_columns(fake: FakeDatabricks) -> None:
    client = make_client(fake)
    tables = client.post(
        "/engine/v1/describe/tables",
        json={"database": "main", "schema": "sales"},
        headers=AUTH,
    )
    assert tables.json() == [
        {
            "name": "orders",
            "schema": "sales",
            "database": "main",
            "description": "all orders",
            "assetType": "table",
        },
        {
            "name": "v_orders",
            "schema": "sales",
            "database": "main",
            "assetType": "view",
        },
    ]
    params = fake.submitted[-1]["parameters"]
    assert {"name": "catalog", "value": "main", "type": "STRING"} in params
    table = client.post(
        "/engine/v1/describe/table",
        json={"database": "main", "schema": "sales", "table": "orders"},
        headers=AUTH,
    ).json()
    assert [(c["name"], c["trilogyType"], c["nullable"]) for c in table["columns"]] == [
        ("id", "int", False),
        ("tags", "array", True),
    ]
    databases = client.post("/engine/v1/describe/databases", json={}, headers=AUTH)
    assert databases.json() == [{"name": "main"}, {"name": "samples"}]


# ---------------------------------------------------------------------------
# Egress policy
# ---------------------------------------------------------------------------


def public_resolver(_host: str) -> list[str]:
    return ["52.1.2.3"]


def strict(resolver=public_resolver) -> dbx.EgressPolicy:
    return dbx.EgressPolicy(strict=True, resolver=resolver)


def test_strict_refuses_non_databricks_host(fake: FakeDatabricks) -> None:
    settings = dbx.DatabricksSettings.from_values(
        "https://example.com", None, WAREHOUSE, TOKEN
    )
    with pytest.raises(dbx.EgressDenied, match="not a Databricks cloud workspace"):
        dbx.DatabricksClient(settings, strict(), transport=fake.transport())


def test_strict_refuses_private_resolution(fake: FakeDatabricks) -> None:
    settings = dbx.DatabricksSettings.from_values(
        "https://dbc-1.cloud.databricks.com", None, WAREHOUSE, TOKEN
    )
    with pytest.raises(dbx.EgressDenied, match="private address"):
        dbx.DatabricksClient(
            settings, strict(lambda _h: ["10.0.0.5"]), transport=fake.transport()
        )


def test_strict_refuses_http_and_odd_ports() -> None:
    policy = strict()
    for url in (
        "http://bucket.s3.amazonaws.com/x",
        "https://bucket.s3.amazonaws.com:8443/x",
        "https://user:pw@bucket.s3.amazonaws.com/x",
    ):
        with pytest.raises(dbx.EgressDenied):
            policy.check_download(url)
    with pytest.raises(dbx.EgressDenied):
        strict(lambda _h: ["169.254.169.254"]).check_download(
            "https://metadata.example/x"
        )
    policy.check_download("https://bucket.s3.amazonaws.com/x?sig=1")


def test_strict_api_paths_stay_under_sql(fake: FakeDatabricks) -> None:
    settings = dbx.DatabricksSettings.from_values(
        "https://dbc-1.cloud.databricks.com", None, WAREHOUSE, TOKEN
    )
    client = dbx.DatabricksClient(settings, strict(), transport=fake.transport())
    for path in ("//evil.example/x", "@evil.example/x", "/api/2.0/secrets/list"):
        with pytest.raises(dbx.EngineError):
            client.url(path)
    assert client.url("/api/2.0/sql/statements/x").startswith("https://dbc-1.")


def test_redirects_are_not_followed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "localhost":
            return httpx.Response(302, headers={"location": "http://127.0.0.2/steal"})
        raise AssertionError("followed a redirect")

    settings = dbx.DatabricksSettings.from_values(HOST, None, WAREHOUSE, TOKEN)
    client = dbx.DatabricksClient(
        settings, dbx.EgressPolicy(), transport=httpx.MockTransport(handler)
    )
    with pytest.raises(dbx.EngineError, match=r"\(302\)"):
        client.verify()


@pytest.mark.parametrize(
    "address,public",
    [
        ("52.1.2.3", True),
        ("2600:1f18::1", True),
        ("10.1.2.3", False),
        ("127.0.0.1", False),
        ("169.254.169.254", False),
        ("100.64.0.1", False),
        ("fdaa::3", False),
        ("::1", False),
        ("fe80::1", False),
        ("::ffff:10.0.0.1", False),
        ("::ffff:52.1.2.3", True),
        ("64:ff9b::a00:1", False),
        ("224.0.0.1", False),
        ("not-an-ip", False),
    ],
)
def test_is_public_address(address: str, public: bool) -> None:
    assert dbx.is_public_address(address) is public


# ---------------------------------------------------------------------------
# Pure helpers (parity with the Rust worker)
# ---------------------------------------------------------------------------


def test_normalize_base_url() -> None:
    assert (
        dbx.normalize_base_url("dbc-1.cloud.databricks.com/?o=1")
        == "https://dbc-1.cloud.databricks.com"
    )
    assert dbx.normalize_base_url("http://localhost:8080/x") == "http://localhost:8080"
    with pytest.raises(dbx.InvalidConfig):
        dbx.normalize_base_url("http://dbc-1.cloud.databricks.com")
    with pytest.raises(dbx.InvalidConfig):
        dbx.normalize_base_url("https://a@evil.example")
    with pytest.raises(dbx.InvalidConfig):
        dbx.normalize_base_url("")


def test_warehouse_id_from_http_path() -> None:
    assert dbx.warehouse_id_from_http_path("/sql/1.0/warehouses/abc") == "abc"
    assert dbx.warehouse_id_from_http_path("sql/1.0/endpoints/def/") == "def"
    assert dbx.warehouse_id_from_http_path("/sql/protocolv1/o/1/0123-cluster") is None


def test_split_statements() -> None:
    script = 'a \'x;y\'; /* ; */ b `c;d`; -- only comment;\n ;  ; e "q\\";"'
    assert dbx.split_statements(script) == ["a 'x;y'", "/* ; */ b `c;d`", 'e "q\\";"']


def test_referenced_param_names_skips_casts() -> None:
    assert dbx.referenced_param_names(
        "select :a, x::int, :_b2 from t where y = :a"
    ) == {"a", "_b2"}


def test_map_databricks_type() -> None:
    assert dbx.map_databricks_type("decimal(10,2)") == "numeric"
    assert dbx.map_databricks_type("ARRAY<STRING>") == "array"
    assert dbx.map_databricks_type("timestamp_ntz") == "datetime"
    assert dbx.map_databricks_type("variant") == "unknown"


def test_download_follows_redirects_with_checks() -> None:
    """Large results on Databricks-managed storage 307 to a sibling path."""
    seen: list[tuple[str, dict[str, str]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((str(request.url), dict(request.headers)))
        if request.url.path == "/a":
            return httpx.Response(307, headers={"location": "/b?sig=1"})
        if request.url.path == "/b":
            return httpx.Response(302, headers={"location": "https://other.example/c"})
        return httpx.Response(200, content=b"data")

    settings = dbx.DatabricksSettings.from_values(
        "https://dbc-1.cloud.databricks.com", None, WAREHOUSE, TOKEN
    )
    client = dbx.DatabricksClient(
        settings, strict(), transport=httpx.MockTransport(handler)
    )
    data = client.download(
        "https://storage.cloud.databricks.com/a", {"x-ms-blob-type": "BlockBlob"}
    )
    assert data == b"data"
    assert [url for url, _ in seen] == [
        "https://storage.cloud.databricks.com/a",
        "https://storage.cloud.databricks.com/b?sig=1",
        "https://other.example/c",
    ]
    for url, headers in seen:
        assert "authorization" not in headers
        # The link's headers stay with the host Databricks named.
        assert ("x-ms-blob-type" in headers) == ("storage.cloud" in url)


def test_download_redirect_to_private_address_refused() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(307, headers={"location": "https://metadata.internal/x"})

    settings = dbx.DatabricksSettings.from_values(
        "https://dbc-1.cloud.databricks.com", None, WAREHOUSE, TOKEN
    )
    client = dbx.DatabricksClient(
        settings, strict(), transport=httpx.MockTransport(handler)
    )
    with pytest.raises(dbx.EgressDenied):
        client.download("https://storage.cloud.databricks.com/a", None)


def test_download_redirect_loop_bounded() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(307, headers={"location": "/again"})

    settings = dbx.DatabricksSettings.from_values(HOST, None, WAREHOUSE, TOKEN)
    client = dbx.DatabricksClient(
        settings, dbx.EgressPolicy(), transport=httpx.MockTransport(handler)
    )
    with pytest.raises(dbx.EngineError, match="too many times"):
        client.download(f"{HOST}/start", None)
    assert calls == dbx.MAX_DOWNLOAD_REDIRECTS + 1
