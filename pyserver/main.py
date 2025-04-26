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
    MultiQueryInSchema
)

# ruff: noqa: E402
from diagnostics import get_diagnostics


CONFIG.rendering.parameters = False

logger = getLogger(__name__)

# Set up performance logging
perf_logger = getLogger("trilogy.performance")

def safe_percentage(part, total):
    """Calculate percentage safely, avoiding divide by zero errors"""
    if total == 0 or total < 0.0001:  # Avoid very small numbers too
        return 0.0
    return (part / total) * 100

# Determine if we're in development mode for performance logging
IS_DEV = (
    os.getenv("ALLOWED_ORIGINS") == "dev" or 
    os.getenv("ENVIRONMENT", "").lower() == "development" or
    (os.getenv("HOST", "").lower() in ("localhost", "127.0.0.1"))
)

# Enable performance logging in dev mode or if explicitly requested
ENABLE_PERF_LOGGING = (
    IS_DEV or 
    os.environ.get("ENABLE_PERF_LOGGING", "false").lower() == "true"
)


# Configure performance logger
def setup_performance_logging():
    if ENABLE_PERF_LOGGING:
        perf_handler = logging.StreamHandler()
        perf_handler.setFormatter(logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        ))
        perf_logger.setLevel(logging.INFO)
        perf_logger.addHandler(perf_handler)
        perf_logger.propagate = True
        perf_logger.info("Performance logging enabled")

# Call this early to set up logging
setup_performance_logging()

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


def generate_single_query(query:str, env: Environment, dialect:BaseDialect, extra_filters:list[str] | None = None, parameters:dict[str, str | int | float] = None):
    start_time = time.time()
    
    # Parse the query
    parse_start = time.time()
    _, parsed = parse_text(safe_format_query(query), env)
    parse_time = time.time() - parse_start
    
    if not parsed:
        if ENABLE_PERF_LOGGING:
            perf_logger.debug(f"No parsed statements (empty query) - Parse time: {parse_time:.4f}s")
        return None, []
    
    final = parsed[-1]
    variables = parameters or {}
    
    # Process variables
    var_start = time.time()
    variable_prefix = ""
    for key, variable in variables.items():
        if isinstance(variable, str):
            if "'''" in variable:
                raise ValueError("cannot safely parse strings with triple quotes")
            variable_prefix += f"\n const {key[1:]} <- '''{variable}''';"
        else:
            variable_prefix += f"\n const {key[1:]} <- {variable};"
    var_time = time.time() - var_start
    
    # Handle different statement types
    if isinstance(final, RawSQLStatement):
        if ENABLE_PERF_LOGGING:
            total_time = time.time() - start_time
            perf_logger.debug(
                f"Raw SQL generation - Total: {total_time:.4f}s | "
                f"Parse: {parse_time:.4f}s | "
                f"Variables: {var_time:.4f}s"
            )
        return ProcessedRawSQLStatement(text=final.text), []
    
    if not isinstance(final, (SelectStatement, MultiSelectStatement)):
        columns = []
        if ENABLE_PERF_LOGGING:
            total_time = time.time() - start_time
            perf_logger.debug(
                f"Non-query generation - Total: {total_time:.4f}s | "
                f"Parse: {parse_time:.4f}s | "
                f"Variables: {var_time:.4f}s"
            )
        return None, columns

    # Process columns
    col_start = time.time()
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
    col_time = time.time() - col_start
    
    # Set limits and process filters
    limit_filter_start = time.time()
    if not final.limit:
        final.limit = STATEMENT_LIMIT
        
    if extra_filters:
        for filter_string in extra_filters:
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
    limit_filter_time = time.time() - limit_filter_start
    
    # Generate the final query
    gen_start = time.time()
    result = dialect.generate_queries(env, [final])[-1]
    gen_time = time.time() - gen_start
    
    if ENABLE_PERF_LOGGING:
        total_time = time.time() - start_time
        perf_logger.debug(
                f"Query generation details - Total: {total_time:.4f}s | "
                f"Parse: {parse_time:.4f}s ({safe_percentage(parse_time, total_time):.1f}%) | "
                f"Variables: {var_time:.4f}s ({safe_percentage(var_time, total_time):.1f}%) | "
                f"Columns: {col_time:.4f}s ({safe_percentage(col_time, total_time):.1f}%) | "
                f"Filters: {limit_filter_time:.4f}s ({safe_percentage(limit_filter_time, total_time):.1f}%) | "
                f"Generation: {gen_time:.4f}s ({safe_percentage(gen_time, total_time):.1f}%)"
            )
        
    return result, columns

