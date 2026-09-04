"""In-process micro-benchmark of the resolver endpoint tasks.

Calls the `_*_task` functions directly (no HTTP, no thread pool) so the numbers
isolate parse/plan cost from server overhead. Use it to ground any performance
change: run before, run after, compare.

    ../.venv/Scripts/python.exe scripts/benchmark_endpoints.py
    ../.venv/Scripts/python.exe scripts/benchmark_endpoints.py --json out.json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import statistics
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR.parent))
logging.disable(logging.CRITICAL)

from studio_endpoints import (
    _format_query_task,
    _generate_queries_task,
    _generate_query_task,
    _parse_model_task,
    _validate_query_task,
)

# A filter that is valid against each payload's imported namespace.
PAYLOAD_FILTERS = {
    "tpch_large_duckdb": "part.supplier.nation.name = 'FRANCE'",
    "small_names": "names.state = 'CA'",
}


def _validate_payload(payload: dict, filters: list[str]) -> dict:
    return {
        "query": payload["query"],
        "imports": payload.get("imports", []),
        "sources": payload["full_model"]["sources"],
        "current_filename": payload.get("current_filename"),
        "extra_filters": filters,
    }


def _multi_payload(
    payload: dict, count: int, per_query: list[str], batch: list[str]
) -> dict:
    return {
        "imports": payload["imports"],
        "full_model": payload["full_model"],
        "dialect": payload["dialect"],
        "queries": [
            {"query": payload["query"], "label": f"q{i}", "extra_filters": per_query}
            for i in range(count)
        ],
        "extra_filters": batch,
    }


def _cases(name: str, payload: dict) -> list[tuple[str, Callable[[], Any]]]:
    flt = PAYLOAD_FILTERS.get(name)
    filters = [flt] if flt else []
    cases: list[tuple[str, Callable[[], Any]]] = [
        ("generate_query", lambda: _generate_query_task(payload, False)),
        (
            "validate_query (no filters)",
            lambda: _validate_query_task(_validate_payload(payload, [])),
        ),
        (
            "validate_query (4 filters)",
            lambda: _validate_query_task(_validate_payload(payload, filters * 4)),
        ),
        ("parse_model", lambda: _parse_model_task(payload["full_model"], False)),
        ("format_query", lambda: _format_query_task(payload)),
        (
            "generate_queries x8 (per-query filters)",
            lambda: _generate_queries_task(
                _multi_payload(payload, 8, filters, []), False
            ),
        ),
        (
            "generate_queries x8 (batch + per-query filters)",
            lambda: _generate_queries_task(
                _multi_payload(payload, 8, filters, filters), False
            ),
        ),
    ]
    return cases


def _errors(result: Any) -> int:
    if not isinstance(result, dict):
        return 0
    if "__http_error__" in result:
        return 1
    return sum(1 for q in result.get("queries", []) if q.get("error"))


def run(payload_files: list[Path], iterations: int) -> list[dict]:
    rows: list[dict] = []
    for path in payload_files:
        payload = json.loads(path.read_text(encoding="utf-8"))
        for label, fn in _cases(path.stem, payload):
            result = fn()  # warm-up; also surfaces errors
            samples = []
            for _ in range(iterations):
                started = time.perf_counter()
                fn()
                samples.append((time.perf_counter() - started) * 1000)
            rows.append(
                {
                    "payload": path.stem,
                    "case": label,
                    "median_ms": round(statistics.median(samples), 2),
                    "p95_ms": round(sorted(samples)[int(len(samples) * 0.95) - 1], 2),
                    "errors": _errors(result),
                }
            )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--payload-file", action="append", default=[])
    parser.add_argument("--iterations", type=int, default=20)
    parser.add_argument("--json", help="Write results to this path as JSON")
    args = parser.parse_args()
    files = [Path(p) for p in args.payload_file] or sorted(
        (SCRIPT_DIR / "payloads").glob("*.json")
    )
    rows = run(files, args.iterations)
    width = max(len(r["case"]) for r in rows)
    print(f"{'payload':20s} {'case':{width}s} {'median':>9s} {'p95':>9s} {'err':>4s}")
    for r in rows:
        print(
            f"{r['payload']:20s} {r['case']:{width}s} "
            f"{r['median_ms']:8.2f}ms {r['p95_ms']:8.2f}ms {r['errors']:4d}"
        )
    if args.json:
        Path(args.json).write_text(json.dumps(rows, indent=2), encoding="utf-8")


if __name__ == "__main__":
    os.environ.setdefault("ENABLE_PERF_LOGGING", "false")
    main()
