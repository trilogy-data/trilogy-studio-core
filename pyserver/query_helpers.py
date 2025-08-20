import time

from dataclasses import dataclass

from uvicorn.config import LOGGING_CONFIG


from trilogy.constants import Parsing
from trilogy import Environment
from trilogy.parser import parse_text
from trilogy.dialect.base import BaseDialect
from trilogy.authoring import (
    Concept,
    SelectStatement,
    MultiSelectStatement,
    RawSQLStatement,
    DEFAULT_NAMESPACE,
    Parenthetical,
    Conditional,
    BooleanOperator,
    WhereClause,
    PersistStatement
)
from trilogy.core.statements.execute import (
    ProcessedRawSQLStatement,
    ProcessedQueryPersist,
    ProcessedShowStatement,
    ProcessedQuery,
)
from trilogy.core.models.core import TraitDataType
from logging import getLogger

from env_helpers import parse_env_from_full_model
from trilogy import __version__


from io_models import (
    QueryInSchema,
    QueryOut,
    QueryOutColumn,
    MultiQueryInSchema,
)

from utility import safe_percentage


perf_logger = getLogger("trilogy.performance")
STATEMENT_LIMIT = 100_00

PARSE_CONFIG = Parsing(strict_name_shadow_enforcement=True)


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


def get_variable_string_prefix(variables: dict[str, str | int | float]) -> str:
    variable_prefix = ""
    for key, variable in variables.items():
        if isinstance(variable, str):
            if "'''" in variable:
                raise ValueError("cannot safely parse strings with triple quotes")
            variable_prefix += f"\n const {key[1:]} <- '''{variable}''';"
        else:
            variable_prefix += f"\n const {key[1:]} <- {variable};"
    return variable_prefix


def filters_to_conditional(
    extra_filters: list[str], parameters: dict[str, str | int | float], env: Environment, base_filter_idx: int = 0
) -> WhereClause | None:
    base = ""
    variable_prefix = get_variable_string_prefix(parameters)
    final = []
    for idx, filter_string in enumerate(extra_filters):
        if not filter_string.strip():
            continue
        base = "" + variable_prefix
        for v in parameters:
            # remove the prefix
            filter_string = filter_string.replace(v[0], v[0][1:])
        final.append(f"({filter_string})")
    if not final:
        return None
    final_conditions = " AND ".join(final)
    _, fparsed = parse_text(
        f"{base}\nWHERE {final_conditions} SELECT 1 as __ftest_{base_filter_idx*100+idx};",
        env,
        parse_config=PARSE_CONFIG,
    )
    return fparsed[-1].where_clause if fparsed else None


def generate_single_query(
    query: str,
    env: Environment,
    dialect: BaseDialect,
    extra_filters: list[str] | None = None,
    parameters: dict[str, str | int | float] | None = None,
    enable_performance_logging: bool = True,
    extra_conditional: WhereClause | None = None,
    base_filter_idx: int = 0,
):
    start_time = time.time()

    # Parse the query
    parse_start = time.time()
    _, parsed = parse_text(safe_format_query(query), env, parse_config=PARSE_CONFIG)
    parse_time = time.time() - parse_start

    if not parsed:
        if enable_performance_logging:
            perf_logger.debug(
                f"No parsed statements (empty query) - Parse time: {parse_time:.4f}s"
            )
        return None, []

    final = parsed[-1]
    variables = parameters or {}

    # Handle different statement types
    if isinstance(final, RawSQLStatement):
        if enable_performance_logging:
            total_time = time.time() - start_time
            perf_logger.debug(
                f"Raw SQL generation - Total: {total_time:.4f}s | "
                f"Parse: {parse_time:.4f}s | "
            )
        return ProcessedRawSQLStatement(text=final.text), []

    if not isinstance(final, (SelectStatement, MultiSelectStatement, PersistStatement)):
        columns: list[QueryOutColumn] = []
        if enable_performance_logging:
            total_time = time.time() - start_time
            perf_logger.debug(
                f"Non-query generation - Total: {total_time:.4f}s | "
                f"Parse: {parse_time:.4f}s | "
            )
        return None, columns
    final_select = final.select if isinstance(final, PersistStatement) else final
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
        for x in final_select.output_components
    ]
    col_time = time.time() - col_start

    # Set limits and process filters
    limit_filter_start = time.time()
    if not final_select.limit:
        final_select.limit = STATEMENT_LIMIT

    if extra_filters:
        conditional = filters_to_conditional(extra_filters, variables, env, base_filter_idx=base_filter_idx)
        if not final_select.where_clause:
            final_select.where_clause = conditional
        else:
            final_select.where_clause.conditional = Conditional(
                left=Parenthetical(content=final_select.where_clause.conditional),
                right=Parenthetical(content=conditional.conditional),
                operator=BooleanOperator.AND,
            )
    if extra_conditional:
        if not final_select.where_clause:
            final_select.where_clause = extra_conditional
        else:
            final_select.where_clause.conditional = Conditional(
                left=Parenthetical(content=final_select.where_clause.conditional),
                right=Parenthetical(content=extra_conditional.conditional),
                operator=BooleanOperator.AND,
            )

    limit_filter_time = time.time() - limit_filter_start

    # Generate the final query
    gen_start = time.time()
    result = dialect.generate_queries(env, [final])[-1]
    gen_time = time.time() - gen_start

    if enable_performance_logging:
        total_time = time.time() - start_time
        perf_logger.info(
            f"Query generation details - Total: {total_time:.4f}s | "
            f"Parse: {parse_time:.4f}s ({safe_percentage(parse_time, total_time):.1f}%) | "
            f"Columns: {col_time:.4f}s ({safe_percentage(col_time, total_time):.1f}%) | "
            f"Filters: {limit_filter_time:.4f}s ({safe_percentage(limit_filter_time, total_time):.1f}%) | "
            f"Generation: {gen_time:.4f}s ({safe_percentage(gen_time, total_time):.1f}%)"
        )

    return result, columns


