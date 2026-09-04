"""Request gate, filter scoping and parse_model sharing regressions."""

import asyncio
import json
import threading
import time
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from trilogy.render import get_dialect_generator

import studio_endpoints
from diagnostics import get_diagnostics
from env_helpers import model_to_response, source_to_model_source
from io_models import ModelInSchema, ModelSourceInSchema, MultiQueryInSchema
from query_helpers import generate_multi_query_core

PAYLOAD = json.loads(
    (Path(__file__).parent / "payloads" / "tpch_large_duckdb.json").read_text(
        encoding="utf-8"
    )
)
BATCH_FILTER = "part.supplier.nation.name = 'FRANCE'"
QUERY_FILTER = "part.manufacturer = 'Manufacturer#1'"


def test_batch_and_per_query_filters_do_not_collide():
    """A batch-level filter and a per-query filter used to both mint
    `__ftest_0`, failing the first query with a redeclaration error."""
    query = MultiQueryInSchema.model_validate(
        {
            "imports": PAYLOAD["imports"],
            "full_model": PAYLOAD["full_model"],
            "dialect": PAYLOAD["dialect"],
            "queries": [
                {
                    "query": PAYLOAD["query"],
                    "label": f"q{i}",
                    "extra_filters": [QUERY_FILTER],
                }
                for i in range(3)
            ],
            "extra_filters": [BATCH_FILTER],
        }
    )
    dialect = get_dialect_generator(query.dialect)
    results = generate_multi_query_core(
        query, dialect, enable_performance_logging=False
    )
    failures = [r[1] for r in results if isinstance(r[1], Exception)]
    assert failures == []
    for _, generated, *_ in results:
        sql = dialect.compile_statement(generated)
        assert "FRANCE" in sql and "Manufacturer#1" in sql, "both filters reach SQL"


def test_gate_refuses_with_503_when_full(monkeypatch, test_client: TestClient):
    studio_endpoints._gate()
    monkeypatch.setattr(studio_endpoints, "_slots", threading.BoundedSemaphore(0))
    response = test_client.post(
        "/format_query",
        json=PAYLOAD,
    )
    assert response.status_code == 503
    assert response.headers.get("retry-after") == "1"
    # A load-shedding 503 must not be mistaken for /terminate.
    assert test_client.get("/health").status_code == 200


def test_gate_times_out_and_frees_slot(monkeypatch):
    monkeypatch.setattr(studio_endpoints, "REQUEST_TIMEOUT_S", 0.05)
    studio_endpoints._gate()
    before = studio_endpoints._slots_available()

    def slow() -> dict:
        time.sleep(0.3)
        return {}

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(studio_endpoints._run_gated("slow", slow))
    assert excinfo.value.status_code == 504
    # The thread is still running; its slot comes back when it finishes.
    time.sleep(0.4)
    assert studio_endpoints._slots_available() == before


def test_gate_frees_slot_for_queued_request_that_times_out(monkeypatch):
    """A request that times out while still waiting for a thread never runs
    `_work`, so the gate itself has to give the slot back."""
    monkeypatch.setattr(studio_endpoints, "REQUEST_TIMEOUT_S", 0.05)
    executor, _ = studio_endpoints._gate()
    before = studio_endpoints._slots_available()
    release = threading.Event()
    # Occupy every worker thread so the gated request has to queue.
    blockers = [
        executor.submit(release.wait) for _ in range(studio_endpoints.WORKER_THREADS)
    ]
    try:
        with pytest.raises(HTTPException) as excinfo:
            asyncio.run(studio_endpoints._run_gated("queued", dict))
        assert excinfo.value.status_code == 504
        assert studio_endpoints._slots_available() == before
    finally:
        release.set()
        for b in blockers:
            b.result(timeout=5)


def test_diagnostics_report_syntax_error_position():
    model = ModelInSchema(
        name="t",
        sources=[
            ModelSourceInSchema(
                alias="customer",
                contents="key cuid int;\nproperty cuid.name string;\n",
            )
        ],
    )
    diagnostics = get_diagnostics(
        "import customer as cust;\n\nselect cust.cuid,\n", model.sources
    )
    assert len(diagnostics.items) == 1
    item = diagnostics.items[0]
    assert item.startLineNumber >= 3
    assert item.message
    assert "Location:" not in item.message
    # The import ahead of the error still feeds completions.
    assert any(c.label == "cust.cuid" for c in diagnostics.completion_items)


def test_parse_model_shared_hydration_matches_isolated_parse():
    model = ModelInSchema.model_validate(PAYLOAD["full_model"])
    shared = model_to_response(model)
    isolated = [source_to_model_source(s, model.sources) for s in model.sources]
    assert len(shared.sources) == len(model.sources)
    assert [s.model_dump() for s in shared.sources] == [
        s.model_dump() for s in isolated
    ]
