from io_models import QueryInSchema
from query_helpers import generate_query_core, query_to_output
from trilogy.dialect.duckdb import DuckDBDialect

MINIMAL_SOURCES = [
    {
        "alias": "tree_enrichment",
        "contents": (
            "import tree_info;\n\n"
            "property species.fire_risk enum<string>['low', 'moderate', 'high'];\n\n"
            "datasource tree_enrichment (\n"
            "    species,\n"
            "    ?fire_risk,\n"
            ")\n"
            "grain (species)\n"
            "file f`https://storage.googleapis.com/trilogy_public_models/duckdb/trees/tree_enrichment_v{data_version}.parquet`:"
            "f`gcs://trilogy_public_models/duckdb/trees/tree_enrichment_v{data_version}.parquet`;\n"
        ),
    },
    {
        "alias": "tree_info",
        "contents": (
            "import tree_common;\n"
            "import usbtv.burlington_tree_info;\n"
            "import usnyc.nyc_tree_info;\n\n"
            "datasource tree_info (\n"
            "    tree_id,\n"
            "    city,\n"
            "    species,\n"
            ")\n"
            "grain (tree_id)\n"
            "file f`https://storage.googleapis.com/trilogy_public_models/duckdb/trees/full_tree_info_v{data_version}.parquet`:"
            "f`gcs://trilogy_public_models/duckdb/trees/full_tree_info_v{data_version}.parquet`;\n"
        ),
    },
    {
        "alias": "tree_common",
        "contents": "import core;\n\nkey tree_id string;\nkey species string;\n",
    },
    {
        "alias": "core",
        "contents": "key city enum<string>['USNYC', 'USBTV'];\nparam data_version string default '2';\n",
    },
    {
        "alias": "usbtv.burlington_tree_info",
        "contents": (
            "import ..tree_common;\n\n"
            "partial datasource burlington_tree_info (\n"
            "    tree_id,\n"
            "    city,\n"
            "    species,\n"
            ")\n"
            "grain (tree_id)\n"
            "complete where city = 'USBTV'\n"
            "file f`https://storage.googleapis.com/trilogy_public_models/duckdb/trees/usbtv_tree_info_v{data_version}.parquet`:"
            "f`gcs://trilogy_public_models/duckdb/trees/usbtv_tree_info_v{data_version}.parquet`;\n"
        ),
    },
    {
        "alias": "usnyc.nyc_tree_info",
        "contents": (
            "import ..tree_common;\n\n"
            "partial datasource nyc_tree_info (\n"
            "    tree_id,\n"
            "    city,\n"
            "    species,\n"
            ")\n"
            "grain (tree_id)\n"
            "complete where city = 'USNYC'\n"
            "file f`https://storage.googleapis.com/trilogy_public_models/duckdb/trees/usnyc_tree_info_v{data_version}.parquet`:"
            "f`gcs://trilogy_public_models/duckdb/trees/usnyc_tree_info_v{data_version}.parquet`;\n"
        ),
    },
]


def _generate_sql(query_text: str, extra_filters: list[str]) -> str:
    dialect = DuckDBDialect()
    payload = {
        "query": query_text,
        "dialect": "duckdb",
        "full_model": {"name": "", "sources": MINIMAL_SOURCES},
        "imports": [{"name": "tree_enrichment", "alias": ""}],
        "extra_filters": extra_filters,
        "parameters": {},
        "current_filename": None,
    }
    query = QueryInSchema.model_validate(payload)
    target, columns, values, select_count = generate_query_core(
        query, dialect, enable_performance_logging=False
    )
    output = query_to_output(
        target,
        columns,
        values,
        None,
        dialect,
        enable_performance_logging=False,
        select_count=select_count,
    )
    return output.generated_sql or ""


def test_extra_filters_choose_full_tree_info_but_inline_where_chooses_partial():
    extra_filter_sql = _generate_sql(
        "SELECT count(tree_id) as tree_count ORDER BY tree_count DESC;",
        ["city = 'USBTV'"],
    )
    inline_where_sql = _generate_sql(
        "SELECT count(tree_id) as tree_count WHERE city = 'USBTV' ORDER BY tree_count DESC;",
        [],
    )

    assert "usbtv_tree_info_v2.parquet" in extra_filter_sql
    assert "full_tree_info_v2.parquet" not in extra_filter_sql

    assert "usbtv_tree_info_v2.parquet" in inline_where_sql
    assert "full_tree_info_v2.parquet" not in inline_where_sql