def generate_query_core(
    query: QueryInSchema,
    dialect: BaseDialect,
    enable_performance_logging: bool = True,
) -> tuple[
    ProcessedQuery
    | ProcessedQueryPersist
    | ProcessedShowStatement
    | ProcessedRawSQLStatement
    | None,
    list[QueryOutColumn],
]:
    if enable_performance_logging:
        start_time = time.time()

        # Time environment setup
        env_start = time.time()
        env = parse_env_from_full_model(query.full_model.sources)
        env_time = time.time() - env_start

        # Time imports processing
        import_start = time.time()
        import_strings = []
        for imp in query.imports:
            if imp.alias:
                imp_string = f"import {imp.name} as {imp.alias};"
            else:
                imp_string = f"import {imp.name};"
            import_strings.append(imp_string)
        if import_strings:
            full_imp_string = "\n".join(import_strings)
            parse_text(full_imp_string, env, parse_config=PARSE_CONFIG)
        import_time = time.time() - import_start

        # Time query generation
        gen_start = time.time()
        result = generate_single_query(
            query.query, env, dialect, query.extra_filters, query.parameters
        )
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
        import_strings = []
        for imp in query.imports:
            if imp.alias:
                imp_string = f"import {imp.name} as {imp.alias};"
            else:
                imp_string = f"import {imp.name};"
            import_strings.append(imp_string)
        if import_strings:
            full_imp_string = "\n".join(import_strings)
            parse_text(full_imp_string, env, parse_config=PARSE_CONFIG)
        return generate_single_query(
            query.query, env, dialect, query.extra_filters, query.parameters
        )


def generate_multi_query_core(
    query: MultiQueryInSchema,
    dialect: BaseDialect,
    enable_performance_logging: bool = True,
) -> list[
    tuple[
        ProcessedQuery
        | ProcessedQueryPersist
        | ProcessedShowStatement
        | ProcessedRawSQLStatement
        | None,
        list[QueryOutColumn],
    ],
]:
    if enable_performance_logging:
        start_time = time.time()

    env = parse_env_from_full_model(query.full_model.sources)

    if enable_performance_logging:
        env_time = time.time() - start_time
        import_start = time.time()

    for imp in query.imports:
        if imp.alias:
            imp_string = f"import {imp.name} as {imp.alias};"
        else:
            imp_string = f"import {imp.name};"
        parse_text(imp_string, env, parse_config=PARSE_CONFIG)

    if enable_performance_logging:
        import_time = time.time() - import_start
        queries_start = time.time()

    all: list[
        tuple[
            ProcessedQuery
            | ProcessedQueryPersist
            | ProcessedShowStatement
            | ProcessedRawSQLStatement
            | None,
            list[QueryOutColumn],
        ]
    ] = []
    extra_filters = query.extra_filters
    variables = query.parameters or {}
    conditional = None
    if extra_filters:
        conditional = filters_to_conditional(extra_filters, variables, env)
    for idx, subquery in enumerate(query.queries):
        try:
            generated, columns = generate_single_query(
                    subquery.query, env, dialect, extra_filters=subquery.extra_filters, parameters=subquery.parameters, enable_performance_logging=enable_performance_logging, extra_conditional=conditional,
                    base_filter_idx = idx
                )
            all.append((generated, columns))
        except Exception as e:
            perf_logger.error(f"Error generating query '{subquery.query}': {e}")
            all.append((e, []))

    if enable_performance_logging:
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


def query_to_output(
    target, columns, dialect: BaseDialect, enable_performance_logging: bool = True
) -> QueryOut:
    if enable_performance_logging:
        start_time = time.time()

    if not target:
        if enable_performance_logging:
            perf_logger.debug(
                f"Empty output generation: {time.time() - start_time:.4f}s"
            )
        return QueryOut(generated_sql=None, columns=columns)
    if isinstance(target, Exception):
        return {
            "generated_sql": None,
            "columns": [],
            "error": str(target),
        }
    elif isinstance(target, RawSQLStatement):
        output = QueryOut(generated_sql=target.text, columns=columns)
        if enable_performance_logging:
            perf_logger.debug(
                f"Raw SQL output generation: {time.time() - start_time:.4f}s"
            )
        return output
    else:
        compile_start = time.time()
        sql = dialect.compile_statement(target)
        compile_time = time.time() - compile_start

        output = QueryOut(generated_sql=sql, columns=columns)

        if enable_performance_logging:
            total_time = time.time() - start_time
            perf_logger.debug(
                f"SQL output generation - Total: {total_time:.4f}s | "
                f"SQL Compilation: {compile_time:.4f}s ({safe_percentage(compile_time,total_time):.1f}%) | "
                f"SQL length: {len(sql)} chars"
            )

        return output


# def pipeline_commands():
