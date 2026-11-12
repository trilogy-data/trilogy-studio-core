import asyncio
import logging
import multiprocessing
import os
import re
import sys
import traceback
from dataclasses import dataclass
from logging import getLogger
from pathlib import Path

import click
import uvicorn
from click_default_group import DefaultGroup
from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from starlette.background import BackgroundTask
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from trilogy import Environment, Executor, __version__
from uvicorn.config import LOGGING_CONFIG

import access_log
import server_policy as policy

# Import the reusable endpoints module
from studio_endpoints import create_trilogy_router

# Define the path to the .env file
env_path = Path(__file__).parent / ".env"

if os.path.exists(env_path):
    with open(env_path, "r") as file:
        for line in file:
            line = line.strip()
            if line and not line.startswith("#"):
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())

current_directory = Path(__file__).parent

sys.path.append(str(current_directory))

logger = getLogger(__name__)

# Set up performance logging
perf_logger = getLogger("trilogy.performance")


# Determine if we're in development mode for performance logging
IS_DEV = (
    os.getenv("ALLOWED_ORIGINS") == "dev"
    or os.getenv("ENVIRONMENT", "").lower() == "development"
    or (os.getenv("HOST", "").lower() in ("localhost", "127.0.0.1"))
)

# Enable performance logging in dev mode or if explicitly requested
ENABLE_PERF_LOGGING = (
    IS_DEV or os.environ.get("ENABLE_PERF_LOGGING", "false").lower() == "true"
)


# Configure performance logger
def setup_performance_logging():
    if ENABLE_PERF_LOGGING:
        perf_handler = logging.StreamHandler()
        perf_handler.setFormatter(
            logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        )
        perf_logger.setLevel(logging.INFO)
        perf_logger.addHandler(perf_handler)
        perf_logger.propagate = True
        perf_logger.info("Performance logging enabled")


# Call this early to set up logging
setup_performance_logging()


def _report_parser_backend() -> str:
    """Which syntax parser pytrilogy will use, and whether the Rust module it
    needs is importable. Printed at startup so a deployment that silently
    lost the compiled wheel is visible in the logs rather than as a hard
    ImportError on the first request."""
    from trilogy.constants import CONFIG

    try:
        import _preql_import_resolver  # type: ignore[import-untyped]  # noqa: F401

        rust = "available"
    except ImportError:
        rust = "MISSING"
    return f"Trilogy parser backend: {CONFIG.parser_backend.value} (rust module {rust})"


print(_report_parser_backend())

PORT = 5678

# Where the desktop bundle and a local `python main.py` listen. Loopback: the
# local resolver reads project files off the caller's disk by design, so it
# must not answer the rest of the network. (The hosted image is started by
# gunicorn with its own bind and never reads this.)
BIND_HOST = os.getenv("TRILOGY_BIND_HOST", "").strip() or "127.0.0.1"
LOOPBACK_HOSTS = ["localhost", "127.0.0.1"]


app = FastAPI()


@dataclass
class InstanceSettings:
    connections: dict[str, Executor]
    models: dict[str, Environment]


class BodySizeLimitMiddleware:
    """Refuse a request body larger than `max_bytes` with a 413.

    Every request carries its whole model, and nothing downstream bounds it:
    without this the body is read, JSON-decoded and validated on the event
    loop however large it is, before the request gate gets a say. A declared
    Content-Length is refused before a byte is read; a chunked body is counted
    as it streams.
    """

    def __init__(self, app: ASGIApp, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        too_large = HTTPException(
            status_code=413,
            detail=f"Request body exceeds the {self.max_bytes} byte limit",
        )
        for key, value in scope.get("headers") or []:
            if key == b"content-length":
                if value.isdigit() and int(value) > self.max_bytes:
                    response = JSONResponse(
                        status_code=413, content={"detail": too_large.detail}
                    )
                    await response(scope, receive, send)
                    return
                break
        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    # FastAPI re-raises an HTTPException met while reading
                    # the body, so this reaches the client as a 413.
                    raise too_large
            return message

        await self.app(scope, limited_receive, send)


# Added first so it sits innermost: its 413 then passes back out through
# CORS (a browser client can read the refusal) and the access log.
if policy.MAX_BODY_BYTES:
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=policy.MAX_BODY_BYTES)

# Origins whose pages may read responses. Local origins are allowed in every
# deployment on purpose: a locally served studio talks to the hosted resolver.
# The API takes no cookies or credentials, so nothing is lent to an allowed
# origin beyond what any non-browser client already has.
#
# For the LOCAL resolver this list is a real boundary: it is what stops an
# arbitrary website the user visits from reading compiled output, which can
# include the contents of local .sql files.
ALLOWED_ORIGIN_PATTERNS = [
    r"https://trilogy-data\.github\.io",
    r"https://trilogydata\.dev",
    r"https://greenmtnboy\.github\.io",
    r"app://\.",
    r"http://localhost:[0-9]+",
    r"http://127\.0\.0\.1:[0-9]+",
]
allow_origin_regex = "|".join(ALLOWED_ORIGIN_PATTERNS)
app.add_middleware(
    CORSMiddleware,
    allow_methods=["*"],
    allow_headers=["Authorization"],
    allow_origin_regex=allow_origin_regex,
)

