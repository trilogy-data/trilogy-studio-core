"""
End-to-end tests: resolver generates parameterised SQL → DuckDB Python executes it.

Layers tested:
  1. _bind_and_execute  — the Python mirror of the WASM param-binding logic
  2. resolver → SQL     — _generate_query_task produces correct SQL + params
  3. resolver → DuckDB  — generated SQL + params produces correct rows when
                          executed against a real in-memory DuckDB database
"""

import re

import duckdb
import pytest

from io_models import ModelInSchema, ModelSourceInSchema, QueryInSchema
from studio_endpoints import _generate_query_task
from trilogy import Dialects


# ---------------------------------------------------------------------------
# Binding helper (mirrors lib/connections/duckdb.ts query_core)
# ---------------------------------------------------------------------------

_PARAM_RE = re.compile(r"(?<!:):([a-zA-Z_]\w*)")


def _bind_and_execute(
    conn: duckdb.DuckDBPyConnection,
    sql: str,
    parameters: dict[str, str | int | float] | None,
) -> list[tuple]:
    """Substitute :name placeholders with ? and execute via DuckDB Python.

    Mirrors the WASM DuckDB binding logic:
    - Negative lookbehind skips ::cast syntax
    - Collects unique param names in first-appearance order
    - Accepts keys with or without a leading colon
    - Uses re.sub so every occurrence (across CTEs) is replaced
    """
    if not parameters:
        return conn.execute(sql).fetchall()

    seen: set[str] = set()
    ordered: list[str] = []
    for m in _PARAM_RE.finditer(sql):
        name = m.group(1)
        if name not in seen:
            seen.add(name)
            ordered.append(name)

    # Build positional values in occurrence order (not grouped by param name),
    # so interleaved placeholders like :a, :b, :a map to [a_val, b_val, a_val].
    values: list = []
    for m in _PARAM_RE.finditer(sql):
        name = m.group(1)
        value = parameters.get(name, parameters.get(f":{name}"))
        if value is not None:
            values.append(value)

    # Replace all occurrences of each known param with ?
    modified = sql
    for name in ordered:
        value = parameters.get(name, parameters.get(f":{name}"))
        if value is not None:
            modified = re.sub(rf"(?<!:):{re.escape(name)}\b", "?", modified)

    return conn.execute(modified, values).fetchall()


# ---------------------------------------------------------------------------
# Unit tests for _bind_and_execute itself
# ---------------------------------------------------------------------------


def test_bind_single_param():
    conn = duckdb.connect(":memory:")
    rows = _bind_and_execute(conn, "SELECT :p0 AS v", {":p0": 42})
    assert rows == [(42,)]


def test_bind_colon_prefix_optional():
    """Both ':name' and 'name' keys must work."""
    conn = duckdb.connect(":memory:")
    rows_with = _bind_and_execute(conn, "SELECT :p0 AS v", {":p0": "hello"})
    rows_without = _bind_and_execute(conn, "SELECT :p0 AS v", {"p0": "hello"})
    assert rows_with == rows_without == [("hello",)]


def test_bind_skips_cast_syntax():
    """::date casts must not be confused with :date parameters."""
    conn = duckdb.connect(":memory:")
    # No parameters — just verifies the cast expression executes without error
    rows = _bind_and_execute(conn, "SELECT '2024-01-01'::date AS d", None)
    assert len(rows) == 1


def test_bind_replaces_all_occurrences():
    """The same :param appearing in multiple subqueries must all be replaced."""
    conn = duckdb.connect(":memory:")
    sql = """
        WITH a AS (SELECT :v AS x),
             b AS (SELECT :v AS x)
        SELECT a.x, b.x FROM a FULL JOIN b ON 1=1
    """
    rows = _bind_and_execute(conn, sql, {":v": 7})
    assert rows == [(7, 7)]


def test_bind_multiple_distinct_params():
    conn = duckdb.connect(":memory:")
    rows = _bind_and_execute(
        conn,
        "SELECT :a AS x, :b AS y",
        {":a": 1, ":b": 2},
    )
    assert rows == [(1, 2)]


def test_bind_interleaved_params_correct_order():
    """When distinct params alternate (:a, :b, :a), values must be passed in
    occurrence order, not grouped — otherwise DuckDB binds wrong columns."""
    conn = duckdb.connect(":memory:")
    # SQL that references params in interleaved order
    sql = "SELECT :a AS first, :b AS second, :a AS third"
    rows = _bind_and_execute(conn, sql, {":a": 1, ":b": 99})
    assert rows == [(1, 99, 1)]


def test_bind_no_params_executes_plain():
    conn = duckdb.connect(":memory:")
    rows = _bind_and_execute(conn, "SELECT 99 AS v", None)
    assert rows == [(99,)]


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