def generate_query_core(
    query: QueryInSchema,
    dialect:BaseDialect,
) -> tuple[
    ProcessedQuery
    | ProcessedQueryPersist
    | ProcessedShowStatement
    | ProcessedRawSQLStatement
    | None,
    list[QueryOutColumn],
]:
    if ENABLE_PERF_LOGGING:
        start_time = time.time()
    
        # Time environment setup
        env_start = time.time()
        env = parse_env_from_full_model(query.full_model.sources)
        env_time = time.time() - env_start
        
        # Time imports processing
        import_start = time.time()
        for imp in query.imports:
            if imp.alias:
                imp_string = f"import {imp.name} as {imp.alias};"
            else:
                imp_string = f"import {imp.name};"
            parse_text(imp_string, env)
        import_time = time.time() - import_start
        
        # Time query generation
        gen_start = time.time()
        result = generate_single_query(query.query, env, dialect, query.extra_filters, query.parameters)
        gen_time = time.time() - gen_start
        
        total_time = time.time() - start_time
        perf_logger.info(
            f"Query core timing - Total: {total_time:.4f}s | "
            f"Env setup: {env_time:.4f}s ({safe_percentage(env_time, total_time):.1f}%) | "
            f"Imports: {import_time:.4f}s ({safe_percentage(import_time,total_time):.1f}%) | "
            f"Generation: {gen_time:.4f}s ({safe_percentage(gen_time,total_time):.1f}%)"
        )
        return result
    else:
        env = parse_env_from_full_model(query.full_model.sources)
        for imp in query.imports:
            if imp.alias:
                imp_string = f"import {imp.name} as {imp.alias};"
            else:
                imp_string = f"import {imp.name};"
            parse_text(imp_string, env)
        return generate_single_query(query.query, env, dialect, query.extra_filters, query.parameters)


def generate_multi_query_core(
    query: MultiQueryInSchema,
    dialect:BaseDialect,
) -> list[tuple[
    ProcessedQuery
    | ProcessedQueryPersist
    | ProcessedShowStatement
    | ProcessedRawSQLStatement
    | None,
    list[QueryOutColumn]],
]:
    if ENABLE_PERF_LOGGING:
        start_time = time.time()
        
    env = parse_env_from_full_model(query.full_model.sources)

    if ENABLE_PERF_LOGGING:
        env_time = time.time() - start_time
        import_start = time.time()
        
    for imp in query.imports:
        if imp.alias:
            imp_string = f"import {imp.name} as {imp.alias};"
        else:
            imp_string = f"import {imp.name};"
        parse_text(imp_string, env)
        
    if ENABLE_PERF_LOGGING:
        import_time = time.time() - import_start
        queries_start = time.time()
        
    all = []
    for subquery in query.queries:
        generated, columns = generate_single_query(subquery.query, env, dialect, subquery.extra_filters, subquery.parameters)
        all.append([generated, columns])
        
    if ENABLE_PERF_LOGGING:
        queries_time = time.time() - queries_start
        total_time = time.time() - start_time
        perf_logger.info(
            f"Multi-query generation - Total: {total_time:.4f}s | "
            f"Env setup: {env_time:.4f}s ({safe_percentage(env_time,total_time):.1f}%) | "
            f"Imports: {import_time:.4f}s ({safe_percentage(import_time,total_time):.1f}%) | "
            f"Queries: {queries_time:.4f}s ({safe_percentage(queries_time,total_time):.1f}%) | "
            f"Query count: {len(query.queries)}"
        )
        
    return all

