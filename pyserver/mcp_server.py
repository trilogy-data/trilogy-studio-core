from mcp.server.fastmcp import FastMCP
from dataclasses import dataclass
from trilogy import Dialects, Environment
from trilogy.authoring import Concept
from trilogy.core.models.core import (
    TraitDataType,
    DataType,
    ArrayType,
    StructType,
    MapType,
    NumericType,
    DataTyped,
    StructComponent,
)
import httpx
from trilogy.core.models.environment import DictImportResolver, EnvironmentOptions
from trilogy.core.statements.execute import (
    ProcessedRawSQLStatement,
    ProcessedValidateStatement,
    ProcessedQuery,
    ProcessedStaticValueOutput,
    ProcessedShowStatement,
    PROCESSED_STATEMENT_TYPES,
)
from functools import wraps


# Simple in-memory cache for HTTP requests
_http_cache: dict[str, str] = {}


def memoize_http(func):
    """Decorator to memoize HTTP requests based on URL"""

    @wraps(func)
    def wrapper(*args, **kwargs):
        # Create a cache key from the function name and arguments
        cache_key = (func.__name__, args, tuple(sorted(kwargs.items())))

        if cache_key in _http_cache:
            return _http_cache[cache_key]

        result = func(*args, **kwargs)
        _http_cache[cache_key] = result
        return result

    return wrapper


def clear_http_cache():
    """Clear all memoized HTTP responses"""
    global _http_cache
    _http_cache.clear()


@dataclass
class QueryHeader:
    name: str
    datatype: str


@dataclass
class QueryResult:
    headers: list[QueryHeader]
    results: list[dict]


@dataclass
class ModelConfig:
    description: str
    engine: str
    filename: str
    name: str
    tags: list[str] | None = None


@dataclass
class ModelSourceReponse:
    startup_sql: list[str]
    startup_trilogy: list[str]
    entrypoint: str
    files: dict[str, str]


# Create an MCP server
mcp = FastMCP(
    "Trilogy Language Tools",
    "Use to fetch Trilogy models and run Trilogy Queries. Trilogy is a SQL-like language for data access and transformation.",
)


CONNECTIONS = {"DEFAULT_DUCKDB": Dialects.DUCK_DB.default_executor()}


def datatype_to_str_datatype(
    datatype: (
        TraitDataType
        | DataType
        | ArrayType
        | StructType
        | MapType
        | NumericType
        | DataTyped
        | StructComponent
    ),
) -> str:
    """Convert a TraitDataType to a string representation"""
    if isinstance(datatype, TraitDataType):
        traits = ",".join(datatype.traits)
        return f"{datatype_to_str_datatype(datatype.data_type)}<{traits}>"
    if isinstance(datatype, ArrayType):
        return f"ARRAY<{datatype_to_str_datatype(datatype.value_data_type)}>"
    if isinstance(datatype, StructType):
        fields = ", ".join(
            f"{name}:{datatype_to_str_datatype(datatype.fields[key])}"
            for key, name in enumerate(datatype.fields_map.keys())
        )
        return f"STRUCT<{fields}>"
    if isinstance(datatype, MapType):
        return f"MAP<{datatype_to_str_datatype(datatype.key_data_type)}, {datatype_to_str_datatype(datatype.value_data_type)}>"
    if isinstance(datatype, NumericType):
        return f"Numeric<{datatype.precision},{datatype.scale}>"
    if isinstance(datatype, DataTyped):
        return datatype_to_str_datatype(datatype.output_datatype)
    if isinstance(datatype, StructComponent):
        return f"{datatype.name}:{datatype_to_str_datatype(datatype.type)}>"
    return str(datatype.name)


def concept_to_str_datatype(concept: Concept) -> str:
    return datatype_to_str_datatype(concept.datatype)


def process_concept(concept: Concept) -> dict:
    return {
        "name": concept.address,
        "datatype": concept_to_str_datatype(concept),
        "purpose": concept.purpose,
        "description": concept.metadata.description,
    }


