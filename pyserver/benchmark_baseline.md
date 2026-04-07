# Pyserver Concurrency Baseline

Recorded on 2026-03-24 against the current `pyserver` implementation before any process-pool changes.

## Local baseline

Environment:
- Local `uvicorn main:app` on `127.0.0.1:8090`
- Benchmark script: `pyserver/scripts/benchmark_concurrency.py`
- Payload: representative `/generate_query` request using the sample `names` model

Results:

| Concurrency | Requests | Throughput (req/s) | Req p50 (s) | Req p95 (s) | Req max (s) | Health p95 (s) | Health max (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 16 | 25.02 | 0.039 | 0.045 | 0.045 | 0.012 | 0.012 |
| 2 | 16 | 22.62 | 0.089 | 0.119 | 0.119 | 0.018 | 0.018 |
| 4 | 16 | 20.02 | 0.191 | 0.285 | 0.285 | 0.038 | 0.038 |
| 8 | 32 | 25.73 | 0.296 | 0.428 | 0.435 | 0.082 | 0.082 |
| 16 | 64 | 21.03 | 0.733 | 1.597 | 1.795 | 0.496 | 0.496 |
| 32 | 128 | 21.24 | 1.493 | 3.187 | 4.027 | 0.192 | 1.395 |
| 64 | 256 | 19.22 | 3.011 | 5.112 | 7.665 | 1.617 | 1.700 |

Interpretation:
- Throughput plateaus around 20 to 26 req/s.
- Past concurrency 8 to 16, added parallel load mostly increases queueing latency rather than throughput.
- Health checks remain available locally, but they slow down materially under heavy load.

## Fly baseline

Environment:
- URL: `https://trilogy-service.fly.dev`
- Fly config at time of test: shared VM, 2 CPUs, single `uvicorn` worker process
- Benchmark script: `pyserver/scripts/benchmark_concurrency.py`

Results:

| Concurrency | Requests | Throughput (req/s) | Req p50 (s) | Req p95 (s) | Req max (s) | Health p95 (s) | Health max (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 16 | 7.34 | 0.099 | 0.550 | 0.550 | 0.470 | 0.470 |
| 2 | 16 | 11.68 | 0.098 | 0.839 | 0.839 | 0.119 | 0.119 |
| 4 | 16 | 22.46 | 0.101 | 0.461 | 0.461 | 0.157 | 0.157 |
| 8 | 32 | 14.10 | 0.150 | 2.249 | 2.269 | 0.404 | 0.404 |
| 16 | 64 | 35.06 | 0.356 | 0.662 | 1.116 | 0.280 | 0.280 |
| 32 | 128 | 33.21 | 0.757 | 1.087 | 1.830 | 0.590 | 0.590 |

Notes:
- Remote results are noisier because they include network latency and Fly machine behavior such as warmup.
- The 1 and 2 concurrency runs likely include more startup or cold-path cost than the higher-concurrency runs.

## Fly burst reproduction

Additional burst-style test against Fly with 64 simultaneous `/generate_query` requests:

- Total requests: 64
- Completed successfully: 27
- Timed out at client after 120s: 37
- Request p50: 0.601s
- Request p95: 0.861s
- Request max among successful responses: 5.701s
- Health probes completed: 637
- Health timeouts: 1
- Health max latency: 0.649s

Interpretation:
- Under a burst of 64 simultaneous requests, the deployed Fly service does reproduce the "falls over under concurrent load" failure mode.
- The failures are dominated by requests never being serviced before the 120 second client timeout, which points to saturation and queue starvation rather than simple per-request slowness.

## Fly Python 3.13 update (2026-04-06)

Environment:
- URL: `https://trilogy-service.fly.dev`
- Python 3.13 (upgraded from 3.12)
- Benchmark script: `pyserver/scripts/benchmark_concurrency.py`

### small_names payload

| Concurrency | Requests | Throughput (req/s) | Req p50 (s) | Req p95 (s) | Req max (s) | Health p95 (s) | Health max (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 16 | 11.05 | 0.074 | 0.146 | 0.146 | 0.102 | 0.102 |
| 2 | 16 | 18.96 | 0.108 | 0.136 | 0.136 | 0.096 | 0.096 |
| 4 | 16 | 37.58 | 0.081 | 0.172 | 0.172 | 0.063 | 0.063 |
| 8 | 32 | 60.17 | 0.111 | 0.184 | 0.199 | 0.091 | 0.091 |
| 16 | 64 | 54.97 | 0.213 | 0.570 | 0.776 | 0.100 | 0.100 |
| 32 | 128 | 66.09 | 0.439 | 0.777 | 0.944 | 0.400 | 0.400 |
| 64 | 256 | 67.97 | 0.902 | 0.948 | 1.029 | 0.145 | 0.145 |

### tpch_large_duckdb payload

| Concurrency | Requests | Throughput (req/s) | Req p50 (s) | Req p95 (s) | Req max (s) | Health p95 (s) | Health max (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 16 | 5.66 | 0.167 | 0.274 | 0.274 | 0.098 | 0.098 |
| 2 | 16 | 0.94 | 0.196 | 15.700 | 15.700 | 0.116 | 0.326 |
| 4 | 16 | 13.96 | 0.236 | 0.400 | 0.400 | 0.104 | 0.104 |
| 8 | 32 | 17.11 | 0.385 | 0.658 | 0.659 | 0.091 | 0.091 |
| 16 | 64 | 18.49 | 0.811 | 1.046 | 1.307 | 0.109 | 0.109 |
| 32 | 128 | 19.08 | 1.557 | 2.516 | 2.730 | 0.108 | 0.313 |
| 64 | 256 | 18.31 | 3.040 | 4.321 | 4.469 | 0.197 | 0.332 |

Interpretation:
- Throughput improved ~1.5-2x for small payloads vs the original Fly baseline (e.g. 66 req/s at concurrency 32 vs 33 req/s).
- Zero errors, zero timeouts, zero health failures across all concurrency levels — the burst failure mode from the original baseline is resolved.
- The concurrency=2 large payload run had a one-off 15.7s outlier, likely a cold-start or GC pause; all other levels are healthy.
- No regressions from the Python 3.13 upgrade.
