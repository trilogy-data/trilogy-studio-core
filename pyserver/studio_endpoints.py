"""
Reusable Trilogy API endpoints module.
Can be imported and attached to any FastAPI application.
"""

import time
import traceback
from logging import getLogger

from fastapi import APIRouter, HTTPException
from trilogy.authoring import SelectItem, SelectStatement
from trilogy.constants import Rendering
from trilogy.core.exceptions import InvalidSyntaxException
from trilogy.parser import parse_text
from trilogy.parsing.render import Renderer
from trilogy.render import get_dialect_generator

from diagnostics import get_diagnostics
from env_helpers import (
    model_to_response,
    normalize_relative_imports,
    parse_env_from_full_model,
    resolve_import_path,
)
from io_models import (
    DrilldownQueryInSchema,
    FormatQueryOutSchema,
    ModelInSchema,
    MultiQueryInSchema,
    MultiQueryOutSchema,
    QueryInSchema,
    ValidateItem,
    ValidateQueryInSchema,
)
from process_pool import run_aux_task, run_cpu_bound
from query_helpers import (
    PARSE_CONFIG,
    generate_multi_query_core,
    generate_query_core,
    prepare_filter_params,
    query_to_output,
    safe_format_query,
)
from utility import safe_percentage

logger = getLogger(__name__)
perf_logger = getLogger("trilogy.performance")


PARAMETER_RENDERING = Rendering(parameters=True)


def _build_http_error_payload(status_code: int, detail: str) -> dict:
    return {
        "__http_error__": {
            "status_code": status_code,
            "detail": detail,
        }
    }


def _http_error_payload(exc: HTTPException) -> dict:
    return _build_http_error_payload(exc.status_code, exc.detail)


def _worker_http_error(status_code: int, detail: str) -> dict:
    return _build_http_error_payload(status_code, detail)


def _raise_if_worker_error(payload: dict) -> dict:
    error = payload.get("__http_error__")
    if error:
        raise HTTPException(
            status_code=error["status_code"],
            detail=error["detail"],
        )
    return payload


def _run_inline_task(task_name: str, task, *args):
    start_time = time.perf_counter()
    payload = task(*args)
    elapsed = time.perf_counter() - start_time
    perf_logger.info(
        "Inline task completed - Task: %s | Total: %.6fs",
        task_name,
        elapsed,
    )
    return _raise_if_worker_error(payload)


def _format_query_task(query_data: dict) -> dict:
    query = QueryInSchema.model_validate(query_data)
    env = parse_env_from_full_model(query.full_model.sources)
    try:
        base_imp_string = ""
        for imp in query.imports:
            resolved = resolve_import_path(imp.name, query.current_filename)
            if imp.alias:
                base_imp_string += f"import {resolved} as {imp.alias};\n"
            else:
                base_imp_string += f"import {resolved};\n"
        _, parsed = parse_text(
            safe_format_query(
                base_imp_string
                + normalize_relative_imports(query.query, query.current_filename)
            ),
            env,
            parse_config=PARSE_CONFIG,
        )
    except HTTPException as exc:
        return _http_error_payload(exc)
    except Exception as exc:
        return _worker_http_error(422, "Parsing error: " + str(exc))
    renderer = Renderer()
    return FormatQueryOutSchema(
        text=renderer.render_statement_string(parsed)
    ).model_dump(mode="json")


