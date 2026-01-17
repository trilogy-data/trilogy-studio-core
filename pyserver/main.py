import os
import sys
from pathlib import Path

import asyncio
import multiprocessing
import traceback
import logging
from typing import Dict
from dataclasses import dataclass
import uvicorn
from uvicorn.config import LOGGING_CONFIG

from starlette.background import BackgroundTask
from trilogy import Environment, Executor
from logging import getLogger
import click
from click_default_group import DefaultGroup

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse
from trilogy import CONFIG, __version__
from contextlib import asynccontextmanager


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
                os.environ[key.strip()] = value.strip()

current_directory = Path(__file__).parent

sys.path.append(str(current_directory))

CONFIG.rendering.parameters = False

logger = getLogger(__name__)

# Set up performance logging
perf_logger = getLogger("trilogy.performance")


# Determine if we're in development mode for performance logging
IS_DEV = (
    os.getenv("ALLOWED_ORIGINS") == "dev"
    or os.getenv("ENVIRONMENT", "").lower() == "development"
    or (os.getenv("HOST", "").lower() in ("localhost", "127.0.0.1"))
)

IS_DOCKER = os.getenv("IN_DOCKER_IMAGE", "") == "1"

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

PORT = 5678


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up...!")

    yield

    print("Shutting down...!")


app = FastAPI(lifespan=lifespan)


@dataclass
class InstanceSettings:
    connections: Dict[str, Executor]
    models: Dict[str, Environment]


allowed_origins = [
    "app://.",
]

# if not IN_APP_CONFIG.validate:
allowed_origins += []

if os.getenv("ALLOWED_ORIGINS") == "dev" or IS_DOCKER:
    allow_origin_regex = "(https://trilogy-data.github.io)|(https://trilogydata.dev)|(app://.)|(http://localhost:[0-9]+)|(http://127.0.0.1:[0-9]+)"
else:
    allow_origin_regex = (
        "(https://trilogy-data.github.io)|(https://trilogydata.dev)|(https://greenmtnboy.github.io)|(app://.)"
    )
allow_origin_regex = "(https://trilogy-data.github.io)|(https://trilogydata.dev)|(https://greenmtnboy.github.io)|(app://.)|(http://localhost:[0-9]+)|(http://127.0.0.1:[0-9]+)"
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization"],
    allow_origin_regex=allow_origin_regex,
)

# Create a local router for server-specific endpoints
server_router = APIRouter()


@server_router.get("/terminate")
async def terminate():
    raise HTTPException(503, "Terminating server")


@server_router.get("/health")
async def health():
    return {"status": "healthy"}


def _get_last_exc():
    exc_type, exc_value, exc_traceback = sys.exc_info()
    sTB = "\n".join(traceback.format_tb(exc_traceback))
    return f"{exc_type}\n - msg: {exc_value}\n stack: {sTB}"


async def exit_app():
    for task in asyncio.all_tasks():
        print(f"cancelling task: {task}")
        try:
            task.cancel()
        except Exception:
            print(f"Task kill failed: {_get_last_exc()}")
            pass
    asyncio.gather(*asyncio.all_tasks())
    loop = asyncio.get_running_loop()
    loop.stop()


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    """Overdrive the default exception handler to allow for graceful shutdowns"""
    if exc.status_code == 503:
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
    )


# Include the reusable trilogy endpoints
trilogy_router = create_trilogy_router(enable_perf_logging=ENABLE_PERF_LOGGING)
app.include_router(trilogy_router)

# Include server-specific endpoints
app.include_router(server_router)


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
        exit(0)
    elif getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        print("running in a PyInstaller bundle")

        # f = open(os.devnull, "w")
        # sys.stdout = f

        def run():
            uvicorn.run(
                app,
                host="0.0.0.0",
                port=PORT,
                log_level="info",
                log_config=LOGGING_CONFIG,
            )

    else:
        print("Running in a normal Python process, assuming dev")

        def run():
            return uvicorn.run(
                "main:app",
                host="0.0.0.0",
                port=PORT,
                log_level="debug",
                log_config=LOGGING_CONFIG,
                reload=True,
            )

    try:
        run()
    except Exception as e:
        print(f"Server is shutting down due to {e}")
        exit(1)


@cli.command()
def test():

    assert 1 == 1


if __name__ == "__main__":
    multiprocessing.freeze_support()
    try:
        print(f"Starting Trilogy Server v{__version__}")
        cli()
        sys.exit(0)
    except:  # noqa: E722
        sys.exit(0)
