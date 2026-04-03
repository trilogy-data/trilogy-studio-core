"""
Load test script for the Trilogy remote Fly.io server.
Runs multiple scenarios and produces a graphical analysis.

Usage:
    python scripts/load_test.py
    python scripts/load_test.py --url https://trilogy-service.fly.dev
    python scripts/load_test.py --url http://localhost:5678 --concurrency 5 --requests 50
"""

import argparse
import asyncio
import json
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import httpx
import matplotlib
matplotlib.use("Agg")  # non-interactive backend — no display required
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import numpy as np

# ---------------------------------------------------------------------------
# Realistic payloads
# ---------------------------------------------------------------------------

_ORDERS_CONTENTS = (
    "key order_id int;\n"
    "key customer_id int;\n"
    "property order_id.amount float;\n"
    "property order_id.status string;\n"
    "datasource orders(\n"
    "    order_id: order_id,\n"
    "    customer_id: customer_id,\n"
    "    amount: amount,\n"
    "    status: status\n"
    ") grain (order_id) address orders;\n"
)

SIMPLE_MODEL = {
    "name": "load_test_model",
    "sources": [{"alias": "orders", "contents": _ORDERS_CONTENTS}],
}

# load test_request.json from the repo root if available, for a realistic
# multi-source generate_query payload; fall back to the simple model otherwise
_REPO_ROOT = Path(__file__).resolve().parents[2]
_TEST_REQUEST_PATH = _REPO_ROOT / "test_request.json"
if _TEST_REQUEST_PATH.exists():
    with open(_TEST_REQUEST_PATH) as _f:
        _REAL_QUERY_PAYLOAD = json.load(_f)
    # Ensure dialect uses the canonical server value
    if _REAL_QUERY_PAYLOAD.get("dialect") == "DUCK_DB":
        _REAL_QUERY_PAYLOAD["dialect"] = "duckdb"
else:
    _REAL_QUERY_PAYLOAD = {
        "imports": [{"name": "orders", "alias": ""}],
        "query": "SELECT customer_id, count(order_id) as order_count, sum(amount) as total ORDER BY total DESC LIMIT 20;",
        "dialect": "duckdb",
        "full_model": SIMPLE_MODEL,
    }

PAYLOADS = {
    "health": None,  # GET, no body
    "generate_query_simple": {
        "imports": [{"name": "orders", "alias": ""}],
        "query": "SELECT order_id, amount ORDER BY amount DESC LIMIT 10;",
        "dialect": "duckdb",
        "full_model": SIMPLE_MODEL,
    },
    "generate_query_real": _REAL_QUERY_PAYLOAD,
    "validate_query": {
        "query": "SELECT order_id, amount ORDER BY amount DESC LIMIT 10;",
        "imports": [{"name": "orders", "alias": ""}],
        "sources": SIMPLE_MODEL["sources"],
    },
    "format_query": {
        "imports": [{"name": "orders", "alias": ""}],
        "query": "SELECT order_id,amount ORDER BY amount DESC LIMIT 10;",
        "dialect": "duckdb",
        "full_model": SIMPLE_MODEL,
    },
    "parse_model": SIMPLE_MODEL,
}

ENDPOINT_MAP = {
    "health": ("GET", "/health"),
    "generate_query_simple": ("POST", "/generate_query"),
    "generate_query_real": ("POST", "/generate_query"),
    "validate_query": ("POST", "/validate_query"),
    "format_query": ("POST", "/format_query"),
    "parse_model": ("POST", "/parse_model"),
}

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class RequestResult:
    endpoint: str
    latency_ms: float
    status: int
    error: str | None = None
    timestamp: float = field(default_factory=time.time)

    @property
    def success(self) -> bool:
        return self.error is None and 200 <= self.status < 300


@dataclass
class ScenarioResult:
    name: str
    concurrency: int
    total_requests: int
    results: list[RequestResult]
    start_time: float
    end_time: float

    @property
    def duration_s(self) -> float:
        return self.end_time - self.start_time

    @property
    def throughput(self) -> float:
        return len(self.results) / self.duration_s if self.duration_s > 0 else 0

    def latencies(self, endpoint: str | None = None) -> list[float]:
        rs = self.results if endpoint is None else [r for r in self.results if r.endpoint == endpoint]
        return [r.latency_ms for r in rs if r.success]

    def percentile(self, p: float, endpoint: str | None = None) -> float:
        lats = self.latencies(endpoint)
        return float(np.percentile(lats, p)) if lats else float("nan")

    def error_rate(self, endpoint: str | None = None) -> float:
        rs = self.results if endpoint is None else [r for r in self.results if r.endpoint == endpoint]
        if not rs:
            return 0.0
        return sum(1 for r in rs if not r.success) / len(rs)


