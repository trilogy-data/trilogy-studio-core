import os
import sys
from pathlib import Path

current_directory = Path(__file__).parent.parent

sys.path.append(str(current_directory))

import asyncio
import multiprocessing
import traceback
from typing import Dict
from dataclasses import dataclass
import uvicorn
from uvicorn.config import LOGGING_CONFIG

from starlette.background import BackgroundTask
from trilogy import Environment, Executor
from trilogy.parser import parse_text
from trilogy.parsing.render import Renderer
from trilogy.dialect.base import BaseDialect
from io_models import QueryInSchema, FormatQueryOutSchema, QueryOut, QueryOutColumn

from logging import getLogger
import click
from click_default_group import DefaultGroup

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse
from env_helpers import parse_env_from_full_model
from trilogy.render import get_dialect_generator
from trilogy import CONFIG

CONFIG.rendering.parameters = False

logger = getLogger(__name__)

PORT = 5678

STATEMENT_LIMIT = 100


app = FastAPI()


@dataclass
class InstanceSettings:
    connections: Dict[str, Executor]
    models: Dict[str, Environment]


allowed_origins = [
    "app://.",
]

# if not IN_APP_CONFIG.validate:
allowed_origins += [
    "http://localhost:8080",
    "http://localhost:8081",
    "http://localhost:8090",
]
allow_origin_regex = "(app://.)|(http://localhost:[0-9]+)"


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization"],
    allow_origin_regex=allow_origin_regex,
)

RENDERERS: Dict[str, BaseDialect]

# GENAI_CONNECTIONS: Dict[str, NLPEngine] = {}

router = APIRouter()


def safe_format_query(input: str) -> str:
    input = input.strip()
    if input[-1] != ";":
        return input + ";"
    return input


@router.post("/format_query")
def format_query(query: QueryInSchema):
    env = parse_env_from_full_model(query.full_model)
    try:
        _, parsed = parse_text(safe_format_query(query.query), env)
    except Exception as e:
        raise HTTPException(status_code=422, detail="Parsing error: " + str(e))
    renderer = Renderer()
    output = FormatQueryOutSchema(
        text="\n\n".join([renderer.to_string(x) for x in parsed])
    )
    return output


@router.post("/generate_query")
def generate_query(query: QueryInSchema):
    env = parse_env_from_full_model(query.full_model)
    dialect = get_dialect_generator(query.dialect)
    try:
        _, parsed = parse_text(safe_format_query(query.query), env)
        final = parsed[-1]
        columns = [
            QueryOutColumn(
                name=x.address,
                datatype=env.concepts[x.address].datatype,
                purpose=env.concepts[x.address].purpose,
            )
            for x in final.output_components
        ]
        generated = dialect.generate_queries(environment=env, statements=[final])
    except Exception as e:
        raise HTTPException(status_code=422, detail="Parsing error: " + str(e))

    output = QueryOut(
        generated_sql=dialect.compile_statement(generated[-1]), columns=columns
    )
    return output


## Core
@router.get("/")
async def healthcheck():
    return "healthy"


@router.get("/terminate")
async def terminate():
    raise HTTPException(503, "Terminating server")


@app.on_event("shutdown")
def shutdown_event():
    print("Shutting down...!")


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


app.include_router(router)


@click.group(cls=DefaultGroup, default="run", default_if_no_args=True)
def cli():
    pass


@cli.command()
def run():
    LOGGING_CONFIG["disable_existing_loggers"] = True
    import sys

    if os.environ.get("in-ci"):
        print("Running in a unit test, exiting")
        exit(0)
    elif getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        print("running in a PyInstaller bundle")

        f = open(os.devnull, "w")
        sys.stdout = f

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
                log_level="info",
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
        cli()
        sys.exit(0)
    except:  # noqa: E722
        sys.exit(0)