def query_to_output(target, columns, dialect:BaseDialect):
    if ENABLE_PERF_LOGGING:
        start_time = time.time()
        
    if not target:
        if ENABLE_PERF_LOGGING:
            perf_logger.debug(f"Empty output generation: {time.time() - start_time:.4f}s")
        return QueryOut(generated_sql=None, columns=columns)

    if isinstance(target, RawSQLStatement):
        output = QueryOut(generated_sql=target.text, columns=columns)
        if ENABLE_PERF_LOGGING:
            perf_logger.debug(f"Raw SQL output generation: {time.time() - start_time:.4f}s")
        return output
    else:
        compile_start = time.time()
        sql = dialect.compile_statement(target)
        compile_time = time.time() - compile_start
        
        output = QueryOut(generated_sql=sql, columns=columns)
        
        if ENABLE_PERF_LOGGING:
            total_time = time.time() - start_time
            perf_logger.debug(
                f"SQL output generation - Total: {total_time:.4f}s | "
                f"SQL Compilation: {compile_time:.4f}s ({safe_percentage(compile_time,total_time):.1f}%) | "
                f"SQL length: {len(sql)} chars"
            )
            
        return output

@router.post("/generate_queries")
def generate_queries(queries:MultiQueryInSchema):
    if ENABLE_PERF_LOGGING:
        start_time = time.time()
        
    try:
        dialect = get_dialect_generator(queries.dialect)
        
        if ENABLE_PERF_LOGGING:
            dialect_time = time.time() - start_time
            statements_start = time.time()
            
        statements = generate_multi_query_core(queries, dialect)

        
        if ENABLE_PERF_LOGGING:
            statements_time = time.time() - statements_start
            output_start = time.time()
            
        result = {'queries': [query_to_output(target, columns, dialect) for target, columns in statements]}
        
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
            perf_logger.error(f"Multi-query generation failed after {error_time:.4f}s: {str(e)}")
            
        raise HTTPException(status_code=422, detail="Parsing error: " + str(e))


@router.post("/generate_query")
def generate_query(query: QueryInSchema):
    if ENABLE_PERF_LOGGING:
        start_time = time.time()
        query_size = len(query.query)
        perf_logger.info(f"Starting query generation - Size: {query_size} chars | Dialect: {query.dialect}")
        
    try:
        # Time the dialect generation
        dialect_start = time.time()
        dialect = get_dialect_generator(query.dialect)
        dialect_time = time.time() - dialect_start
        
        # Time the query core processing
        core_start = time.time()
        target, columns = generate_query_core(query, dialect)
        core_time = time.time() - core_start
        
        # Time the output formatting
        output_start = time.time()
        result = query_to_output(target, columns, dialect)
        output_time = time.time() - output_start
        
        if ENABLE_PERF_LOGGING:
            # Calculate total time and log performance metrics
            total_time = time.time() - start_time
            sql_size = len(result.generated_sql) if result.generated_sql else 0
            
            perf_logger.info(
                f"Query generation completed - Total: {total_time:.4f}s | "
                f"Dialect setup: {dialect_time:.4f}s ({safe_percentage(dialect_time,total_time):.1f}%) | "
                f"Core processing: {core_time:.4f}s ({safe_percentage(core_time,total_time):.1f}%) | "
                f"Output formatting: {output_time:.4f}s ({safe_percentage(output_time,total_time):.1f}%) | "
                f"Input size: {query_size} chars | "
                f"Output size: {sql_size} chars | "
                f"Dialect: {query.dialect}"
            )
            
        return result
        
    except Exception as e:
        if ENABLE_PERF_LOGGING:
            error_time = time.time() - start_time
            perf_logger.error(f"Query generation failed after {error_time:.4f}s: {str(e)}")
            
        raise HTTPException(status_code=422, detail="Parsing error: " + str(e))


@router.post("/parse_model")
def parse_model(model: ModelInSchema) -> Model:
    if ENABLE_PERF_LOGGING:
        start_time = time.time()
        
    try:
        result = model_to_response(model)
        
        if ENABLE_PERF_LOGGING:
            total_time = time.time() - start_time
            perf_logger.info(f"Model parsing - Total: {total_time:.4f}s | Model size: {len(str(model))} chars")
            
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