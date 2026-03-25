import argparse
import asyncio
import json
import statistics
import time
from pathlib import Path
from typing import Any

import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PAYLOAD_FILES = [
    SCRIPT_DIR / "payloads" / "small_names.json",
    SCRIPT_DIR / "payloads" / "tpch_large_duckdb.json",
]


def percentile(values: list[float], p: int) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    idx = max(
        0,
        min(len(ordered) - 1, int(round((p / 100.0) * len(ordered) + 0.5)) - 1),
    )
    return ordered[idx]


async def hit_generate(
    client: httpx.AsyncClient,
    url: str,
    payload: dict[str, Any],
    sem: asyncio.Semaphore,
    results: list[tuple[int | None, float, str | None]],
):
    async with sem:
        started = time.perf_counter()
        try:
            response = await client.post(url, json=payload, timeout=120.0)
            results.append((response.status_code, time.perf_counter() - started, None))
        except Exception as exc:  # pragma: no cover - benchmark-only path
            results.append((None, time.perf_counter() - started, repr(exc)))


async def probe_health(
    client: httpx.AsyncClient,
    health_url: str,
    stop_event: asyncio.Event,
    latencies: list[tuple[int | None, float]],
    failures: list[str],
):
    while not stop_event.is_set():
        started = time.perf_counter()
        try:
            response = await client.get(health_url, timeout=2.0)
            latencies.append((response.status_code, time.perf_counter() - started))
        except Exception as exc:  # pragma: no cover - benchmark-only path
            failures.append(repr(exc))
        await asyncio.sleep(0.1)


async def run_level(
    base_url: str,
    payload_name: str,
    payload: dict[str, Any],
    concurrency: int,
    request_count: int,
) -> dict[str, Any]:
    query_url = f"{base_url}/generate_query"
    health_url = f"{base_url}/health"
    limits = httpx.Limits(
        max_connections=max(200, concurrency * 2),
        max_keepalive_connections=50,
    )
    results: list[tuple[int | None, float, str | None]] = []
    health_latencies: list[tuple[int | None, float]] = []
    health_failures: list[str] = []
    stop_event = asyncio.Event()
    sem = asyncio.Semaphore(concurrency)

    async with httpx.AsyncClient(limits=limits) as client:
        warmup = await client.post(query_url, json=payload, timeout=60.0)
        warmup.raise_for_status()

        health_task = asyncio.create_task(
            probe_health(
                client, health_url, stop_event, health_latencies, health_failures
            )
        )
        started = time.perf_counter()
        workers = [
            asyncio.create_task(hit_generate(client, query_url, payload, sem, results))
            for _ in range(request_count)
        ]
        await asyncio.gather(*workers)
        wall_time = time.perf_counter() - started
        stop_event.set()
        await health_task

    ok_times = [elapsed for status, elapsed, _ in results if status == 200]
    non_200 = [status for status, _, _ in results if status not in (200, None)]
    exceptions = [error for status, _, error in results if status is None and error]
    health_ok = [elapsed for status, elapsed in health_latencies if status == 200]
    sources = payload.get("full_model", {}).get("sources", [])
    model_chars = sum(len(source.get("contents", "")) for source in sources)

    req_p95 = percentile(ok_times, 95)
    health_p95 = percentile(health_ok, 95)

    return {
        "payload": payload_name,
        "query_chars": len(payload.get("query", "")),
        "model_chars": model_chars,
        "source_count": len(sources),
        "concurrency": concurrency,
        "requests": request_count,
        "wall_s": round(wall_time, 3),
        "throughput_rps": round(len(ok_times) / wall_time, 2) if wall_time else None,
        "ok": len(ok_times),
        "non_200": len(non_200),
        "exceptions": len(exceptions),
        "req_p50_s": round(statistics.median(ok_times), 3) if ok_times else None,
        "req_p95_s": round(req_p95, 3) if req_p95 is not None else None,
        "req_max_s": round(max(ok_times), 3) if ok_times else None,
        "health_samples": len(health_ok),
        "health_timeouts": len(health_failures),
        "health_p95_s": round(health_p95, 3) if health_p95 is not None else None,
        "health_max_s": round(max(health_ok), 3) if health_ok else None,
    }


def load_payloads(payload_files: list[str]) -> list[tuple[str, dict[str, Any]]]:
    loaded = []
    for payload_file in payload_files:
        path = Path(payload_file)
        with path.open("r", encoding="utf-8") as handle:
            loaded.append((path.stem, json.load(handle)))
    return loaded


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8090")
    parser.add_argument(
        "--concurrency",
        nargs="+",
        type=int,
        default=[1, 2, 4, 8, 16, 32, 64],
    )
    parser.add_argument(
        "--requests-per-level",
        type=int,
        default=0,
        help="If zero, uses max(16, concurrency * 4) per level.",
    )
    parser.add_argument(
        "--payload-file",
        action="append",
        default=[],
        help="Path to a request payload JSON file. May be provided multiple times.",
    )
    args = parser.parse_args()
    payload_files = args.payload_file or [str(path) for path in DEFAULT_PAYLOAD_FILES]
    payloads = load_payloads(payload_files)

    all_results = []
    for payload_name, payload in payloads:
        for concurrency in args.concurrency:
            request_count = args.requests_per_level or max(16, concurrency * 4)
            result = await run_level(
                args.base_url.rstrip("/"),
                payload_name,
                payload,
                concurrency,
                request_count,
            )
            all_results.append(result)
            print(json.dumps(result))

    print("FINAL")
    print(json.dumps(all_results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