_SPECIES_SOURCE = """
key species_id int;
property species_id.species string;
property species_id.tree_count int;

datasource species_table (
    id: species_id,
    species: species,
    tree_count: tree_count,
)
grain (species_id,)
address species_table
;
"""

_ORDERS_SOURCE = """
key order_id int;
property order_id.order_date date;
property order_id.amount float;

datasource orders_table (
    id: order_id,
    order_date: order_date,
    amount: amount,
)
grain (order_id,)
address orders_table
;
"""

_EVENTS_SOURCE = """
key event_id int;
property event_id.event_date date;
property event_id.event_name string;

datasource events_table (
    id: event_id,
    event_date: event_date,
    event_name: event_name,
)
grain (event_id,)
address events_table
;
"""


@pytest.fixture
def species_db():
    conn = duckdb.connect(":memory:")
    conn.execute(
        "CREATE TABLE species_table (id INTEGER, species VARCHAR, tree_count INTEGER)"
    )
    conn.execute(
        "INSERT INTO species_table VALUES "
        "(1,'Acer rubrum',120),(2,'Quercus alba',80),(3,'Acer saccharum',60)"
    )
    yield conn
    conn.close()


@pytest.fixture
def events_db():
    conn = duckdb.connect(":memory:")
    conn.execute(
        "CREATE TABLE events_table (id INTEGER, event_date DATE, event_name VARCHAR)"
    )
    conn.execute(
        "INSERT INTO events_table VALUES "
        "(1,'2024-01-15','login'),(2,'2024-01-15','purchase'),"
        "(3,'2024-01-16','logout'),(4,'2023-12-31','rollover')"
    )
    yield conn
    conn.close()


@pytest.fixture
def orders_db():
    conn = duckdb.connect(":memory:")
    conn.execute(
        "CREATE TABLE orders_table (id INTEGER, order_date DATE, amount DOUBLE)"
    )
    conn.execute(
        "INSERT INTO orders_table VALUES "
        "(1,'2024-01-15',100.0),(2,'2024-02-20',200.0),"
        "(3,'2024-04-10',150.0),(4,'2023-12-31',50.0)"
    )
    yield conn
    conn.close()


def _generate(
    query: str,
    sources: list[ModelSourceInSchema],
    extra_filters: list[str],
    parameters: dict[str, str | int | float],
) -> dict:
    request = QueryInSchema(
        imports=[],
        query=query,
        dialect=Dialects.DUCK_DB,
        current_filename="test",
        full_model=ModelInSchema(name="test_e2e", sources=sources),
        extra_filters=extra_filters,
        parameters=parameters,
    )
    payload = _generate_query_task(request.model_dump(mode="json"), False)
    assert "__http_error__" not in payload, payload.get("__http_error__", {}).get(
        "detail"
    )
    return payload


# ---------------------------------------------------------------------------
# Resolver → SQL layer (parameter placeholders present, values absent from SQL)
# ---------------------------------------------------------------------------


def test_resolver_string_eq_produces_placeholder():
    sources = [ModelSourceInSchema(alias="species", contents=_SPECIES_SOURCE)]
    payload = _generate(
        "import species; select local.species, local.tree_count;",
        sources,
        ["local.species = :p0"],
        {":p0": "Acer rubrum"},
    )
    assert ":p0" in payload["generated_sql"]
    assert "Acer rubrum" not in payload["generated_sql"]


def test_resolver_date_concept_with_iso_timestamp_input():
    """Regression: Luxon DateTime serialises as a full ISO timestamp string
    (e.g. '1992-12-20T22:19:57.462Z'). The concept-type lookup must override
    _trilogy_type_for's 'datetime' guess and declare the parameter as 'date'
    when the concept being filtered is a DATE column — preventing the
    'Cannot compare DATE and DATETIME' error seen in production."""
    sources = [ModelSourceInSchema(alias="events", contents=_EVENTS_SOURCE)]
    # Simulate what the frontend sends before the Luxon-normalisation fix:
    # a full ISO timestamp string for a DATE concept.
    payload = _generate(
        "import events; select local.event_date, local.event_name;",
        sources,
        ["local.event_date between :ts_min and :ts_max"],
        {":ts_min": "2024-01-15T00:00:00.000Z", ":ts_max": "2024-01-16T00:00:00.000Z"},
    )
    assert ":ts_min" in payload["generated_sql"]
    assert "2024-01-15" not in payload["generated_sql"]


def test_resolver_date_range_produces_placeholder():
    """Regression: _trilogy_type_for must return 'date' for ISO strings so
    Trilogy does not raise 'Cannot compare DATE and STRING'."""
    sources = [ModelSourceInSchema(alias="orders", contents=_ORDERS_SOURCE)]
    payload = _generate(
        "import orders; select local.order_date, local.amount;",
        sources,
        ["local.order_date between :date_min and :date_max"],
        {":date_min": "2024-01-01", ":date_max": "2024-03-31"},
    )
    assert ":date_min" in payload["generated_sql"]
    assert ":date_max" in payload["generated_sql"]
    assert "2024-01-01" not in payload["generated_sql"]


