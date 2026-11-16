# syntax=docker/dockerfile:1
# The remote engine (Fly app `trilogy-engine`). Separate from pyserver: no
# pytrilogy, a different machine shape, its own secrets. See app.py.

ARG UV_IMAGE=ghcr.io/astral-sh/uv:python3.13-bookworm-slim

FROM ${UV_IMAGE} AS base
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

FROM base AS deps
COPY requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install -r requirements.txt --system

# Offline tests only: the live suite skips without DATABRICKS_* in the build.
FROM deps AS tester
COPY requirements-test.txt ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install -r requirements-test.txt --system
COPY . .
RUN pytest tests && touch /tmp/tests-passed

FROM base AS production
RUN groupadd -r appuser && useradd -r -g appuser -m -d /home/appuser appuser
ENV PYTHONPATH=. \
    PYTHONUNBUFFERED=1 \
    PORT=8080

COPY --from=deps /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
# Build barrier: fails unless `tester` passed.
COPY --from=tester /tmp/tests-passed /tmp/tests-passed
COPY *.py ./
RUN chown -R appuser:appuser /app

USER appuser
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health').read()" || exit 1

# One process. The work is waiting on Databricks, not CPU: requests run on the
# threadpool and TRILOGY_ENGINE_MAX_INFLIGHT bounds how many hold a result in
# memory at once. More capacity means more machines (fly.toml), not workers.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--timeout-graceful-shutdown", "30"]