def _drilldown_query_task(query_data: dict) -> dict:
    query = DrilldownQueryInSchema.model_validate(query_data)
    env = parse_env_from_full_model(query.full_model.sources)
    try:
        base_imp_string = ""
        for imp in query.imports:
            if imp.alias:
                imp_string = (
                    f"import {resolve_import_path(imp.name, query.current_filename)}"
                    f" as {imp.alias};\n"
                )
            else:
                imp_string = (
                    f"import {resolve_import_path(imp.name, query.current_filename)};\n"
                )
            base_imp_string += imp_string
        _, parsed = parse_text(
            safe_format_query(
                base_imp_string
                + normalize_relative_imports(query.query, query.current_filename)
            ),
            env,
            parse_config=PARSE_CONFIG,
        )
        _, where_parsed = parse_text(
            f"WHERE {query.drilldown_filter} SELECT 1 as __ftest;",
            env,
            parse_config=PARSE_CONFIG,
        )
        where_clause = where_parsed[-1]
        assert isinstance(where_clause, SelectStatement), type(where_clause)
        parsed_query = parsed[-1]
        if not isinstance(parsed_query, SelectStatement):
            raise HTTPException(
                status_code=422, detail="Cannot drill into non-select statements"
            )
        target = env.concepts[query.drilldown_remove]
        remove_idx = [
            i
            for i, comp in enumerate(parsed_query.selection)
            if comp.concept.address == target.address
        ]
        components = parsed_query.selection
        del components[remove_idx[0]]
        for idx, val in enumerate(query.drilldown_add):
            components.insert(
                remove_idx[0] + idx,
                SelectItem(content=env.concepts[val].reference),
            )

        where_filter = where_clause.where_clause
        if where_filter:
            if parsed_query.where_clause:
                parsed_query.where_clause.conditional = (
                    parsed_query.where_clause.conditional + where_filter.conditional
                )
            else:
                parsed_query.where_clause = where_filter
        parsed_query.selection = components
    except HTTPException as exc:
        return _http_error_payload(exc)
    except Exception as exc:
        return _worker_http_error(422, "Parsing error: " + str(exc))
    renderer = Renderer()
    return FormatQueryOutSchema(
        text=renderer.render_statement_string(parsed)
    ).model_dump(mode="json")


def _validate_query_task(query_data: dict) -> dict:
    query = ValidateQueryInSchema.model_validate(query_data)
    filter_validation: list[ValidateItem] = []
    parameters = query.parameters or {}
    param_declarations, cleaned_filters, _ = prepare_filter_params(
        query.extra_filters or [], parameters
    )
    try:
        if cleaned_filters:
            for idx, filter_string in enumerate(cleaned_filters):
                try:
                    base = get_diagnostics(
                        f"{param_declarations}\nWHERE {filter_string} SELECT 1 as __ftest_{idx};",
                        query.sources,
                        current_filename=query.current_filename,
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
                except Exception as exc:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Filter validation error for {filter_string}: "
                        + str(exc),
                    )
        base_imp_string = ""
        for imp in query.imports:
            if imp.alias:
                imp_string = (
                    f"import {resolve_import_path(imp.name, query.current_filename)}"
                    f" as {imp.alias};\n"
                )
            else:
                imp_string = (
                    f"import {resolve_import_path(imp.name, query.current_filename)};\n"
                )
            base_imp_string += imp_string
        base = get_diagnostics(
            base_imp_string + query.query,
            query.sources,
            current_filename=query.current_filename,
        )
        base.items += filter_validation
        return base.model_dump(mode="json")
    except HTTPException as exc:
        return _http_error_payload(exc)
    except Exception as exc:
        return _worker_http_error(422, "Parsing error: " + str(exc))


def _generate_queries_task(queries_data: dict, enable_perf_logging: bool) -> dict:
    queries = MultiQueryInSchema.model_validate(queries_data)
    perf_logger = getLogger("trilogy.performance")
    if enable_perf_logging:
        start_time = time.time()

    try:
        dialect = get_dialect_generator(
            queries.dialect,
            rendering=PARAMETER_RENDERING,
        )

        if enable_perf_logging:
            dialect_time = time.time() - start_time
            statements_start = time.time()

        statements = generate_multi_query_core(queries, dialect, enable_perf_logging)

        if enable_perf_logging:
            statements_time = time.time() - statements_start
            output_start = time.time()

        result = MultiQueryOutSchema(
            queries=[
                query_to_output(
                    target, columns, values, label, dialect, enable_perf_logging
                )
                for label, target, columns, values in statements
            ]
        )

        if enable_perf_logging:
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

        return result.model_dump(mode="json")
    except HTTPException as exc:
        return _http_error_payload(exc)
    except Exception as exc:
        if enable_perf_logging:
            error_time = time.time() - start_time
            perf_logger.error(
                f"Multi-query generation failed after {error_time:.4f}s: {str(exc)}"
            )

        return _worker_http_error(422, "Parsing error: " + str(exc))


