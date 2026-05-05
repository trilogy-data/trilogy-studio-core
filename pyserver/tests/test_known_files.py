"""Tests for the `files` passthrough on QueryInSchema.

The explorer ships a Trilogy query that declares a file-backed datasource
(``file 'ratings.csv'``) but the file lives on the *client's* disk, not on
the (potentially hosted) pyserver. Without the passthrough, trilogy's parser
marks the datasource UNPOPULATED and the build phase silently skips it,
producing SQL that ignores the datasource. With ``files`` listing the
basenames the client knows about, the server rewrites the address to the
basename and resets state to PUBLISHED so the generated SQL references
``read_csv('ratings.csv')`` — which the client's duckdb-wasm has registered.
"""

from io_models import QueryInSchema
from query_helpers import generate_query_core
from trilogy.core.enums import DatasourceState
from trilogy.dialect.duckdb import DuckDBDialect

_INLINE_FILE_QUERY = """
key user_id int;
key rating_id string;
property rating_id.movie_id int;
property rating_id.value float;
property rating_id.timestamp int;

datasource ratings_csv (
    userId: user_id,
    movieId: movie_id,
    rating: value,
    timestamp: timestamp
)
grain (rating_id)
file `ratings.csv`;


select count(user_id) as user_count;
"""


def test_inline_file_datasource_with_known_files_emits_sql():
    query = QueryInSchema.model_validate(
        {
            "imports": [],
            "query": _INLINE_FILE_QUERY,
            "dialect": "duckdb",
            "full_model": {"name": "", "sources": []},
            "files": ["ratings.csv"],
        }
    )
    target, columns, _, select_count = generate_query_core(query, DuckDBDialect())
    assert target is not None, "expected a processed query, got None"
    assert select_count == 1
    sql = DuckDBDialect().compile_statement(target)
    # The rewritten address should be the basename, not the server's CWD path.
    assert "read_csv('ratings.csv'" in sql, sql
    assert any(c.name == "user_count" for c in columns)


def test_inline_file_datasource_without_known_files_drops_datasource():
    """Sanity check: without `files`, the existing behaviour persists — the
    datasource is treated as unpopulated and the query has nothing to bind
    against. Documents the contract we're relying on."""
    query = QueryInSchema.model_validate(
        {
            "imports": [],
            "query": _INLINE_FILE_QUERY,
            "dialect": "duckdb",
            "full_model": {"name": "", "sources": []},
        }
    )
    # No files passed — trilogy will check the server filesystem and not find
    # ratings.csv, so the datasource is UNPOPULATED. The build phase skips it,
    # which surfaces as an inability to resolve the query.
    try:
        target, _, _, _ = generate_query_core(query, DuckDBDialect())
    except Exception:
        return
    # If we got a target, the datasource must have been skipped during build —
    # the SQL would not reference any source.
    if target is not None:
        sql = DuckDBDialect().compile_statement(target)
        assert "ratings.csv" not in sql


def test_known_files_resets_unpopulated_status():
    """Direct check on the datasource state after parsing."""
    from env_helpers import mark_known_files, parse_env_from_full_model
    from trilogy.parser import parse_text
    from query_helpers import PARSE_CONFIG

    env = parse_env_from_full_model([])
    parse_text(_INLINE_FILE_QUERY, env, parse_config=PARSE_CONFIG)
    ds = next(iter(env.datasources.values()))
    # Pre-patch: the file does not exist on the test runner, so the parser
    # marks the datasource UNPOPULATED.
    assert ds.status == DatasourceState.UNPOPULATED

    mark_known_files(env, ["ratings.csv"])
    assert ds.status == DatasourceState.PUBLISHED
    assert ds.address.exists is True
    assert ds.address.location == "ratings.csv"