def is_visible(concept: Concept) -> bool:
    return not concept.name.startswith("_")


@memoize_http
def get_public_models() -> list[ModelConfig]:
    models = httpx.get(
        "https://trilogy-data.github.io/trilogy-public-models/studio/index.json"
    ).json()
    return [ModelConfig(**model) for model in models.get("files", [])]


@memoize_http
def get_model_files(root_file: str) -> ModelSourceReponse:
    files = httpx.get(
        f"https://trilogy-data.github.io/trilogy-public-models/studio/{root_file}"
    ).json()
    mapping = {}
    startup_sql = []
    startup_trilogy = []
    entrypoint = ""
    for file in files.get("components", []):

        purpose = file.get("purpose", "unknown")
        if purpose in ["source"]:
            mapping[file["alias"]] = _get_file_content(file["url"])
        elif purpose == "setup":
            language = file.get("type", "sql")
            content = _get_file_content(file["url"])
            if language == "sql":
                startup_sql.append(content)
            elif language == "trilogy":
                startup_trilogy.append(content)
        elif purpose == "entrypoint":
            entrypoint = _get_file_content(file["url"])
    return ModelSourceReponse(
        startup_sql=startup_sql,
        startup_trilogy=startup_trilogy,
        entrypoint=entrypoint,
        files=mapping,
    )


@memoize_http
def _get_file_content(url: str) -> str:
    """Helper function to get file content with memoization"""
    return httpx.get(url).text


def create_model_connection(name: str, model_name: str):
    models = get_public_models()
    model = next((m for m in models if m.name == model_name), None)
    if not model:
        return f"Model '{model_name}' not found."

    env = Environment()
    resolved = get_model_files(model.filename)
    resolver = DictImportResolver(content=resolved.files)
    env = Environment(config=EnvironmentOptions(import_resolver=resolver))
    engine = Dialects(model.engine).default_executor(environment=env)

    for x in resolved.startup_sql:
        engine.execute_raw_sql(x)
    engine.execute_query(resolved.entrypoint)
    for x in resolved.startup_trilogy:
        engine.execute_text(x)
    CONNECTIONS[name] = engine
    return engine


@mcp.resource("db://connections")
def available_connections() -> list[str]:
    """List available connections"""
    return list(CONNECTIONS.keys())


@mcp.resource("docs://trilogy/syntax")
def get_syntax_docs() -> str:
    """Get the syntax documentation"""
    return """
- No FROM, JOIN, GROUP BY, SUB SELECTS, DISTINCT, UNION, or SELECT *.
- All fields exist in a global namespace; field paths look like `order.product.id`. Always use the full path. NEVER include a from clause.
- If a field has a grain defined, and that grain is not in the query output, aggregate it to get desired result. 
- If a field has a 'alias_for' defined, it is shorthand for that calculation. Use the field name instead of the calculation in your query to be concise. 
- Newly created fields at the output of the select must be aliased with as (e.g. `sum(births) as all_births`). 
- Aliases cannot happen inside calculations or in the where/having/order clause. Never alias fields with existing names. 'sum(revenue) as total_revenue' is valid, but '(sum(births) as total_revenue) +1 as revenue_plus_one' is not.
- Implicit grouping: NEVER include a group by clause. Grouping is by non-aggregated fields in the SELECT clause.
- You can dynamically group inline to get groups at different grains - ex:  `sum(metric) by dim1, dim2 as sum_by_dim1_dm2` for alternate grouping.
- Count must specify a field (no `count(*)`) Counts are automatically deduplicated. Do not ever use DISTINCT.
- Since there are no underlying tables, sum/count of a constant should always specify a grain field (e.g. `sum(1) by x as count`). 
- Aggregates in SELECT must be filtered via HAVING. Use WHERE for pre-aggregation filters.
- Use `field ? condition` for inline filters (e.g. `sum(x ? x > 0)`).
- Always use a reasonable `LIMIT` for final queries unless the request is for a time series or line chart.
- Window functions: `rank entity [optional over group] by field desc` (e.g. `rank name over state by sum(births) desc as top_name`).
- For lag/lead, offset is first: lag/lead offset field order by expr asc/desc.
- For lag/lead with a window clause: lag/lead offset field by window_clause order by expr asc/desc.
- Use `::type` casting, e.g., `"2020-01-01"::date`.
- Comments use `#` only, per line.
- Two example queries: "where year between 1940 and 1950
select
    name,
    state,
    sum(births) AS all_births,
    sum(births ? state = 'VT') AS vermont_births,
    rank name over state by all_births desc AS state_rank,
    rank name by sum(births) by name desc AS all_rank
having 
    all_rank<11
    and state = 'ID'
order by 
all_rank asc
limit 5;", "where dep_time between '2002-01-01'::datetime and '2010-01-31'::datetime
select
    carrier.name,
    count(id2) AS total_flights,
    total_flights / date_diff(min(dep_time.date), max(dep_time.date), DAY) AS average_daily_flights
order by 
total_flights desc;
"
  """