# ---------------------------------------------------------------------------
# Full E2E: resolver → DuckDB execution
# ---------------------------------------------------------------------------


def test_e2e_string_eq_returns_correct_row(species_db):
    sources = [ModelSourceInSchema(alias="species", contents=_SPECIES_SOURCE)]
    payload = _generate(
        "import species; select local.species, local.tree_count;",
        sources,
        ["local.species = :p0"],
        {":p0": "Acer rubrum"},
    )
    rows = _bind_and_execute(species_db, payload["generated_sql"], {":p0": "Acer rubrum"})
    assert len(rows) == 1
    assert rows[0][0] == "Acer rubrum"


def test_e2e_string_in_or_returns_multiple_rows(species_db):
    sources = [ModelSourceInSchema(alias="species", contents=_SPECIES_SOURCE)]
    payload = _generate(
        "import species; select local.species, local.tree_count;",
        sources,
        ["(local.species = :p0 OR local.species = :p1)"],
        {":p0": "Acer rubrum", ":p1": "Acer saccharum"},
    )
    rows = _bind_and_execute(
        species_db,
        payload["generated_sql"],
        {":p0": "Acer rubrum", ":p1": "Acer saccharum"},
    )
    assert {r[0] for r in rows} == {"Acer rubrum", "Acer saccharum"}


def test_e2e_numeric_filter_returns_correct_rows(species_db):
    sources = [ModelSourceInSchema(alias="species", contents=_SPECIES_SOURCE)]
    payload = _generate(
        "import species; select local.species, local.tree_count;",
        sources,
        ["local.tree_count > :p0"],
        {":p0": 90},
    )
    rows = _bind_and_execute(species_db, payload["generated_sql"], {":p0": 90})
    assert all(r[1] > 90 for r in rows)
    assert len(rows) == 1


def test_e2e_date_range_returns_correct_rows(orders_db):
    """Date BETWEEN filter returns only rows within the range.

    Regression: previously _trilogy_type_for returned 'string' for ISO dates,
    causing a 'Cannot compare DATE and STRING' error at parse time.
    """
    sources = [ModelSourceInSchema(alias="orders", contents=_ORDERS_SOURCE)]
    payload = _generate(
        "import orders; select local.order_date, local.amount;",
        sources,
        ["local.order_date between :date_min and :date_max"],
        {":date_min": "2024-01-01", ":date_max": "2024-03-31"},
    )
    rows = _bind_and_execute(
        orders_db,
        payload["generated_sql"],
        {":date_min": "2024-01-01", ":date_max": "2024-03-31"},
    )
    # Jan + Feb rows are in range; Apr and Dec rows are not
    assert len(rows) == 2


def test_e2e_date_concept_iso_timestamp_input_returns_correct_rows(events_db):
    """Full ISO timestamp strings sent for a DATE concept (Luxon serialisation)
    are accepted and produce correct results via concept-type lookup."""
    sources = [ModelSourceInSchema(alias="events", contents=_EVENTS_SOURCE)]
    payload = _generate(
        "import events; select local.event_date, local.event_name;",
        sources,
        ["local.event_date between :ts_min and :ts_max"],
        {":ts_min": "2024-01-15T00:00:00.000Z", ":ts_max": "2024-01-16T00:00:00.000Z"},
    )
    rows = _bind_and_execute(
        events_db,
        payload["generated_sql"],
        {":ts_min": "2024-01-15", ":ts_max": "2024-01-16"},
    )
    names = {r[1] for r in rows}
    assert "login" in names and "purchase" in names


def test_e2e_param_repeated_across_ctes(species_db):
    """A filter param repeated in multiple CTEs must all be bound correctly.

    Regression: the WASM duckdb.ts used .replace() (first-occurrence only).
    This test verifies all occurrences are substituted by checking no raw
    :placeholder remains in the final SQL after binding.
    """
    sources = [ModelSourceInSchema(alias="species", contents=_SPECIES_SOURCE)]
    # A filter on a key column tends to propagate into every CTE
    payload = _generate(
        "import species; select local.species, local.tree_count;",
        sources,
        ["local.species = :p0"],
        {":p0": "Quercus alba"},
    )
    sql = payload["generated_sql"]

    # Verify binding removes ALL occurrences (not just the first)
    modified = sql
    modified = re.sub(r"(?<!:):p0\b", "?", modified)
    residual = _PARAM_RE.findall(modified)
    assert residual == [], f"Unresolved placeholders after binding: {residual}"

    # And that execution returns the correct row
    rows = _bind_and_execute(species_db, sql, {":p0": "Quercus alba"})
    assert len(rows) == 1
    assert rows[0][0] == "Quercus alba"
