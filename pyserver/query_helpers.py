import re
import time


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
    PersistStatement,
    Purpose,
    DataType,
    ValidateStatement,
    ShowStatement,
)
from trilogy.core.statements.execute import (
    ProcessedRawSQLStatement,
    ProcessedQueryPersist,
    ProcessedShowStatement,
    ProcessedQuery,
    ProcessedCopyStatement,
    ProcessedValidateStatement,
    PROCESSED_STATEMENT_TYPES,
)
from trilogy.core.models.core import TraitDataType, ListWrapper
from copy import deepcopy
from logging import getLogger

from env_helpers import (
    parse_env_from_full_model,
    normalize_relative_imports,
    resolve_import_path,
)


from io_models import (
    QueryInSchema,
    QueryOut,
    QueryOutColumn,
    MultiQueryInSchema,
)
from trilogy.dialect.metadata import (
    handle_processed_show_statement,
    handle_processed_validate_statement,
)
from utility import safe_percentage
from trilogy.core.validation.environment import validate_environment
from trilogy.core.internal import DEFAULT_CONCEPTS

perf_logger = getLogger("trilogy.performance")

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


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}")

# Maps Trilogy DataType → the keyword used in `parameter x <type>;` declarations
_DATATYPE_TO_TRILOGY_PARAM_TYPE: dict[DataType, str] = {
    DataType.DATE: "date",
    DataType.DATETIME: "datetime",
    DataType.TIMESTAMP: "datetime",  # Trilogy parameter keyword; both map to datetime
    DataType.INTEGER: "int",
    DataType.BIGINT: "int",
    DataType.NUMBER: "int",
    DataType.FLOAT: "float",
    DataType.NUMERIC: "float",
    DataType.BOOL: "bool",
    DataType.STRING: "string",
}

# Matches the concept address that a parameter is compared against in a filter expression.
# Handles: concept OP :param, concept BETWEEN :p1 AND :p2
_CONCEPT_PARAM_RE = re.compile(
    r"([\w.]+)\s*(?:=|>=|<=|>|<)\s*{param}"
    r"|([\w.]+)\s+between\s+[\w_]+\s+and\s+{param}"
    r"|([\w.]+)\s+between\s+{param}\s+and\s",
    re.IGNORECASE,
)


def _trilogy_type_for(value: str | int | float) -> str:
    """Infer a Trilogy parameter type from a scalar value."""
    if isinstance(value, str):
        if _DATE_RE.match(value):
            return "date"
        if _TIMESTAMP_RE.match(value):
            return "datetime"
        return "string"
    if isinstance(value, float):
        return "float"
    return "int"


def _concept_type_for_param(
    param_name: str,
    filter_strings: list[str],
    env: "Environment",
) -> str | None:
    """Return the Trilogy type that matches the concept being filtered by param_name.

    Scans each filter string for comparisons involving param_name and looks up
    the concept on the other side to determine its DataType.
    """
    pattern = re.compile(
        rf"([\w.]+)\s*(?:=|>=|<=|>|<)\s*{re.escape(param_name)}\b"
        rf"|([\w.]+)\s+between\s+[\w_]+\s+and\s+{re.escape(param_name)}\b"
        rf"|([\w.]+)\s+between\s+{re.escape(param_name)}\s+and\s",
        re.IGNORECASE,
    )
    for fs in filter_strings:
        m = pattern.search(fs)
        if m:
            concept_addr = next((g for g in m.groups() if g), None)
            if concept_addr:
                concept = env.concepts.get(concept_addr) or env.concepts.get(
                    f"local.{concept_addr}"
                )
                if concept:
                    return _DATATYPE_TO_TRILOGY_PARAM_TYPE.get(concept.datatype)


