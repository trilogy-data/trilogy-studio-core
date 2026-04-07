from trilogy import Environment
from trilogy.authoring import BooleanOperator, Conditional, Parenthetical
from trilogy.constants import Parsing
from trilogy.dialect.duckdb import DuckDBDialect
from trilogy.parser import parse_text
from trilogy.parsing.render import Renderer

PARSE_CONFIG = Parsing(strict_name_shadow_enforcement=True)


MINIMAL_MODEL = """
key tree_id string;
key species_name string;
key city string;
property species_name.color string;

datasource tree_info (
    tree_id:tree_id,
    city:city,
    species_name:species_name,
)
grain (tree_id)
address full_tree_info;

partial datasource boston_tree_info (
    tree_id,
    city,
    species_name,
)
grain (tree_id)
complete where city = 'USBOS'
address usbos_tree_info;

datasource tree_enrichment (
    species_name:species_name,
    color:color,
)
grain (species_name)
address tree_enrichment;
"""


INLINE_QUERY = (
    "SELECT color, count(tree_id) as tree_count "
    "WHERE color IS NOT NULL AND city = 'USBOS' "
    "ORDER BY tree_count DESC;"
)


BASE_QUERY = (
    "SELECT color, count(tree_id) as tree_count "
    "WHERE color IS NOT NULL "
    "ORDER BY tree_count DESC;"
)


FILTER_QUERY = "WHERE city = 'USBOS' SELECT 1 as __ftest;"


def _compile_sql(statement) -> str:
    dialect = DuckDBDialect()
    return dialect.compile_statement(
        dialect.generate_queries(statement[0], [statement[1]])[-1]
    )


def _parse_query(query_text: str):
    env = Environment()
    env, parsed = parse_text(
        MINIMAL_MODEL + "\n" + query_text,
        env,
        parse_config=PARSE_CONFIG,
    )
    return env, parsed[-1]


def build_appended_filter_statement():
    env, statement = _parse_query(BASE_QUERY)
    _, filter_parsed = parse_text(FILTER_QUERY, env, parse_config=PARSE_CONFIG)
    where_clause = filter_parsed[-1].where_clause
    assert statement.where_clause is not None
    assert where_clause is not None
    statement.where_clause.conditional = Conditional(
        left=Parenthetical(content=statement.where_clause.conditional),
        right=Parenthetical(content=where_clause.conditional),
        operator=BooleanOperator.AND,
    )
    return env, statement


def render_appended_filter_query() -> str:
    _, statement = build_appended_filter_statement()
    return Renderer().render_statement_string([statement])


def test_inline_query_uses_boston_partial_datasource():
    env, statement = _parse_query(INLINE_QUERY)
    sql = _compile_sql((env, statement))

    assert "usbos_tree_info" in sql
    assert "full_tree_info" not in sql


def test_appended_filter_query_uses_boston_partial_datasource():
    env, statement = build_appended_filter_statement()
    sql = _compile_sql((env, statement))

    assert "usbos_tree_info" in sql
    assert "full_tree_info" not in sql


def test_rendered_appended_query_keeps_city_filter_visible():
    rendered = render_appended_filter_query()

    assert "city = 'USBOS'" in rendered
    assert "count(tree_id) -> tree_count" in rendered
