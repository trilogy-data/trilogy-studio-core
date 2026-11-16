"""The remote engine against a real SQL warehouse.

Skipped unless DATABRICKS_HOST / DATABRICKS_HTTP_PATH / DATABRICKS_TOKEN are
set: the same variables as pytrilogy's live tests and the explorer's
`tests/databricks_live.rs`. Runs with the *strict* egress policy a hosted
deployment uses, so it also confirms real result links pass it.
"""

from __future__ import annotations

import os

import pyarrow as pa
import pyarrow.compute as pc
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import remote_engine

pytestmark = pytest.mark.skipif(
    not all(
        os.environ.get(k)
        for k in ("DATABRICKS_HOST", "DATABRICKS_HTTP_PATH", "DATABRICKS_TOKEN")
    ),
    reason="DATABRICKS_HOST / DATABRICKS_HTTP_PATH / DATABRICKS_TOKEN not set",
)

KEY = "tre_live"
AUTH = {"Authorization": f"Bearer {KEY}"}


@pytest.fixture(scope="module")
def client() -> TestClient:
    settings = remote_engine.EngineSettings.from_env(hosted=True)
    settings.api_keys = {"live": remote_engine.hash_key(KEY)}
    assert settings.policy.strict
    assert settings.server_databricks is not None
    app = FastAPI()
    app.include_router(remote_engine.create_engine_router(settings), prefix="/engine")
    return TestClient(app)


def run(client: TestClient, sql: str, parameters: dict | None = None) -> pa.Table:
    response = client.post(
        "/engine/v1/statements",
        json={"sql": sql, "parameters": parameters},
        headers=AUTH,
    )
    while response.status_code == 202:
        statement_id = response.json()["statementId"]
        response = client.post(
            f"/engine/v1/statements/{statement_id}", json={}, headers=AUTH
        )
    assert response.status_code == 200, response.text
    return pa.ipc.open_stream(response.content).read_all()


def test_connect(client: TestClient) -> None:
    response = client.post("/engine/v1/connect", json={}, headers=AUTH)
    assert response.status_code == 200, response.text


def test_typed_select_with_parameters(client: TestClient) -> None:
    table = run(
        client,
        "SELECT :n AS n, :s AS s, CAST(1.5 AS DECIMAL(10,2)) AS d, "
        "DATE'2024-01-02' AS dt, array(1, 2) AS xs",
        {":n": 41, "n": 42, "s": "hi"},
    )
    row = table.to_pylist()[0]
    assert row["n"] == 42 and row["s"] == "hi" and row["xs"] == [1, 2]
    assert pa.types.is_decimal(table.schema.field("d").type)


def test_large_multi_chunk_result(client: TestClient) -> None:
    # ~64 MB: several chunks, on links that 307 to a sibling path.
    rows = 4_000_000
    table = run(client, f"SELECT id, id * 2 AS twice FROM range({rows})")
    assert table.num_rows == rows
    # No rows lost or duplicated across chunk boundaries.
    assert pc.sum(table.column("id")).as_py() == rows * (rows - 1) // 2


def test_empty_result_keeps_columns(client: TestClient) -> None:
    table = run(client, "SELECT 1 AS a, 'x' AS b WHERE 1 = 0")
    assert table.num_rows == 0 and table.schema.names == ["a", "b"]


def test_describe(client: TestClient) -> None:
    tables = client.post(
        "/engine/v1/describe/tables",
        json={"database": "samples", "schema": "nyctaxi"},
        headers=AUTH,
    )
    assert tables.status_code == 200, tables.text
    assert "trips" in [t["name"] for t in tables.json()]
    columns = client.post(
        "/engine/v1/describe/columns",
        json={"database": "samples", "schema": "nyctaxi", "table": "trips"},
        headers=AUTH,
    ).json()
    assert {"tpep_pickup_datetime", "fare_amount"} <= {c["name"] for c in columns}


def test_error_passthrough(client: TestClient) -> None:
    response = client.post(
        "/engine/v1/statements",
        json={"sql": "SELECT * FROM no_such_table_xyz"},
        headers=AUTH,
    )
    assert response.status_code == 502
    assert "TABLE_OR_VIEW_NOT_FOUND" in response.json()["message"]
