## Fly.io deployment

```bash
fly deploy
```

Docker build runs tests. Make sure they pass.

## Tests/CI

Pytest for most tests.

Ruff for formatting.

Mypy for type checking; requires explicit package base; run from pyserver subfolder.
```bash
mypy . --explicit-package-bases
```

## Concurrency benchmark

Use the benchmark script to compare the current implementation with any concurrency fixes:

```bash
./venv/Scripts/python.exe pyserver/scripts/benchmark_concurrency.py --base-url http://127.0.0.1:8090
./venv/Scripts/python.exe pyserver/scripts/benchmark_concurrency.py --base-url https://trilogy-service.fly.dev
```

The script now benchmarks multiple payload sizes by default:
- `pyserver/scripts/payloads/small_names.json`
- `pyserver/scripts/payloads/tpch_large_duckdb.json`

Baseline recorded on 2026-03-24 before process-pool changes:

### Local baseline

| Concurrency | Requests | Throughput (req/s) | Req p50 (s) | Req p95 (s) | Health p95 (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 16 | 25.02 | 0.039 | 0.045 | 0.012 |
| 2 | 16 | 22.62 | 0.089 | 0.119 | 0.018 |
| 4 | 16 | 20.02 | 0.191 | 0.285 | 0.038 |
| 8 | 32 | 25.73 | 0.296 | 0.428 | 0.082 |
| 16 | 64 | 21.03 | 0.733 | 1.597 | 0.496 |
| 32 | 128 | 21.24 | 1.493 | 3.187 | 0.192 |
| 64 | 256 | 19.22 | 3.011 | 5.112 | 1.617 |

Summary:
- Throughput plateaus around 20 to 26 req/s.
- Past concurrency 8 to 16, more load mostly increases queueing latency.
- Health checks remain available locally, but slow down under heavier load.

### Fly baseline

Configuration at test time:
- App URL: `https://trilogy-service.fly.dev`
- Fly VM: shared, 2 CPUs
- Server process model: single `uvicorn` worker

| Concurrency | Requests | Throughput (req/s) | Req p50 (s) | Req p95 (s) | Health p95 (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 16 | 7.34 | 0.099 | 0.550 | 0.470 |
| 2 | 16 | 11.68 | 0.098 | 0.839 | 0.119 |
| 4 | 16 | 22.46 | 0.101 | 0.461 | 0.157 |
| 8 | 32 | 14.10 | 0.150 | 2.249 | 0.404 |
| 16 | 64 | 35.06 | 0.356 | 0.662 | 0.280 |
| 32 | 128 | 33.21 | 0.757 | 1.087 | 0.590 |

Fly burst reproduction:
- 64 simultaneous `/generate_query` requests
- 27 successful responses
- 37 client timeouts at 120s

That detailed baseline is also saved in `pyserver/benchmark_baseline.md` so we can append before/after comparisons once the concurrency fix lands.

### Local post-fix spot check

Current implementation:
- CPU-heavy endpoints run through a bounded process pool
- Local measurement below used `TRILOGY_PROCESS_POOL_SIZE=2`

Small payload (`small_names`, query chars `99`, model chars `817`):

| Concurrency | Requests | Throughput (req/s) | Req p50 (s) | Req p95 (s) | Health p95 (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 16 | 57.14 | 0.017 | 0.023 | 0.004 |
| 16 | 64 | 93.80 | 0.157 | 0.196 | 0.017 |
| 64 | 256 | 89.73 | 0.704 | 0.746 | 0.057 |

Large payload (`tpch_large_duckdb`, query chars `415`, model chars `6551`):

| Concurrency | Requests | Throughput (req/s) | Req p50 (s) | Req p95 (s) | Health p95 (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 16 | 9.28 | 0.095 | 0.167 | 0.004 |
| 16 | 64 | 14.04 | 1.136 | 1.214 | 0.005 |
| 64 | 256 | 13.13 | 4.844 | 5.097 | 0.014 |

Takeaways:
- The process pool keeps `/health` responsive under heavy query load.
- Payload size matters a lot: the larger model is about 8x the model text size and its throughput is much lower.
- The server now degrades by queueing heavy work instead of becoming broadly unresponsive.
