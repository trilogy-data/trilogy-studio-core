import os
import sys
from pathlib import Path

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
from trilogy.authoring import (
    Concept,
    SelectStatement,
    MultiSelectStatement,
    RawSQLStatement,
    DEFAULT_NAMESPACE,
)
from trilogy.core.statements.execute import (
    ProcessedRawSQLStatement,
    ProcessedQueryPersist,
    ProcessedShowStatement,
    ProcessedQuery,
)
from trilogy.core.models.core import TraitDataType
from logging import getLogger
import click
from click_default_group import DefaultGroup

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse
from env_helpers import parse_env_from_full_model, model_to_response
from trilogy.render import get_dialect_generator
from trilogy import CONFIG
from trilogy import __version__



# Define the path to the .env file
env_path = Path(__file__).parent / ".env"

# Load the .env file if it exists
if os.path.exists(env_path):
    with open(env_path, "r") as file:
        for line in file:
            line = line.strip()
            if line and not line.startswith("#"):  # Ignore empty lines and comments
                key, value = line.split("=", 1)  # Split at the first '='
                os.environ[key.strip()] = value.strip()  # Set environment variable

current_directory = Path(__file__).parent

sys.path.append(str(current_directory))

# ruff: noqa: E402
from io_models import (
    QueryInSchema,
    FormatQueryOutSchema,
    QueryOut,
    QueryOutColumn,
    ModelInSchema,
    Model,
    ValidateQueryInSchema,
    ValidateItem,
)

# ruff: noqa: E402
from diagnostics import get_diagnostics


CONFIG.rendering.parameters = False

logger = getLogger(__name__)

PORT = 5678

STATEMENT_LIMIT = 100_00


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

# GENAI_CONNECTIONS: Dict[str, NLPEngine] = {}

router = APIRouter()


def safe_format_query(input: str) -> str:
    input = input.strip()
    if len(input) == 0:
        return ""
    if input[-1] != ";":
        return input + ";"
    return input


def get_traits(concept: Concept) -> list[str]:
    if isinstance(concept.datatype, TraitDataType):
        return concept.datatype.traits
    return []


@router.post("/format_query")
def format_query(query: QueryInSchema):
    env = parse_env_from_full_model(query.full_model.sources)
    try:
        _, parsed = parse_text(safe_format_query(query.query), env)
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
            for filter_string in query.extra_filters:
                try:
                    base = get_diagnostics(
                        f"WHERE {filter_string} SELECT 1 as ftest;", query.sources
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


def generate_query_core(
    query: QueryInSchema,
) -> tuple[
    ProcessedQuery
    | ProcessedQueryPersist
    | ProcessedShowStatement
    | ProcessedRawSQLStatement
    | None,
    list[QueryOutColumn],
]:
    env = parse_env_from_full_model(query.full_model.sources)
    dialect = get_dialect_generator(query.dialect)
    for imp in query.imports:
        if imp.alias:
            imp_string = f"import {imp.name} as {imp.alias};"
        else:
            imp_string = f"import {imp.name};"
        parse_text(imp_string, env)
    _, parsed = parse_text(safe_format_query(query.query), env)
    final = parsed[-1]
    variables = query.parameters or {}
    variable_prefix = ""
    for key, variable in variables.items():
        if isinstance(variable, str):
            if "'''" in variable:
                raise ValueError("cannot safely parse strings with triple quotes")
            variable_prefix += f"\n const {key[1:]} <- '''{variable}''';"
        else:
            variable_prefix += f"\n const {key[1:]} <- {variable};"
    if isinstance(final, RawSQLStatement):
        return ProcessedRawSQLStatement(text=final.text), []
    if not isinstance(final, (SelectStatement, MultiSelectStatement)):
        columns = []
        generated = None

    else:
        columns = [
            QueryOutColumn(
                name=x.name if x.namespace == DEFAULT_NAMESPACE else x.address,
                datatype=env.concepts[x.address].datatype,
                purpose=env.concepts[x.address].purpose,
                traits=get_traits(env.concepts[x.address]),
                description=env.concepts[x.address].metadata.description,
            )
            for x in final.output_components
        ]
        if not final.limit:
            final.limit = STATEMENT_LIMIT
        if query.extra_filters:
            for filter_string in query.extra_filters:
                base = "" + variable_prefix
                for v in variables:
                    # remove the prefix
                    filter_string = filter_string.replace(v[0], v[0][1:])
                _, fparsed = parse_text(
                    f"{base}\nWHERE {filter_string} SELECT 1 as ftest;", env
                )
                filterQuery: SelectStatement = fparsed[-1]  # type: ignore
                if not filterQuery.where_clause:
                    continue
                if not final.where_clause:
                    final.where_clause = filterQuery.where_clause
                else:
                    final.where_clause.conditional = (
                        final.where_clause.conditional
                        + filterQuery.where_clause.conditional
                    )
        generated = dialect.generate_queries(environment=env, statements=[final])
    if not generated:
        return None, []
    return generated[-1], columns


@router.post("/generate_query")
def generate_query(query: QueryInSchema):
    try:
        target, columns = generate_query_core(query)
    except Exception as e:
        raise HTTPException(status_code=422, detail="Parsing error: " + str(e))
    if not target:
        return QueryOut(generated_sql=None, columns=columns)

    if isinstance(target, RawSQLStatement):
        output = QueryOut(generated_sql=target.text, columns=columns)
        return output
    else:
        dialect = get_dialect_generator(query.dialect)
        output = QueryOut(
            generated_sql=dialect.compile_statement(target), columns=columns
        )
        return output


@router.post("/parse_model")
def parse_model(model: ModelInSchema) -> Model:
    try:

        return model_to_response(model)
    except Exception as e:
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
        print(f"Starting Trilogy Server v{__version__}")
        cli()
        sys.exit(0)
    except:  # noqa: E722
        sys.exit(0)