def _generate_query_task(query_data: dict, enable_perf_logging: bool) -> dict:
    query = QueryInSchema.model_validate(query_data)
    perf_logger = getLogger("trilogy.performance")
    if enable_perf_logging:
        start_time = time.perf_counter()
        query_size = len(query.query)
        perf_logger.info(
            f"Starting query generation - Size: {query_size} chars | Dialect: {query.dialect}"
        )
    try:
        dialect_start = time.perf_counter()
        dialect = get_dialect_generator(
            query.dialect,
            rendering=PARAMETER_RENDERING,
        )
        dialect_time = time.perf_counter() - dialect_start

        core_start = time.perf_counter()
        target, columns, results, select_count = generate_query_core(
            query, dialect, enable_perf_logging
        )
        core_time = time.perf_counter() - core_start

        output_start = time.perf_counter()
        result = query_to_output(
            target,
            columns,
            results,
            "default",
            dialect,
            enable_perf_logging,
            select_count,
        )
        output_time = time.perf_counter() - output_start

        if enable_perf_logging:
            total_time = time.perf_counter() - start_time
            sql_size = len(result.generated_sql) if result.generated_sql else 0
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
        return result.model_dump(mode="json")
    except InvalidSyntaxException as exc:
        if enable_perf_logging:
            error_time = time.perf_counter() - start_time
            perf_logger.error(f"Syntax error in query: {error_time:.6f}s: {str(exc)}")
        return _http_error_payload(HTTPException(status_code=422, detail=exc.args[0]))
    except HTTPException as exc:
        return _http_error_payload(exc)
    except Exception as exc:
        if enable_perf_logging:
            error_time = time.perf_counter() - start_time
            tb = traceback.format_exc()
            perf_logger.error(
                f"Query generation failed after {error_time:.6f}s: {str(exc)} {tb}"
            )
        return _worker_http_error(422, str(exc))


def _parse_model_task(model_data: dict, enable_perf_logging: bool) -> dict:
    model = ModelInSchema.model_validate(model_data)
    perf_logger = getLogger("trilogy.performance")
    if enable_perf_logging:
        start_time = time.time()

    try:
        result = model_to_response(model)

        if enable_perf_logging:
            total_time = time.time() - start_time
            perf_logger.info(
                f"Model parsing - Total: {total_time:.4f}s | Model size: {len(str(model))} chars"
            )

        return result.model_dump(mode="json")
    except HTTPException as exc:
        return _http_error_payload(exc)
    except Exception as exc:
        if enable_perf_logging:
            error_time = time.time() - start_time
            perf_logger.error(
                f"Model parsing failed after {error_time:.4f}s: {str(exc)}"
            )

        return _worker_http_error(422, "Parsing error: " + str(exc))


def create_trilogy_router(enable_perf_logging: bool = False) -> APIRouter:
    """
    Create and configure the Trilogy API router with all endpoints.

    Args:
        enable_perf_logging: Whether to enable performance logging for requests

    Returns:
        Configured APIRouter instance with all Trilogy endpoints
    """
    router = APIRouter()

    @router.post("/format_query")
    async def format_query(query: QueryInSchema):
        return _run_inline_task(
            "format_query",
            _format_query_task,
            query.model_dump(mode="json"),
        )

    @router.post("/drilldown_query")
    async def drilldown_query(query: DrilldownQueryInSchema):
        return _run_inline_task(
            "drilldown_query",
            _drilldown_query_task,
            query.model_dump(mode="json"),
        )

    @router.post("/validate_query")
    async def validate_query(query: ValidateQueryInSchema):
        return _raise_if_worker_error(
            await run_aux_task(_validate_query_task, query.model_dump(mode="json"))
        )

    @router.post("/generate_queries")
    async def generate_queries(queries: MultiQueryInSchema):
        return _raise_if_worker_error(
            await run_cpu_bound(
                _generate_queries_task,
                queries.model_dump(mode="json"),
                enable_perf_logging,
            )
        )

    @router.post("/generate_query")
    async def generate_query(query: QueryInSchema):
        return _raise_if_worker_error(
            await run_cpu_bound(
                _generate_query_task,
                query.model_dump(mode="json"),
                enable_perf_logging,
            )
        )

    @router.post("/parse_model")
    async def parse_model(model: ModelInSchema):
        return _raise_if_worker_error(
            await run_cpu_bound(
                _parse_model_task,
                model.model_dump(mode="json"),
                enable_perf_logging,
            )
        )

    @router.get("/")
    async def healthcheck():
        return "healthy"

    return router
