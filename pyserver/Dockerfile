# syntax=docker/dockerfile:1
# Multi-stage build optimized for build speed and a lean production image.

ARG UV_IMAGE=ghcr.io/astral-sh/uv:python3.13-bookworm-slim

# ---------------------------------------------------------------------------
# base: shared settings for every stage
# ---------------------------------------------------------------------------
FROM ${UV_IMAGE} AS base
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# ---------------------------------------------------------------------------
# deps: install ONLY production dependencies, exactly once.
# This stage is the source of truth for the production site-packages, so it
# is never polluted by test/lint tooling.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install -r requirements.txt --system

# ---------------------------------------------------------------------------
# tester: add test dependencies and run the suite. Throwaway stage - nothing
# from here lands in the production image except a "tests passed" marker,
# which forces the production stage to depend on a green test run.
# ---------------------------------------------------------------------------
FROM deps AS tester
COPY requirements-test.txt ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install -r requirements-test.txt --system
COPY . .
RUN pytest tests && touch /tmp/tests-passed

# ---------------------------------------------------------------------------
# production: lean runtime image with prod-only dependencies.
# ---------------------------------------------------------------------------
FROM base AS production

# Non-root user. -m creates /home/appuser so gunicorn's control server has a
# writable HOME (without it, startup logs "Permission denied: '/home/appuser'").
RUN groupadd -r appuser \
    && useradd -r -g appuser -m -d /home/appuser appuser

ENV IN_DOCKER_IMAGE=1 \
    PYTHONPATH=. \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    HOST=0.0.0.0

# Production dependencies from the clean `deps` stage.
COPY --from=deps /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Build barrier: this fails the build unless `tester` ran pytest successfully.
COPY --from=tester /tmp/tests-passed /tmp/tests-passed

# Application code (only the root *.py modules are needed at runtime).
COPY *.py ./
RUN chown -R appuser:appuser /app

USER appuser
EXPOSE 8080

# curl is not present in the slim base image, so probe with the bundled
# Python interpreter instead. urlopen() raises on any non-2xx response.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health').read()" || exit 1

# exec form for correct signal handling; --preload imports the app once in the
# master process so the heavy trilogy import is not repeated per worker.
CMD ["gunicorn", "main:app", "-k", "uvicorn.workers.UvicornWorker", "-w", "4", "-b", "0.0.0.0:8080", "--preload"]
