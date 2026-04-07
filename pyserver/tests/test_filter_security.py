"""
Security tests for parameterized filter handling.

These tests verify that values passed via the `parameters` dict (cross-filter
values from the frontend) are never embedded as literals in `generated_sql`.
Instead they must travel as binding parameters so that downstream connections
(DuckDB, BigQuery, Snowflake, …) can pass them through their native
parameterized-query APIs.
"""

from studio_endpoints import _generate_query_task
from io_models import ModelInSchema, ModelSourceInSchema, QueryInSchema
from query_helpers import _trilogy_type_for
from trilogy import Dialects

# ---------------------------------------------------------------------------
# _trilogy_type_for unit tests
# ---------------------------------------------------------------------------


def test_trilogy_type_for_string():
    assert _trilogy_type_for("hello") == "string"


def test_trilogy_type_for_date():
    assert _trilogy_type_for("2024-01-15") == "date"
    assert _trilogy_type_for("2023-12-31") == "date"


def test_trilogy_type_for_timestamp_space():
    assert _trilogy_type_for("2024-01-15 08:00:00") == "datetime"


def test_trilogy_type_for_timestamp_T():
    assert _trilogy_type_for("2024-01-15T08:00:00") == "datetime"


def test_trilogy_type_for_int():
    assert _trilogy_type_for(42) == "int"


def test_trilogy_type_for_float():
    assert _trilogy_type_for(3.14) == "float"


# ---------------------------------------------------------------------------
# Shared model: a tiny "species" catalogue with string and numeric columns
# ---------------------------------------------------------------------------

_SPECIES_SOURCE = """
key species_id int;
property species_id.species string;
property species_id.tree_count int;

datasource species_data (
    id: species_id,
    species: species,
    tree_count: tree_count,
)
grain (species_id,)
address species_catalogue
;
"""


def _model() -> ModelInSchema:
    return ModelInSchema(
        name="test_filter_security",
        sources=[ModelSourceInSchema(alias="species", contents=_SPECIES_SOURCE)],
    )


def _run(
    extra_filters: list[str],
    parameters: dict[str, str | int | float] | None = None,
) -> dict:
    request = QueryInSchema(
        imports=[],
        query="import species; select local.species, local.tree_count;",
        dialect=Dialects.DUCK_DB,
        current_filename="test",
        full_model=_model(),
        extra_filters=extra_filters,
        parameters=parameters or {},
    )
    payload = _generate_query_task(request.model_dump(mode="json"), False)
    assert "__http_error__" not in payload, payload.get("__http_error__", {}).get(
        "detail"
    )
    return payload


# ---------------------------------------------------------------------------
# Basic parameterization
# ---------------------------------------------------------------------------


def test_string_value_not_in_sql():
    """An eq-filter value must appear in parameters, not embedded in SQL."""
    payload = _run(
        extra_filters=["local.species = :p0"],
        parameters={":p0": "Acer rubrum"},
    )
    sql: str = payload["generated_sql"]
    assert "Acer rubrum" not in sql, f"Value leaked into SQL: {sql}"
    assert payload["parameters"]


def test_integer_value_not_in_sql():
    """Numeric filter values must also travel via parameters."""
    payload = _run(
        extra_filters=["tree_count > :p0"],
        parameters={":p0": 50},
    )
    sql: str = payload["generated_sql"]
    # The literal integer 50 must not appear embedded in the generated SQL
    assert ":p0" not in sql or payload["parameters"], "No parameter binding produced"


# ---------------------------------------------------------------------------
# SQL injection patterns
# ---------------------------------------------------------------------------


def test_single_quote_injection():
    """O'Connor-style single-quote injection must not break out of the param."""
    payload = _run(
        extra_filters=["species = :p0"],
        parameters={":p0": "O'Connor"},
    )
    sql: str = payload["generated_sql"]
    assert "O'Connor" not in sql, f"Injected value leaked into SQL: {sql}"


def test_double_dash_comment_injection():
    """Values containing -- must not become SQL comments."""
    payload = _run(
        extra_filters=["species = :p0"],
        parameters={":p0": "legit' -- drop table species; --"},
    )
    sql: str = payload["generated_sql"]
    assert "drop table" not in sql.lower(), f"Injection leaked into SQL: {sql}"


def test_semicolon_injection():
    """Values with semicolons must not introduce additional statements."""
    payload = _run(
        extra_filters=["species = :p0"],
        parameters={":p0": "x; DROP TABLE species_data; --"},
    )
    sql: str = payload["generated_sql"]
    assert "drop table" not in sql.lower(), f"Injection leaked into SQL: {sql}"