# DNS rebinding: a hostile page can point its own hostname at 127.0.0.1 and
# then talk to the local resolver same-origin, which CORS never sees. The
# Host header still names the attacker's domain, so a loopback-bound local
# server answers only to loopback names. Hosted deployments are reached by
# their public names and hold nothing a rebinding page could not ask for
# directly. TRILOGY_ALLOWED_HOSTS adds names (comma separated); `*` disables.
_extra_hosts = [
    h.strip() for h in os.getenv("TRILOGY_ALLOWED_HOSTS", "").split(",") if h.strip()
]
if not policy.HOSTED and BIND_HOST in LOOPBACK_HOSTS and "*" not in _extra_hosts:
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=LOOPBACK_HOSTS + _extra_hosts
    )

# Outermost, so it sees every response, CORS preflights and refusals from
# the request gate included. Off unless ACCESS_LOG=bigquery (fly.toml).
_access_log = access_log.from_env()
if _access_log is not None:
    app.add_middleware(access_log.AccessLogMiddleware, log=_access_log)


class TerminateServer(HTTPException):
    """Raised only by /terminate. Distinct from a plain 503 so load-shedding
    responses from the request gate don't shut the server down."""


def _may_terminate(request: Request) -> bool:
    """Only the machine the server runs on may shut it down, and not through
    a web page: /terminate is a GET, so `<img src=".../terminate">` on any
    site would otherwise do it. A browser marks such a request cross-site and
    sends no Origin; the desktop shell's own fetch carries its Origin."""
    client = request.client.host if request.client else ""
    if client not in ("127.0.0.1", "::1", "localhost", "testclient"):
        return False
    origin = request.headers.get("origin")
    if origin is not None:
        return re.fullmatch(allow_origin_regex, origin) is not None
    return request.headers.get("sec-fetch-site") != "cross-site"


def create_server_router(hosted: bool) -> APIRouter:
    """Endpoints about the server itself, as opposed to Trilogy."""
    router = APIRouter()

    @router.get("/health")
    async def health():
        return {"status": "healthy"}

    # The desktop shell stops its bundled server through /terminate. A hosted
    # deployment has no such caller: there it was an unauthenticated GET that
    # killed the worker and every request in flight on it, so it is not routed.
    if not hosted:

        @router.get("/terminate")
        async def terminate(request: Request):
            if not _may_terminate(request):
                raise HTTPException(403, "Forbidden")
            raise TerminateServer(503, "Terminating server")

    return router


def _get_last_exc():
    exc_type, exc_value, exc_traceback = sys.exc_info()
    sTB = "\n".join(traceback.format_tb(exc_traceback))
    return f"{exc_type}\n - msg: {exc_value}\n stack: {sTB}"


async def exit_app():
    for task in asyncio.all_tasks():
        print(f"cancelling task: {task}")
        try:
            task.cancel()
        except Exception:  # noqa: BLE001 -- shutdown must continue for every task
            print(f"Task kill failed: {_get_last_exc()}")
    asyncio.gather(*asyncio.all_tasks())
    loop = asyncio.get_running_loop()
    loop.stop()


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    """Overdrive the default exception handler to allow for graceful shutdowns"""
    if isinstance(exc, TerminateServer):
        # here is where we terminate all running processes
        task = BackgroundTask(exit_app)
        return PlainTextResponse(
            "Server is shutting down", status_code=exc.status_code, background=task
        )
    # this is a local application, so we don't sanitize 500 responses to
    # support debugging
    # TODO: reevaluate as needed
    elif exc.status_code == 500:
        return JSONResponse(
            status_code=412,
            content=jsonable_encoder({"detail": exc.detail}),
        )
    return JSONResponse(
        status_code=exc.status_code,
        content=jsonable_encoder({"detail": exc.detail}),
        # e.g. Retry-After on a load-shedding 503 from the request gate
        headers=exc.headers,
    )


# Include the reusable trilogy endpoints
trilogy_router = create_trilogy_router(enable_perf_logging=ENABLE_PERF_LOGGING)
app.include_router(trilogy_router)

# Include server-specific endpoints
app.include_router(create_server_router(hosted=policy.HOSTED))


@click.group(cls=DefaultGroup, default="run", default_if_no_args=True)
def cli():
    pass


@cli.command()
def run():
    LOGGING_CONFIG["disable_existing_loggers"] = False
    LOGGING_CONFIG["loggers"]["trilogy.performance"] = {
        "level": "DEBUG" if ENABLE_PERF_LOGGING else "INFO",
        "handlers": ["default"],
        "propagate": False,
    }
    import sys

    if os.environ.get("in-ci"):
        print("Running in a unit test, exiting")
        sys.exit(0)
    elif getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        print("running in a PyInstaller bundle")

        # f = open(os.devnull, "w")
        # sys.stdout = f

        def run():
            uvicorn.run(
                app,
                host=BIND_HOST,
                port=PORT,
                log_level="info",
                log_config=LOGGING_CONFIG,
            )

    else:
        print("Running in a normal Python process, assuming dev")

        def run():
            return uvicorn.run(
                "main:app",
                host=BIND_HOST,
                port=PORT,
                log_level="debug",
                log_config=LOGGING_CONFIG,
                reload=True,
            )

    try:
        run()
    except Exception as e:  # noqa: BLE001 -- top-level server error boundary
        print(f"Server is shutting down due to {e}")
        sys.exit(1)


@cli.command()
def test():

    assert True


if __name__ == "__main__":
    multiprocessing.freeze_support()
    try:
        print(f"Starting Trilogy Server v{__version__}")
        cli()
        sys.exit(0)
    except:  # noqa: E722
        sys.exit(0)
