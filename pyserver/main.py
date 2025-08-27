import os
import sys
from pathlib import Path

import asyncio
import multiprocessing
import traceback
import time
import logging
from typing import Dict
from dataclasses import dataclass
import uvicorn
from uvicorn.config import LOGGING_CONFIG

from starlette.background import BackgroundTask
from trilogy import Environment, Executor
from trilogy.parser import parse_text
from trilogy.parsing.render import Renderer
from trilogy.dialect.base import BaseDialect
from logging import getLogger
import click
from click_default_group import DefaultGroup

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse
from env_helpers import parse_env_from_full_model, model_to_response
from trilogy.render import get_dialect_generator
from trilogy import CONFIG, __version__
from trilogy.core.exceptions import InvalidSyntaxException


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

# ruff: noqa: E402
from io_models import (
    QueryInSchema,
    FormatQueryOutSchema,
    ModelInSchema,
    Model,
    ValidateQueryInSchema,
    ValidateItem,
    MultiQueryInSchema,
    MultiQueryOutSchema,
)

# ruff: noqa: E402
from diagnostics import get_diagnostics
from utility import safe_percentage
from query_helpers import (
    generate_multi_query_core,
    generate_query_core,
    query_to_output,
    safe_format_query,
    PARSE_CONFIG,
)


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

app = FastAPI()


@dataclass
class InstanceSettings:
    connections: Dict[str, Executor]
    models: Dict[str, Environment]


allowed_origins = [
    "app://.",
]

# if not IN_APP_CONFIG.validate:
allowed_origins += []

if os.getenv("ALLOWED_ORIGINS") == "dev":
    allow_origin_regex = "(https://trilogy-data.github.io)|(https://trilogydata.dev)|(app://.)|(http://localhost:[0-9]+)|(http://127.0.0.1:[0-9]+)"
else:
    allow_origin_regex = (
        "(https://trilogy-data.github.io)|(https://trilogydata.dev)|(app://.)"
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization"],
    allow_origin_regex=allow_origin_regex,
)

RENDERERS: Dict[str, BaseDialect]

router = APIRouter()


@router.post("/format_query")
def format_query(query: QueryInSchema):
    env = parse_env_from_full_model(query.full_model.sources)
    try:
        _, parsed = parse_text(
            safe_format_query(query.query), env, parse_config=PARSE_CONFIG
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail="Parsing error: " + str(e))
    renderer = Renderer()
    output = FormatQueryOutSchema(
        text="\n\n".join([renderer.to_string(x) for x in parsed])
    )
    return output


@router.post("/validate_query")
def validate_query(query: ValidateQueryInSchema):
    filter_validation: list[ValidateItem] = []
    try:
        # check filters, but return main validation
        if query.extra_filters:
            for idx, filter_string in enumerate(query.extra_filters):
                try:
                    base = get_diagnostics(
                        f"WHERE {filter_string} SELECT 1 as __ftest_{idx};",
                        query.sources,
                    )
                    if base.items:
                        filter_validation.append(
                            ValidateItem(
                                startLineNumber=0,
                                startColumn=0,
                                endLineNumber=0,
                                endColumn=0,
                                message=base.items[0].message,
                                severity=base.items[0].severity,
                            )
                        )
                except Exception as e:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Filter validation error for {filter_string}: "
                        + str(e),
                    )
        base_imp_string = ""
        for imp in query.imports:
            if imp.alias:
                imp_string = f"import {imp.name} as {imp.alias};\n"
            else:
                imp_string = f"import {imp.name};\n"
            base_imp_string += imp_string
        base = get_diagnostics(base_imp_string + query.query, query.sources)
        base.items += filter_validation
        return base
    except Exception as e:
        raise HTTPException(status_code=422, detail="Parsing error: " + str(e))