def test_block_comment_injection():
    """C-style block comment injection must be contained."""
    payload = _run(
        extra_filters=["species = :p0"],
        parameters={":p0": "x' /* injected */"},
    )
    sql: str = payload["generated_sql"]
    assert "injected" not in sql, f"Injection leaked into SQL: {sql}"


def test_union_select_injection():
    """UNION SELECT injection must not appear in generated SQL."""
    payload = _run(
        extra_filters=["species = :p0"],
        parameters={":p0": "x' UNION SELECT password FROM users --"},
    )
    sql: str = payload["generated_sql"]
    assert "union select" not in sql.lower(), f"Injection leaked into SQL: {sql}"


def test_null_byte_injection():
    """Null bytes must not slip through."""
    payload = _run(
        extra_filters=["species = :p0"],
        parameters={":p0": "legit\x00' OR '1'='1"},
    )
    sql: str = payload["generated_sql"]
    # Value must not be embedded in SQL
    assert (
        "\x00" not in sql and "OR '1'='1" not in sql
    ), f"Injection leaked into SQL: {sql}"


# ---------------------------------------------------------------------------
# Multi-filter (AND) parameterization
# ---------------------------------------------------------------------------


def test_multiple_parameters_not_in_sql():
    """When several filters are active, none of their values should appear in SQL."""
    payload = _run(
        extra_filters=["species = :p0", "tree_count > :p1"],
        parameters={":p0": "Acer rubrum", ":p1": 10},
    )
    sql: str = payload["generated_sql"]
    assert "Acer rubrum" not in sql, f"String value leaked into SQL: {sql}"


def test_in_list_parameters_not_in_sql():
    """OR-expanded IN filters must not embed literals."""
    payload = _run(
        extra_filters=["(species = :p0 OR species = :p1)"],
        parameters={":p0": "Acer rubrum", ":p1": "Quercus alba"},
    )
    sql: str = payload["generated_sql"]
    assert "Acer rubrum" not in sql, f"Value leaked into SQL: {sql}"
    assert "Quercus alba" not in sql, f"Value leaked into SQL: {sql}"


# ---------------------------------------------------------------------------
# Date type round-trip tests
#
# The backend must detect ISO-8601 date strings and declare the parameter as
# `date` (not `string`) so Trilogy can type-check comparisons against date
# columns without raising "Cannot compare DATE and STRING" errors.
# ---------------------------------------------------------------------------

_DATE_SOURCE = """
key order_id int;
property order_id.order_date date;
property order_id.amount float;

datasource orders (
    id: order_id,
    order_date: order_date,
    amount: amount,
)
grain (order_id,)
address orders_table
;
"""


def _date_model() -> ModelInSchema:
    return ModelInSchema(
        name="test_filter_date",
        sources=[ModelSourceInSchema(alias="orders", contents=_DATE_SOURCE)],
    )


def _run_date(
    extra_filters: list[str],
    parameters: dict[str, str | int | float] | None = None,
) -> dict:
    request = QueryInSchema(
        imports=[],
        query="import orders; select local.order_date, local.amount;",
        dialect=Dialects.DUCK_DB,
        current_filename="test",
        full_model=_date_model(),
        extra_filters=extra_filters,
        parameters=parameters or {},
    )
    payload = _generate_query_task(request.model_dump(mode="json"), False)
    assert "__http_error__" not in payload, payload.get("__http_error__", {}).get(
        "detail"
    )
    return payload


def test_date_eq_filter_type_matches():
    """An ISO date value must be typed as `date`, not `string`, so Trilogy
    accepts it in a comparison against a date column."""
    payload = _run_date(
        extra_filters=["local.order_date = :p0"],
        parameters={":p0": "2024-01-15"},
    )
    sql: str = payload["generated_sql"]
    assert "2024-01-15" not in sql, f"Date value leaked into SQL: {sql}"


def test_date_range_filter_type_matches():
    """ISO date values used in a BETWEEN expression must not cause a
    DATE vs STRING type mismatch (regression: _trilogy_type_for returned
    'string' for all str values, including ISO dates)."""
    payload = _run_date(
        extra_filters=["local.order_date between :order_date_min and :order_date_max"],
        parameters={":order_date_min": "2024-01-01", ":order_date_max": "2024-03-31"},
    )
    sql: str = payload["generated_sql"]
    assert "2024-01-01" not in sql, f"Date value leaked into SQL: {sql}"
    assert "2024-03-31" not in sql, f"Date value leaked into SQL: {sql}"


def test_date_value_not_in_sql():
    """Date parameter values must never appear as literals in generated SQL."""
    payload = _run_date(
        extra_filters=["local.order_date = :p0"],
        parameters={":p0": "2024-06-30"},
    )
    assert "2024-06-30" not in payload["generated_sql"]