def filters_to_conditional(
    extra_filters: list[str],
    parameters: dict[str, str | int | float],
    env: Environment,
    base_filter_idx: int = 0,
) -> WhereClause | None:
    final = []
    # Build parameter declarations. Values are injected via set_parameters so they
    # never touch the parse string — no escaping needed.
    param_declarations = ""
    param_kwargs: dict[str, str | int | float] = {}
    # Build a version of extra_filters with colons stripped so the concept-type
    # lookup sees bare param names (matching what the filter will actually use).
    stripped_filters = [
        fs for fs in extra_filters
        if fs.strip()
    ]
    for key in parameters:
        stripped_filters = [fs.replace(key, key.lstrip(":")) for fs in stripped_filters]

    for key, value in parameters.items():
        # keys arrive as :paramN — strip the colon for use in Trilogy source
        name = key.lstrip(":")
        # Prefer the type derived from the concept being filtered (most accurate);
        # fall back to inference from the value string.
        param_type = _concept_type_for_param(name, stripped_filters, env) or _trilogy_type_for(value)
        param_declarations += f"\nparameter {name} {param_type};"
        # Normalize value to match the declared type — e.g. Luxon DateTime
        # serialises as a full ISO timestamp ('1992-12-20T22:19:57.462Z') but
        # set_parameters only accepts 'YYYY-MM-DD' for date parameters.
        if param_type == "date" and isinstance(value, str):
            value = _DATE_RE.match(value[:10]) and value[:10] or value
        param_kwargs[name] = value

    for idx, filter_string in enumerate(extra_filters):
        if not filter_string.strip():
            continue
        # Replace :paramN tokens in filter expressions with bare names
        for key in parameters:
            filter_string = filter_string.replace(key, key.lstrip(":"))
        final.append(f"({filter_string})")

    if not final:
        return None

    # Register parameter values on the real env so the concepts are available when
    # the actual query is generated. Parse into the same env so the WhereClause
    # references the same concept instances.
    env.set_parameters(**param_kwargs)
    final_conditions = " AND ".join(final)
    _, fparsed = parse_text(
        f"{param_declarations}\nWHERE {final_conditions} SELECT 1 as __ftest_{base_filter_idx*100+idx};",
        env,
        parse_config=PARSE_CONFIG,
    )
    return (
        fparsed[-1].where_clause if isinstance(fparsed[-1], SelectStatement) else None
    )


def generate_single_query(
    query: str,
    env: Environment,
    dialect: BaseDialect,
    extra_filters: list[str] | None = None,
    parameters: dict[str, str | int | float] | None = None,
    enable_performance_logging: bool = True,
    extra_conditional: WhereClause | None = None,
    base_filter_idx: int = 0,
    cleanup_concepts: bool = False,
) -> tuple[
    PROCESSED_STATEMENT_TYPES | None,
    list[QueryOutColumn],
    list[dict] | None,
    int,
]:
    start_time = time.time()

    # Parse the query
    parse_start = time.time()

    # this is pretty hacky
    # TODO: better job
    if cleanup_concepts:
        pre_concepts = {k: v for k, v in env.concepts.items() if v.name in query}
    else:
        pre_concepts = {}
    env, parsed = parse_text(safe_format_query(query), env, parse_config=PARSE_CONFIG)
    parse_time = time.time() - parse_start
    default_return: list[QueryOutColumn] = []
    default_values: list[dict] | None = None
    select_count = sum(
        1
        for s in parsed
        if isinstance(s, (SelectStatement, MultiSelectStatement, PersistStatement))
    )
    if not parsed:
        if enable_performance_logging:
            perf_logger.debug(
                f"No parsed statements (empty query) - Parse time: {parse_time:.4f}s"
            )
        return None, default_return, default_values, 0

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
        return (
            ProcessedRawSQLStatement(text=final.text),
            default_return,
            default_values,
            select_count,
        )
    elif isinstance(final, ShowStatement):
        base = dialect.generate_queries(env, [final])[-1]
        assert isinstance(base, ProcessedShowStatement)
        results = handle_processed_show_statement(
            base,
            [
                dialect.compile_statement(x)
                for x in base.output_values
                if isinstance(
                    x, (ProcessedQuery, ProcessedQueryPersist, ProcessedCopyStatement)
                )
            ],
        )
        return (
            base,
            [
                QueryOutColumn(name=x, datatype=DataType.STRING, purpose=Purpose.KEY)
                for x in results.columns
            ],
            results.as_dict(),
            select_count,
        )
    elif isinstance(final, (ValidateStatement)):
        base = dialect.generate_queries(env, [final])[-1]
        assert isinstance(base, ProcessedValidateStatement)
        validate_results = handle_processed_validate_statement(
            base,
            dialect,
            validate_environment_func=lambda scope, targets: validate_environment(
                env, scope=scope, targets=targets, generate_only=True
            ),
        )
        return (
            base,
            (
                [
                    QueryOutColumn(
                        name=x, datatype=DataType.STRING, purpose=Purpose.KEY
                    )
                    for x in validate_results.columns
                ]
                if validate_results
                else []
            ),
            validate_results.as_dict() if validate_results else None,
            select_count,
        )
    if not isinstance(final, (SelectStatement, MultiSelectStatement, PersistStatement)):
        columns: list[QueryOutColumn] = []
        if enable_performance_logging:
            total_time = time.time() - start_time
            perf_logger.debug(
                f"Non-query generation - Total: {total_time:.4f}s | "
                f"Parse: {parse_time:.4f}s | "
            )
        return None, columns, None, select_count
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
            keys=list(env.concepts[x.address].keys or []) or None,
        )
        for x in final_select.output_components
    ]
    col_time = time.time() - col_start

    # Set limits and process filters
    limit_filter_start = time.time()

    candidates = (
        final_select.selects
        if isinstance(final_select, MultiSelectStatement)
        else [final_select]
    )

    if extra_filters:
        conditional = filters_to_conditional(
            extra_filters, variables, env, base_filter_idx=base_filter_idx
        )
        for candidate in candidates:
            if not candidate.where_clause:
                candidate.where_clause = conditional
            elif conditional:
                candidate.where_clause.conditional = Conditional(
                    left=Parenthetical(content=candidate.where_clause.conditional),
                    right=Parenthetical(content=conditional.conditional),
                    operator=BooleanOperator.AND,
                )
    if extra_conditional:
        for candidate in candidates:
            if not candidate.where_clause:
                candidate.where_clause = extra_conditional
            else:
                candidate.where_clause.conditional = Conditional(
                    left=Parenthetical(content=candidate.where_clause.conditional),
                    right=Parenthetical(content=extra_conditional.conditional),
                    operator=BooleanOperator.AND,
                )

    limit_filter_time = time.time() - limit_filter_start

    # Generate the final query
    gen_start = time.time()
    output_statement = dialect.generate_queries(env, [final])[-1]
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
    if cleanup_concepts:
        for k in final_select.locally_derived:
            perf_logger.info(f"Cleaning up concept: {k}")
            env.remove_concept(k)
            if k in pre_concepts:
                env.add_concept(pre_concepts[k], force=True)
                # env.concepts[k] = pre_concepts[k]
    return output_statement, columns, default_values, select_count