# ---------------------------------------------------------------------------
# Request runner
# ---------------------------------------------------------------------------

async def send_request(
    client: httpx.AsyncClient,
    base_url: str,
    scenario_name: str,
    endpoint_key: str,
) -> RequestResult:
    method, path = ENDPOINT_MAP[endpoint_key]
    url = base_url.rstrip("/") + path
    payload = PAYLOADS[endpoint_key]

    t0 = time.perf_counter()
    try:
        if method == "GET":
            resp = await client.get(url, timeout=30)
        else:
            resp = await client.post(url, json=payload, timeout=30)
        latency_ms = (time.perf_counter() - t0) * 1000
        return RequestResult(
            endpoint=endpoint_key,
            latency_ms=latency_ms,
            status=resp.status_code,
            error=None if resp.is_success else f"HTTP {resp.status_code}",
        )
    except Exception as exc:
        latency_ms = (time.perf_counter() - t0) * 1000
        return RequestResult(
            endpoint=endpoint_key,
            latency_ms=latency_ms,
            status=0,
            error=str(exc),
        )


async def run_scenario(
    base_url: str,
    name: str,
    endpoints: list[str],
    total_requests: int,
    concurrency: int,
) -> ScenarioResult:
    """Run `total_requests` spread across `endpoints`, up to `concurrency` at once."""
    sem = asyncio.Semaphore(concurrency)
    results: list[RequestResult] = []

    # Build the queue: round-robin across endpoints
    queue: list[str] = [endpoints[i % len(endpoints)] for i in range(total_requests)]

    async def bounded(ep: str) -> RequestResult:
        async with sem:
            async with httpx.AsyncClient() as client:
                return await send_request(client, base_url, name, ep)

    print(f"  Running scenario '{name}': {total_requests} requests, concurrency={concurrency}")
    start = time.perf_counter()
    results = await asyncio.gather(*[bounded(ep) for ep in queue])
    end = time.perf_counter()

    ok = sum(1 for r in results if r.success)
    p50 = float(np.percentile([r.latency_ms for r in results if r.success], 50)) if ok else float("nan")
    p99 = float(np.percentile([r.latency_ms for r in results if r.success], 99)) if ok else float("nan")
    print(f"    Done: {ok}/{total_requests} ok | p50={p50:.0f}ms p99={p99:.0f}ms | {(end-start):.1f}s elapsed")

    return ScenarioResult(
        name=name,
        concurrency=concurrency,
        total_requests=total_requests,
        results=list(results),
        start_time=start,
        end_time=end,
    )


# ---------------------------------------------------------------------------
# Test plan
# ---------------------------------------------------------------------------