@router.post("/generate_queries")
def generate_queries(queries: MultiQueryInSchema):
    if ENABLE_PERF_LOGGING:
        start_time = time.time()

    try:
        dialect = get_dialect_generator(queries.dialect)

        if ENABLE_PERF_LOGGING:
            dialect_time = time.time() - start_time
            statements_start = time.time()

        statements = generate_multi_query_core(queries, dialect, ENABLE_PERF_LOGGING)

        if ENABLE_PERF_LOGGING:
            statements_time = time.time() - statements_start
            output_start = time.time()

        result = MultiQueryOutSchema(
            queries=[
                query_to_output(target, columns, label, dialect, ENABLE_PERF_LOGGING)
                for label, target, columns in statements
            ]
        )

        if ENABLE_PERF_LOGGING:
            output_time = time.time() - output_start
            total_time = time.time() - start_time

            perf_logger.info(
                f"Multi-query endpoint - Total: {total_time:.4f}s | "
                f"Dialect: {dialect_time:.4f}s ({safe_percentage(dialect_time,total_time):.1f}%) | "
                f"Statements: {statements_time:.4f}s ({safe_percentage(statements_time,total_time):.1f}%) | "
                f"Output: {output_time:.4f}s ({safe_percentage(output_time,total_time):.1f}%) | "
                f"Dialect: {queries.dialect} | "
                f"Query count: {len(queries.queries)}"
            )

        return result
    except Exception as e:
        if ENABLE_PERF_LOGGING:
            error_time = time.time() - start_time
            perf_logger.error(
                f"Multi-query generation failed after {error_time:.4f}s: {str(e)}"
            )

        raise HTTPException(status_code=422, detail="Parsing error: " + str(e))


@router.post("/generate_query")
def generate_query(query: QueryInSchema):
    if ENABLE_PERF_LOGGING:
        start_time = time.perf_counter()
        query_size = len(query.query)
        perf_logger.info(
            f"Starting query generation - Size: {query_size} chars | Dialect: {query.dialect}"
        )
    try:
        # Time the dialect generation
        dialect_start = time.perf_counter()
        dialect = get_dialect_generator(query.dialect)
        dialect_time = time.perf_counter() - dialect_start

        # Time the query core processing
        core_start = time.perf_counter()
        target, columns = generate_query_core(query, dialect, ENABLE_PERF_LOGGING)
        core_time = time.perf_counter() - core_start

        # Time the output formatting
        output_start = time.perf_counter()
        result = query_to_output(
            target, columns, "default", dialect, ENABLE_PERF_LOGGING
        )
        output_time = time.perf_counter() - output_start

        if ENABLE_PERF_LOGGING:
            # Calculate total time and log performance metrics
            total_time = time.perf_counter() - start_time
            sql_size = len(result.generated_sql) if result.generated_sql else 0

            # Calculate unaccounted time
            accounted_time = dialect_time + core_time + output_time
            unaccounted_time = total_time - accounted_time

            perf_logger.info(
                f"Query generation completed - Total: {total_time:.6f}s | "
                f"Dialect setup: {dialect_time:.6f}s ({safe_percentage(dialect_time,total_time):.1f}%) | "
                f"Core processing: {core_time:.6f}s ({safe_percentage(core_time,total_time):.1f}%) | "
                f"Output formatting: {output_time:.6f}s ({safe_percentage(output_time,total_time):.1f}%) | "
                f"Unaccounted: {unaccounted_time:.6f}s ({safe_percentage(unaccounted_time,total_time):.1f}%) | "
                f"Input size: {query_size} chars | "
                f"Output size: {sql_size} chars | "
                f"Dialect: {query.dialect}"
            )
        return result
    except InvalidSyntaxException as e:
        if ENABLE_PERF_LOGGING:
            error_time = time.perf_counter() - start_time
            perf_logger.error(
                f"Query generation failed after {error_time:.6f}s: {str(e)}"
            )
        raise HTTPException(status_code=422, detail=e.args[0])
    except Exception as e:
        if ENABLE_PERF_LOGGING:
            error_time = time.perf_counter() - start_time
            perf_logger.error(
                f"Query generation failed after {error_time:.6f}s: {str(e)}"
            )
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/parse_model")
def parse_model(model: ModelInSchema) -> Model:
    if ENABLE_PERF_LOGGING:
        start_time = time.time()

    try:
        result = model_to_response(model)

        if ENABLE_PERF_LOGGING:
            total_time = time.time() - start_time
            perf_logger.info(
                f"Model parsing - Total: {total_time:.4f}s | Model size: {len(str(model))} chars"
            )

        return result

    except Exception as e:
        if ENABLE_PERF_LOGGING:
            error_time = time.time() - start_time
            perf_logger.error(f"Model parsing failed after {error_time:.4f}s: {str(e)}")

        raise HTTPException(status_code=422, detail="Parsing error: " + str(e))


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