def generate_query_core(
    query: QueryInSchema,
    dialect: BaseDialect,
    enable_performance_logging: bool = True,
) -> tuple[
    PROCESSED_STATEMENT_TYPES | None,
    list[QueryOutColumn],
    list[dict] | None,
    int,
]:
    if enable_performance_logging:
        start_time = time.time()
        env_start = time.time()

    # Environment setup
    env = parse_env_from_full_model(query.full_model.sources)

    if enable_performance_logging:
        env_time = time.time() - env_start
        import_start = time.time()

    normalized_query = normalize_relative_imports(query.query, query.current_filename)

    # Process imports
    import_strings = []
    for imp in query.imports:
        normalized_import_name = resolve_import_path(imp.name, query.current_filename)
        if imp.alias:
            imp_string = f"import {normalized_import_name} as {imp.alias};"
        else:
            imp_string = f"import {normalized_import_name};"
        import_strings.append(imp_string)

    if import_strings:
        full_imp_string = "\n".join(import_strings)
        parse_text(full_imp_string, env, parse_config=PARSE_CONFIG)

    if enable_performance_logging:
        import_time = time.time() - import_start
        gen_start = time.time()

    # Generate query
    target, columns, results, select_count = generate_single_query(
        normalized_query, env, dialect, query.extra_filters, query.parameters
    )

    if enable_performance_logging:
        gen_time = time.time() - gen_start
        total_time = time.time() - start_time
        perf_logger.info(
            f"Query core timing - Total: {total_time:.4f}s | "
            f"Env setup: {env_time:.4f}s ({safe_percentage(env_time, total_time):.1f}%) | "
            f"Imports: {import_time:.4f}s ({safe_percentage(import_time,total_time):.1f}%) | "
            f"Generation: {gen_time:.4f}s ({safe_percentage(gen_time,total_time):.1f}%)"
        )

    return target, columns, results, select_count


