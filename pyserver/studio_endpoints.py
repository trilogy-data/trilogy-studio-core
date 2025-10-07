"""
Reusable Trilogy API endpoints module.
Can be imported and attached to any FastAPI application.
"""

import time
import traceback
from logging import getLogger
from fastapi import APIRouter, HTTPException
from trilogy.render import get_dialect_generator
from trilogy.parser import parse_text
from trilogy.parsing.render import Renderer
from trilogy.core.exceptions import InvalidSyntaxException

from env_helpers import parse_env_from_full_model, model_to_response
from io_models import (
    QueryInSchema,
    FormatQueryOutSchema,
    ValidateQueryInSchema,
    ValidateItem,
    MultiQueryInSchema,
    MultiQueryOutSchema,
    ModelInSchema,
    Model,
)
from diagnostics import get_diagnostics
from utility import safe_percentage
from query_helpers import (
    generate_multi_query_core,
    generate_query_core,
    query_to_output,
    safe_format_query,
    PARSE_CONFIG,
)


def create_trilogy_router(enable_perf_logging: bool = False) -> APIRouter:
    """
    Create and configure the Trilogy API router with all endpoints.
    
    Args:
        enable_perf_logging: Whether to enable performance logging for requests
        
    Returns:
        Configured APIRouter instance with all Trilogy endpoints
    """
    router = APIRouter()
    
    # Set up logger
    perf_logger = getLogger("trilogy.performance")

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
        return FormatQueryOutSchema(text=renderer.render_statement_string(parsed))

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
        if enable_perf_logging:
            start_time = time.time()

        try:
            dialect = get_dialect_generator(queries.dialect)

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

            return result
        except Exception as e:
            if enable_perf_logging:
                error_time = time.time() - start_time
                perf_logger.error(
                    f"Multi-query generation failed after {error_time:.4f}s: {str(e)}"
                )

            raise HTTPException(status_code=422, detail="Parsing error: " + str(e))

    @router.post("/generate_query")
    def generate_query(query: QueryInSchema):
        if enable_perf_logging:
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
            target, columns, results = generate_query_core(
                query, dialect, enable_perf_logging
            )
            core_time = time.perf_counter() - core_start

            # Time the output formatting
            output_start = time.perf_counter()
            result = query_to_output(
                target, columns, results, "default", dialect, enable_perf_logging
            )
            output_time = time.perf_counter() - output_start

            if enable_perf_logging:
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
            if enable_perf_logging:
                error_time = time.perf_counter() - start_time
                perf_logger.error(f"Syntax error in query: {error_time:.6f}s: {str(e)}")
            raise HTTPException(status_code=422, detail=e.args[0])
        except Exception as e:
            if enable_perf_logging:
                error_time = time.perf_counter() - start_time
                # traceback is
                tb = traceback.format_exc()
                perf_logger.error(
                    f"Query generation failed after {error_time:.6f}s: {str(e)} {tb}"
                )
            raise HTTPException(status_code=422, detail=str(e))

    @router.post("/parse_model")
    def parse_model(model: ModelInSchema) -> Model:
        if enable_perf_logging:
            start_time = time.time()

        try:
            result = model_to_response(model)

            if enable_perf_logging:
                total_time = time.time() - start_time
                perf_logger.info(
                    f"Model parsing - Total: {total_time:.4f}s | Model size: {len(str(model))} chars"
                )

            return result

        except Exception as e:
            if enable_perf_logging:
                error_time = time.time() - start_time
                perf_logger.error(f"Model parsing failed after {error_time:.4f}s: {str(e)}")

            raise HTTPException(status_code=422, detail="Parsing error: " + str(e))

    @router.get("/")
    async def healthcheck():
        return "healthy"

    return router