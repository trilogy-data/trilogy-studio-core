from mcp_server import (
    list_connection_fields,
    run_trilogy_query,
    create_model_connection,
)


def test_create_model_connection():
    c = create_model_connection("test_duckdb_faa", "faa")

    results = c.execute_query(
        """
select
    origin.city,
    count(id2) ->flight_count
    order by flight_count desc limit 10;"""
    ).fetchall()

    assert results[0].origin_city == "CHICAGO"


def test_list_connection_fields():
    create_model_connection("test_duckdb_faa", "faa")
    fields = list_connection_fields("test_duckdb_faa")

    assert len(fields) > 0

    matched = [f for f in fields if f["name"] == "origin.city"].pop()
    assert matched["datatype"] == "STRING<city>"


def test_run_trilogy_query():
    create_model_connection("test_duckdb_faa", "faa")
    results = run_trilogy_query(
        """select
    origin.city,
    count(id2) ->flight_count
    order by flight_count desc limit 10;""",
        "test_duckdb_faa",
    )

    assert len(results.headers) == 2

    # concepts = run_trilogy_query("show concepts;", "test_duckdb_faa")
    # assert len(concepts.concepts) > 0