async def run_all(base_url: str, base_concurrency: int, base_requests: int) -> list[ScenarioResult]:
    scenarios = [
        # Warm-up
        ("warmup", ["health"], max(5, base_requests // 10), 1),
        # Health endpoint stress
        ("health_burst", ["health"], base_requests, base_concurrency),
        # Lightweight CPU endpoints
        ("format_validate", ["format_query", "validate_query"], base_requests, base_concurrency),
        # Heavy CPU endpoints
        ("generate_sequential", ["generate_query_simple", "generate_query_real"], base_requests, 1),
        ("generate_concurrent", ["generate_query_simple", "generate_query_real"], base_requests, base_concurrency),
        # Model parsing
        ("parse_model", ["parse_model"], base_requests, base_concurrency),
        # Mixed realistic workload
        ("mixed", ["health", "format_query", "validate_query", "generate_query_simple", "generate_query_real", "parse_model"], base_requests, base_concurrency),
    ]

    results = []
    for name, endpoints, n_req, conc in scenarios:
        r = await run_scenario(base_url, name, endpoints, n_req, conc)
        results.append(r)
        await asyncio.sleep(0.5)  # brief pause between scenarios

    return results


# ---------------------------------------------------------------------------
# Plotting
# ---------------------------------------------------------------------------

COLORS = plt.cm.tab10.colors  # type: ignore


def _endpoint_latency_bars(ax: plt.Axes, scenario: ScenarioResult) -> None:
    """Bar chart: p50/p95/p99 per endpoint for a single scenario."""
    endpoints = list({r.endpoint for r in scenario.results})
    x = np.arange(len(endpoints))
    w = 0.25

    p50s = [scenario.percentile(50, ep) for ep in endpoints]
    p95s = [scenario.percentile(95, ep) for ep in endpoints]
    p99s = [scenario.percentile(99, ep) for ep in endpoints]

    ax.bar(x - w, p50s, w, label="p50", color=COLORS[0])
    ax.bar(x, p95s, w, label="p95", color=COLORS[1])
    ax.bar(x + w, p99s, w, label="p99", color=COLORS[2])

    ax.set_xticks(x)
    ax.set_xticklabels(endpoints, rotation=20, ha="right", fontsize=8)
    ax.set_ylabel("Latency (ms)")
    ax.set_title(f"{scenario.name}\n(concurrency={scenario.concurrency})")
    ax.legend(fontsize=7)


def _latency_dist(ax: plt.Axes, results: list[RequestResult], label: str, color) -> None:
    lats = [r.latency_ms for r in results if r.success]
    if not lats:
        return
    ax.hist(lats, bins=30, alpha=0.6, color=color, label=label, density=True)


def _throughput_bar(ax: plt.Axes, scenarios: list[ScenarioResult]) -> None:
    names = [s.name for s in scenarios]
    tps = [s.throughput for s in scenarios]
    bars = ax.barh(names, tps, color=COLORS[3])
    ax.bar_label(bars, fmt="%.1f", padding=3, fontsize=7)
    ax.set_xlabel("Requests / second")
    ax.set_title("Throughput per scenario")


def _error_rate_bar(ax: plt.Axes, scenarios: list[ScenarioResult]) -> None:
    names = [s.name for s in scenarios]
    rates = [s.error_rate() * 100 for s in scenarios]
    colors = [COLORS[6] if r > 0 else COLORS[2] for r in rates]
    bars = ax.barh(names, rates, color=colors)
    ax.bar_label(bars, fmt="%.1f%%", padding=3, fontsize=7)
    ax.set_xlabel("Error rate (%)")
    ax.set_title("Error rate per scenario")
    ax.set_xlim(0, max(max(rates) * 1.2, 5))


def _latency_over_time(ax: plt.Axes, scenario: ScenarioResult) -> None:
    results = sorted(scenario.results, key=lambda r: r.timestamp)
    if not results:
        return
    t0 = results[0].timestamp
    times = [(r.timestamp - t0) * 1000 for r in results]
    lats = [r.latency_ms for r in results]
    colors = [COLORS[2] if r.success else COLORS[6] for r in results]
    ax.scatter(times, lats, c=colors, s=8, alpha=0.6)
    ax.set_xlabel("Elapsed (ms)")
    ax.set_ylabel("Latency (ms)")
    ax.set_title(f"Latency over time — {scenario.name}")


def plot_results(scenarios: list[ScenarioResult], output_path: Path) -> None:
    # Filter out warmup for most charts
    main_scenarios = [s for s in scenarios if s.name != "warmup"]

    n_main = len(main_scenarios)
    fig = plt.figure(figsize=(18, 5 + 4 * ((n_main + 1) // 2)))
    fig.suptitle(
        f"Trilogy Server Load Test — {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        fontsize=14,
        fontweight="bold",
    )

    gs = gridspec.GridSpec(
        nrows=3 + ((n_main + 1) // 2),
        ncols=2,
        figure=fig,
        hspace=0.7,
        wspace=0.35,
    )

    # Row 0: throughput + error rate (span full width each)
    ax_tp = fig.add_subplot(gs[0, 0])
    ax_err = fig.add_subplot(gs[0, 1])
    _throughput_bar(ax_tp, main_scenarios)
    _error_rate_bar(ax_err, main_scenarios)

    # Row 1: latency distribution overlay for generate scenarios
    ax_dist = fig.add_subplot(gs[1, :])
    gen_scenarios = [s for s in main_scenarios if "generate" in s.name]
    for i, s in enumerate(gen_scenarios):
        _latency_dist(ax_dist, s.results, s.name, COLORS[i % len(COLORS)])
    ax_dist.set_xlabel("Latency (ms)")
    ax_dist.set_ylabel("Density")
    ax_dist.set_title("Latency distribution — generate_query scenarios")
    if gen_scenarios:
        ax_dist.legend(fontsize=8)

    # Row 2: latency over time for the mixed scenario
    mixed = next((s for s in main_scenarios if s.name == "mixed"), main_scenarios[-1])
    ax_time = fig.add_subplot(gs[2, :])
    _latency_over_time(ax_time, mixed)

    # Remaining rows: per-endpoint p50/p95/p99 bars for each scenario
    for idx, scenario in enumerate(main_scenarios):
        row = 3 + idx // 2
        col = idx % 2
        ax = fig.add_subplot(gs[row, col])
        _endpoint_latency_bars(ax, scenario)

    fig.subplots_adjust(top=0.93, hspace=0.7, wspace=0.35)
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    print(f"\nChart saved to: {output_path}")


# ---------------------------------------------------------------------------
# Summary table
# ---------------------------------------------------------------------------

def print_summary(scenarios: list[ScenarioResult]) -> None:
    print("\n" + "=" * 90)
    print(f"{'Scenario':<28} {'Concur':>7} {'N':>5} {'OK%':>6} {'p50ms':>7} {'p95ms':>7} {'p99ms':>7} {'RPS':>7}")
    print("-" * 90)
    for s in scenarios:
        lats = s.latencies()
        ok_pct = (1 - s.error_rate()) * 100
        p50 = f"{s.percentile(50):.0f}" if lats else "N/A"
        p95 = f"{s.percentile(95):.0f}" if lats else "N/A"
        p99 = f"{s.percentile(99):.0f}" if lats else "N/A"
        print(
            f"{s.name:<28} {s.concurrency:>7} {s.total_requests:>5} "
            f"{ok_pct:>5.1f}% {p50:>7} {p95:>7} {p99:>7} {s.throughput:>7.1f}"
        )
    print("=" * 90)


# ---------------------------------------------------------------------------
# Baseline persistence
# ---------------------------------------------------------------------------

def save_baseline(scenarios: list[ScenarioResult], output_dir: Path) -> None:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    baseline_file = output_dir / f"load_test_baseline_{ts}.json"

    data = {
        "timestamp": ts,
        "scenarios": [
            {
                "name": s.name,
                "concurrency": s.concurrency,
                "total_requests": s.total_requests,
                "duration_s": s.duration_s,
                "throughput_rps": s.throughput,
                "error_rate_pct": s.error_rate() * 100,
                "p50_ms": s.percentile(50),
                "p95_ms": s.percentile(95),
                "p99_ms": s.percentile(99),
                "endpoints": {
                    ep: {
                        "p50_ms": s.percentile(50, ep),
                        "p95_ms": s.percentile(95, ep),
                        "p99_ms": s.percentile(99, ep),
                        "error_rate_pct": s.error_rate(ep) * 100,
                        "count": sum(1 for r in s.results if r.endpoint == ep),
                    }
                    for ep in {r.endpoint for r in s.results}
                },
            }
            for s in scenarios
        ],
    }

    with open(baseline_file, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Baseline saved to: {baseline_file}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Trilogy server load test")
    parser.add_argument(
        "--url",
        default="https://trilogy-service.fly.dev",
        help="Base URL of the server (default: https://trilogy-service.fly.dev)",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=5,
        help="Max concurrent requests per scenario (default: 5)",
    )
    parser.add_argument(
        "--requests",
        type=int,
        default=30,
        help="Requests per scenario (default: 30)",
    )
    parser.add_argument(
        "--output-dir",
        default=".",
        help="Directory for chart and baseline JSON (default: current dir)",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Target: {args.url}")
    print(f"Concurrency: {args.concurrency}  |  Requests/scenario: {args.requests}\n")

    # Verify server is reachable before running
    try:
        resp = httpx.get(args.url.rstrip("/") + "/health", timeout=10)
        print(f"Server health check: {resp.status_code} {resp.text[:60]}\n")
    except Exception as exc:
        print(f"ERROR: Cannot reach server at {args.url}: {exc}", file=sys.stderr)
        sys.exit(1)

    scenarios = asyncio.run(run_all(args.url, args.concurrency, args.requests))

    print_summary(scenarios)
    save_baseline(scenarios, output_dir)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    chart_path = output_dir / "load_test.png"
    plot_results(scenarios, chart_path)

    # Open chart on Windows
    import os
    if sys.platform == "win32":
        os.startfile(str(chart_path))


if __name__ == "__main__":
    main()