def generate_multi_query_core(
    query: MultiQueryInSchema,
    dialect: BaseDialect,
    enable_performance_logging: bool = True,
    cleanup_concepts: bool = True,
) -> list[
    tuple[
        str | None,
        PROCESSED_STATEMENT_TYPES | Exception | None,
        list[QueryOutColumn],
        list[dict] | None,
    ],
]:
    if enable_performance_logging:
        start_time = time.time()

    if enable_performance_logging:
        env_time = time.time() - start_time
        import_start = time.time()

    extra_filters = query.extra_filters
    variables = query.parameters or {}

    def build_env():
        benv = parse_env_from_full_model(query.full_model.sources)
        imports = []
        for imp in query.imports:
            if imp.alias:
                imports.append(f"import {imp.name} as {imp.alias};")
            else:
                imports.append(f"import {imp.name};")
        imp_string = "\n".join(imports)
        parse_text(imp_string, benv, parse_config=PARSE_CONFIG)
        conditional = None
        if extra_filters:
            conditional = filters_to_conditional(extra_filters, variables, benv)
        return benv, conditional

    env, conditional = build_env()

    if enable_performance_logging:
        import_time = time.time() - import_start
        queries_start = time.time()

    all: list[
        tuple[
            str | None,
            PROCESSED_STATEMENT_TYPES | Exception | None,
            list[QueryOutColumn],
            list[dict] | None,
        ]
    ] = []
    default_return: list[QueryOutColumn] = []

    for idx, subquery in enumerate(query.queries):
        try:
            generated, columns, values, _ = generate_single_query(
                subquery.query,
                env,
                dialect,
                extra_filters=subquery.extra_filters,
                parameters=subquery.parameters,
                enable_performance_logging=enable_performance_logging,
                extra_conditional=conditional,
                base_filter_idx=idx,
                cleanup_concepts=cleanup_concepts,
            )
            all.append((subquery.label, generated, columns, values))
        except Exception as e:
            perf_logger.error(f"Error generating query '{subquery.query}': {e}")
            # log full traceback
            import traceback

            traceback_str = traceback.format_exc()
            perf_logger.error(traceback_str)
            all.append((subquery.label, e, default_return, None))
            # rebuild env, as we assume that cleanup might not have happened

            env, conditional = build_env()

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
    target,
    columns,
    results: list[dict] | None,
    label: str | None,
    dialect: BaseDialect,
    enable_performance_logging: bool = True,
    select_count: int | None = None,
) -> QueryOut:
    if enable_performance_logging:
        start_time = time.time()

    if not target:
        if enable_performance_logging:
            perf_logger.debug(
                f"Empty output generation: {time.time() - start_time:.4f}s"
            )
        return QueryOut(
            generated_sql=None, columns=columns, label=label, select_count=select_count
        )
    if isinstance(target, Exception):
        return QueryOut(
            generated_sql=None,
            columns=[],
            error=str(target),
            label=label,
            select_count=select_count,
        )
    elif (
        isinstance(target, ProcessedShowStatement)
        and DEFAULT_CONCEPTS["query_text"].address in target.output_columns
    ):
        assert results is not None
        return QueryOut(
            generated_sql=results[0][DEFAULT_CONCEPTS["query_text"].safe_address],
            generated_output=results,
            columns=columns,
            label=label,
            select_count=select_count,
        )
    else:
        compile_start = time.time()
        sql, bound_params = dialect.compile_statement_with_params(target)
        compile_time = time.time() - compile_start
        # Serialize params: scalars pass through, ListWrapper exposes .data as a plain list
        serializable_params: dict[str, str | int | float | list] | None = None
        if bound_params:
            serializable_params = {
                k: list(v) if isinstance(v, ListWrapper) else v
                for k, v in bound_params.items()
                if isinstance(v, (str, int, float, ListWrapper))
            } or None

        output = QueryOut(
            generated_sql=sql,
            generated_output=results,
            columns=columns,
            label=label,
            select_count=select_count,
            parameters=serializable_params or None,
        )

        if enable_performance_logging:
            total_time = time.time() - start_time
            perf_logger.debug(
                f"SQL output generation - Total: {total_time:.4f}s | "
                f"SQL Compilation: {compile_time:.4f}s ({safe_percentage(compile_time,total_time):.1f}%) | "
                f"SQL length: {len(sql)} chars"
            )

        return output


# def pipeline_commands():