@mcp.tool()
def list_public_models() -> list[ModelConfig]:
    return get_public_models()


@mcp.tool()
def list_dialects() -> list[str]:
    """List available dialects"""
    return [dialect.name for dialect in [Dialects.BIGQUERY, Dialects.DUCK_DB]]


@mcp.tool()
def create_connection(name: str, model_name: str) -> str:
    """Create a new connection"""
    try:
        create_model_connection(name, model_name)
    except Exception as e:
        return f"Error creating connection '{name}': {e}"
    return f"Connection '{name}' created successfully."


@mcp.tool()
def list_connection_fields(name: str) -> list[dict]:
    """List datasets in a connection"""
    if name not in CONNECTIONS:
        raise ValueError(f"Connection '{name}' does not exist.")
    executor = CONNECTIONS[name]
    return [
        process_concept(c)
        for _, c in executor.environment.concepts.items()
        if is_visible(c)
    ]


@mcp.tool()
def active_connections() -> list[str]:
    """List active connections"""
    return list(CONNECTIONS.keys())


@mcp.tool()
def run_trilogy_query(command: str, connection: str) -> QueryResult:
    """Run a Trilogy query on the specified connection. Use the syntax resource to understand appropriate format."""
    executor = CONNECTIONS[connection]
    parsed = executor.parse_text(command)[-1]
    result = executor.execute_query(parsed)
    if not result:
        return QueryResult(headers=[], results=[])
    if isinstance(parsed, ProcessedRawSQLStatement):
        headers = [
            QueryHeader(name=col, datatype=DataType.UNKNOWN.name)
            for col in result.keys()
        ]
    elif isinstance(parsed, ProcessedValidateStatement):
        headers = [
            QueryHeader(name=col, datatype=DataType.UNKNOWN.name)
            for col in result.keys()
        ]
    elif isinstance(
        parsed,
        (
            ProcessedQuery,
            ProcessedStaticValueOutput,
            ProcessedShowStatement,
        ),
    ):
        headers = [
            QueryHeader(
                name=col.name,
                datatype=concept_to_str_datatype(
                    executor.environment.concepts[col.address]
                ),
            )
            for col in parsed.output_columns
        ]
    elif isinstance(parsed, (ProcessedValidateStatement, PROCESSED_STATEMENT_TYPES)):
        headers = ([],)
    else:
        headers = [
            QueryHeader(
                name=col.name,
                datatype=concept_to_str_datatype(
                    executor.environment.concepts[col.address]
                ),
            )
            for col in parsed.output_columns
        ]
    if not result:
        values = []
    else:
        values = result.fetchall()
    return QueryResult(
        headers=headers,
        results=[{"_index": idx, **dict(row)} for idx, row in enumerate(values)],
    )


@mcp.tool()
def clear_cache() -> str:
    """Clear the HTTP request cache"""
    clear_http_cache()
    return "HTTP cache cleared successfully."
