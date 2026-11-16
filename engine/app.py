"""The remote query engine as its own service (Fly app `trilogy-engine`).

Deliberately separate from pyserver, the Trilogy resolver. The resolver is
CPU-bound (parse and plan), stateless and cheap per request; the engine is
I/O-bound, holds result sets in memory while it streams them, and is an
outbound proxy to customer warehouses. They scale on different signals, need
different machines, and the engine's network position and secrets should not
sit in the resolver's process. Nothing here imports pyserver, and pyserver
does not import this.

Routes: `/v1/...` (see remote_engine.create_engine_router) and `/health`.

Private: with no `TRILOGY_ENGINE_API_KEYS` only `/health` is served, so a
deploy without keys answers 404 rather than running queries for anyone.

Run locally:

    TRILOGY_ENGINE_API_KEYS=dev:<digest> uvicorn app:app --port 5680

`python remote_engine.py new-key <id>` mints a key and its digest.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import remote_engine

logger = logging.getLogger("trilogy_engine")

# Pages allowed to read responses: the hosted studio, the desktop shell and
# local dev. Every query route also needs an API key, so CORS is not the
# boundary; it only keeps arbitrary sites from using a key a user pasted.
ALLOWED_ORIGIN_PATTERNS = [
    r"https://trilogy-data\.github\.io",
    r"https://trilogydata\.dev",
    r"app://\.",
    r"http://localhost:[0-9]+",
    r"http://127\.0\.0\.1:[0-9]+",
]

# A shared, internet-facing engine: strict egress unless explicitly turned off
# (TRILOGY_ENGINE_STRICT_EGRESS=0) for a self-host reaching a private workspace.
SETTINGS = remote_engine.EngineSettings.from_env(hosted=True)


def create_app(settings: remote_engine.EngineSettings = SETTINGS) -> FastAPI:
    app = FastAPI(title="Trilogy Remote Engine", docs_url=None, redoc_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        allow_origin_regex="|".join(ALLOWED_ORIGIN_PATTERNS),
        expose_headers=remote_engine.EXPOSED_HEADERS,
        max_age=600,
    )
    app.include_router(remote_engine.create_health_router())
    if settings.enabled:
        app.include_router(remote_engine.create_engine_router(settings))
    else:
        logger.warning(
            "TRILOGY_ENGINE_API_KEYS is not set: serving /health only, no queries."
        )
    return app


app = create_app()
