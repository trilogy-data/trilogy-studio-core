"""Coverage for the MCP server surface.

These tests are deliberately hermetic — no calls to the public-models CDN — so
they run in CI alongside the rest of `tests/`. The network-dependent behaviour
lives in `tests_mcp/`.
"""

import asyncio
from typing import Any

import pytest
from mcp.server.mcpserver.exceptions import ToolError
from trilogy.core.models.core import (
    ArrayType,
    DataType,
    EnumType,
    MapType,
    NumericType,
    TraitDataType,
)

import mcp_server
from mcp_server import (
    QueryResult,
    clear_http_cache,
    datatype_to_str_datatype,
    mcp,
    memoize_http,
    run_trilogy_query,
)

EXPECTED_TOOLS = {
    "active_connections",
    "clear_cache",
    "create_connection",
    "list_connection_fields",
    "list_dialects",
    "list_public_models",
    "run_trilogy_query",
}

EXPECTED_RESOURCES = {"db://connections", "docs://trilogy/syntax"}


def run(coro) -> Any:
    """Drive a coroutine without taking a pytest-asyncio dependency."""
    return asyncio.run(coro)


class TestServerRegistration:
    def test_server_identity(self):
        assert mcp.name == "Trilogy Language Tools"

    def test_instructions_are_populated(self):
        # MCPServer's second positional argument is `title`, where FastMCP 1.x
        # took `instructions`. Passing the guidance positionally during the 2.0
        # port would leave clients with no instructions at all and silently
        # rename the server, so pin both ends.
        assert mcp.instructions is not None
        assert "Trilogy is a SQL-like language" in mcp.instructions
        assert mcp.title != mcp.instructions

    def test_all_tools_registered(self):
        tools = run(mcp.list_tools())
        assert {tool.name for tool in tools} == EXPECTED_TOOLS

    def test_all_resources_registered(self):
        resources = run(mcp.list_resources())
        assert {str(resource.uri) for resource in resources} == EXPECTED_RESOURCES

    def test_query_tool_schema(self):
        tools = {tool.name: tool for tool in run(mcp.list_tools())}
        schema = tools["run_trilogy_query"].input_schema
        assert set(schema["properties"]) == {"command", "connection"}
        # The dataclass return type has to survive as a structured schema, or
        # clients get an opaque text blob back instead of headers/results.
        assert tools["run_trilogy_query"].output_schema is not None


class TestToolInvocation:
    def test_list_dialects(self):
        result = run(mcp.call_tool("list_dialects", {}))
        assert result.is_error is False
        assert result.structured_content == {"result": ["BIGQUERY", "DUCK_DB"]}

    def test_active_connections_includes_default(self):
        result = run(mcp.call_tool("active_connections", {}))
        assert "DEFAULT_DUCKDB" in result.structured_content["result"]

    def test_clear_cache(self):
        result = run(mcp.call_tool("clear_cache", {}))
        assert result.is_error is False
        assert "cleared" in result.structured_content["result"]

    def test_unknown_connection_surfaces_as_a_tool_error(self):
        # The tool raises ToolError (an anticipated failure) rather than
        # returning is_error=True; the protocol layer above converts it. The
        # SDK prefixes the message with "Error executing tool <name>: " and
        # keeps ours, whereas any other exception is masked to the prefix.
        with pytest.raises(ToolError, match="Connection 'nope' does not exist"):
            run(mcp.call_tool("list_connection_fields", {"name": "nope"}))


class TestResourceReads:
    def test_connections_resource(self):
        contents = run(mcp.read_resource("db://connections"))
        assert "DEFAULT_DUCKDB" in "".join(item.content for item in contents)

    def test_syntax_docs_resource(self):
        contents = run(mcp.read_resource("docs://trilogy/syntax"))
        body = "".join(item.content for item in contents)
        assert "NEVER include a from clause" in body


class TestRunTrilogyQuery:
    def test_executes_against_the_default_duckdb_connection(self):
        result = run_trilogy_query("const one <- 1; select one;", "DEFAULT_DUCKDB")

        assert isinstance(result, QueryResult)
        assert [header.name for header in result.headers] == ["one"]
        assert [header.datatype for header in result.headers] == ["INTEGER"]
        assert result.results == [{"_index": 0, "one": 1}]

    def test_rows_are_indexed_in_order(self):
        result = run_trilogy_query(
            "const num <- unnest([1,2,3]); select num order by num asc;",
            "DEFAULT_DUCKDB",
        )
        assert [row["_index"] for row in result.results] == [0, 1, 2]

    def test_through_the_mcp_tool_layer(self):
        result = run(
            mcp.call_tool(
                "run_trilogy_query",
                {
                    "command": "const one <- 1; select one;",
                    "connection": "DEFAULT_DUCKDB",
                },
            )
        )
        assert result.is_error is False
        assert result.structured_content["results"] == [{"_index": 0, "one": 1}]


class TestDatatypeRendering:
    def test_plain_datatype(self):
        assert datatype_to_str_datatype(DataType.STRING) == "STRING"

    def test_trait_datatype(self):
        rendered = datatype_to_str_datatype(
            TraitDataType(type=DataType.STRING, traits=["city"])
        )
        assert rendered == "STRING<city>"

    def test_array_datatype(self):
        assert (
            datatype_to_str_datatype(ArrayType(type=DataType.STRING)) == "ARRAY<STRING>"
        )

    def test_map_datatype(self):
        rendered = datatype_to_str_datatype(
            MapType(key_type=DataType.STRING, value_type=DataType.INTEGER)
        )
        assert rendered == "MAP<STRING, INTEGER>"

    def test_numeric_datatype(self):
        assert (
            datatype_to_str_datatype(NumericType(precision=10, scale=2))
            == "Numeric<10,2>"
        )

    @pytest.mark.parametrize(
        "values,expected",
        [
            ([1, 2, 3], "ENUM<INTEGER[1,2,3]>"),
            ([], "ENUM<INTEGER[]>"),
        ],
    )
    def test_numeric_enum_values_render(self, values, expected):
        # EnumType.values is list[Any]; joining it without str() raised
        # "TypeError: sequence item 0: expected str instance, int found" and
        # took down list_connection_fields for any model with a numeric enum.
        assert (
            datatype_to_str_datatype(EnumType(type=DataType.INTEGER, values=values))
            == expected
        )

    def test_string_enum_values_render(self):
        rendered = datatype_to_str_datatype(
            EnumType(type=DataType.STRING, values=["a", "b"])
        )
        assert rendered == "ENUM<STRING[a,b]>"


class TestHttpMemoization:
    def test_repeat_calls_are_served_from_cache(self):
        clear_http_cache()
        calls = []

        @memoize_http
        def fetch(url: str) -> str:
            calls.append(url)
            return f"body:{url}"

        assert fetch("a") == "body:a"
        assert fetch("a") == "body:a"
        assert calls == ["a"]

        assert fetch("b") == "body:b"
        assert calls == ["a", "b"]

    def test_clear_cache_forces_a_refetch(self):
        clear_http_cache()
        calls = []

        @memoize_http
        def fetch(url: str) -> str:
            calls.append(url)
            return f"body:{url}"

        fetch("a")
        clear_http_cache()
        fetch("a")

        assert calls == ["a", "a"]

    def test_clear_cache_empties_the_shared_store(self):
        mcp_server._http_cache["sentinel"] = "value"
        clear_http_cache()
        assert mcp_server._http_cache == {}
