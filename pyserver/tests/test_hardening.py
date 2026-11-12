"""The resolver is a public, unauthenticated API. Each test here is an input
that used to hurt it: read a file off the server, pin or kill a worker, or
shut the process down. See server_policy.py for the reasoning."""

import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request

import main
import server_policy
from diagnostics import truncate_to_last_semicolon
from env_helpers import parse_env_from_full_model
from io_models import ModelInSchema, QueryInSchema
from query_helpers import _concept_type_for_param, prepare_filter_params

MODEL = "key id string;\ndatasource x (id: id) grain (id) address t;"


def _body(source: str = MODEL, query: str = "import m; select id;", **extra) -> dict:
    return {
        "imports": [],
        "query": query,
        "dialect": "duck_db",
        "full_model": {"name": "m", "sources": [{"alias": "m", "contents": source}]},
        **extra,
    }


# ---------------------------------------------------------------------------
# Server-side file read through a `.sql` datasource
# ---------------------------------------------------------------------------


@pytest.fixture
def secret_sql(tmp_path):
    path = tmp_path / "secret.sql"
    path.write_text("select 'TOP_SECRET_CONTENT' as id", encoding="utf-8")
    return path.as_posix()


def _sql_file_model(path: str) -> str:
    return f"key id string;\ndatasource x (id: id) grain (id) file `{path}`;"


def test_hosted_resolver_does_not_inline_server_files(
    monkeypatch, test_client: TestClient, secret_sql
):
    monkeypatch.setattr(server_policy, "HOSTED", True)
    body = _body(_sql_file_model(secret_sql))

    single = test_client.post("/generate_query", json=body)
    assert single.status_code == 422
    assert "TOP_SECRET_CONTENT" not in single.text
    assert "hosted resolver" in single.json()["detail"]

    batch = test_client.post(
        "/generate_queries",
        json={
            "imports": [],
            "dialect": "duck_db",
            "full_model": body["full_model"],
            "queries": [{"query": body["query"], "label": "q"}],
        },
    )
    assert batch.status_code == 200
    assert "TOP_SECRET_CONTENT" not in batch.text
    assert "hosted resolver" in batch.json()["queries"][0]["error"]


def test_hosted_resolver_refuses_sql_file_registered_as_client_file(
    monkeypatch, test_client: TestClient, secret_sql
):
    """`files` marks a path as client-registered, which skips the existence
    check but not the read."""
    monkeypatch.setattr(server_policy, "HOSTED", True)
    response = test_client.post(
        "/generate_query",
        json=_body(_sql_file_model(secret_sql), files=[secret_sql]),
    )
    assert response.status_code == 422
    assert "TOP_SECRET_CONTENT" not in response.text


def test_local_resolver_still_inlines_sql_files(
    monkeypatch, test_client: TestClient, secret_sql
):
    """Locally the caller owns the disk; this is the feature."""
    monkeypatch.setattr(server_policy, "HOSTED", False)
    response = test_client.post(
        "/generate_query", json=_body(_sql_file_model(secret_sql))
    )
    assert response.status_code == 200
    assert "TOP_SECRET_CONTENT" in response.json()["generated_sql"]


def test_hosted_resolver_keeps_non_sql_file_datasources(monkeypatch):
    """csv/parquet datasources are rendered as a path for the client's engine
    and never opened here; hosted studio (duckdb-wasm) depends on them."""
    monkeypatch.setattr(server_policy, "HOSTED", True)
    model = ModelInSchema.model_validate(
        {
            "name": "m",
            "sources": [
                {
                    "alias": "m",
                    "contents": "key id string;\n"
                    "datasource x (id: id) grain (id) file `data.csv`;",
                }
            ],
        }
    )
    env = parse_env_from_full_model(model.sources, files=["data.csv"])
    env.parse("import m;")
    server_policy.reject_server_file_reads(env)


# ---------------------------------------------------------------------------
# Inputs that pin or kill a worker
# ---------------------------------------------------------------------------


def test_filter_type_lookup_is_linear():
    """Was quadratic: 40k characters took 54s with the GIL held."""
    env = parse_env_from_full_model(
        ModelInSchema.model_validate(
            {"name": "m", "sources": [{"alias": "m", "contents": MODEL}]}
        ).sources
    )
    started = time.perf_counter()
    assert _concept_type_for_param("p1", ["a" * 400_000], env) is None
    assert time.perf_counter() - started < 2


def test_filter_type_lookup_still_finds_the_concept():
    env = parse_env_from_full_model(
        ModelInSchema.model_validate(
            {
                "name": "m",
                "sources": [{"alias": "m", "contents": "key d date;"}],
            }
        ).sources
    )
    env.parse("import m as m;")
    assert _concept_type_for_param("p1", ["x = 1 and m.d >= p1"], env) == "date"
    assert _concept_type_for_param("p1", ["m.d between p0 and p1"], env) == "date"


def test_oversized_filter_is_refused(test_client: TestClient):
    response = test_client.post(
        "/generate_query",
        json=_body(extra_filters=["a" * (server_policy.MAX_FILTER_CHARS + 1)]),
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "text",
    [
        "select " + "(" * 3000 + "1" + ")" * 3000 + " as z;",
        "select " + "[" * 3000 + "1" + "]" * 3000 + " as z;",
        "select " + "abs(" * 3000 + "1" + ")" * 3000 + " as z;",
        "select " + "(" * 3000 + "1 as z;",
        "select " + "case when 1=1 then " * 3000 + "1" + " end" * 3000 + " as z;",
        "select 1 as z where " + "not " * 3000 + "z = 1;",
        "select (" + "z ? " * 3000 + "z = 1) as y;",
        "key x " + "list<" * 3000 + "int" + ">" * 3000 + ";",
    ],
    ids=["paren", "bracket", "call", "unclosed", "case", "not", "filter", "type"],
)
def test_nesting_that_overflows_the_parser_is_refused(text):
    """Each of these aborts the process inside pytrilogy's Rust parser
    (0.3.489) - no exception, the worker just dies. They must never reach
    it, so this deliberately does not call the parser to prove the point."""
    with pytest.raises(ValueError):
        server_policy.check_nesting(text)
    with pytest.raises(ValueError):
        QueryInSchema.model_validate(_body(query=text))
    with pytest.raises(ValueError):
        ModelInSchema.model_validate(
            {"name": "m", "sources": [{"alias": "m", "contents": text}]}
        )


def test_deep_nesting_is_a_422_not_a_crash(test_client: TestClient):
    deep = "select " + "(" * 3000 + "1" + ")" * 3000 + " as z;"
    for path, body in [
        ("/generate_query", _body(query=deep)),
        ("/format_query", _body(query=deep)),
        ("/generate_query", _body(extra_filters=["(" * 3000 + "1=1" + ")" * 3000])),
        ("/parse_model", {"name": "m", "sources": [{"alias": "m", "contents": deep}]}),
    ]:
        assert test_client.post(path, json=body).status_code == 422, path


def test_nesting_guard_ignores_strings_comments_and_separate_statements():
    server_policy.check_nesting("select '" + "(" * 5000 + "' as z;")
    server_policy.check_nesting("# " + "(" * 5000 + "\nselect 1 as z;")
    # Unbalanced opens do not leak from one statement into the next.
    server_policy.check_nesting("select (1 as z;\n" * 5000)
    # Many flat `case` columns across statements are fine.
    server_policy.check_nesting("select case when 1=1 then 1 else 2 end as c;\n" * 5000)
    server_policy.check_nesting("select " + "(" * 60 + "1" + ")" * 60 + " as z;")


def test_diagnostics_truncation_does_not_recurse():
    assert truncate_to_last_semicolon(";" * 50_000) == ""
    assert truncate_to_last_semicolon("select 1; select") == "select 1;"
    assert truncate_to_last_semicolon("select 1; select 2;") == "select 1;"
    assert truncate_to_last_semicolon("select 1") == "select 1"


def test_oversized_batch_is_refused(test_client: TestClient):
    response = test_client.post(
        "/generate_queries",
        json={
            "imports": [],
            "dialect": "duck_db",
            "full_model": {"name": "m", "sources": []},
            "queries": [{"query": "select 1 as z;"}]
            * (server_policy.MAX_QUERIES_PER_BATCH + 1),
        },
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Names spliced into Trilogy source
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name", [":p1 string;\nselect 1 as injected", "p 1", "", ":", "1p", "a;b"]
)
def test_parameter_names_must_be_identifiers(test_client: TestClient, name):
    response = test_client.post(
        "/generate_query",
        json=_body(extra_filters=["id = :p1"], parameters={name: "x"}),
    )
    assert response.status_code == 422


def test_ordinary_parameter_names_pass(test_client: TestClient):
    response = test_client.post(
        "/generate_query",
        json=_body(extra_filters=["id = :param1"], parameters={":param1": "x"}),
    )
    assert response.status_code == 200, response.text


@pytest.mark.parametrize(
    "imp",
    [
        {"name": "m; select 1 as injected"},
        {"name": "m", "alias": "a;\nselect 1 as injected"},
        {"name": "m # x"},
    ],
)
def test_import_names_cannot_carry_statements(test_client: TestClient, imp):
    response = test_client.post("/generate_query", json=_body(imports=[imp]))
    assert response.status_code == 422


@pytest.mark.parametrize(
    "imp",
    [
        {"name": "m"},
        {"name": "m", "alias": "mm"},
        {"name": "m", "alias": ""},
        {"name": "..nested.m", "alias": None},
        {"name": "std.date"},
        {"name": "nested/m"},
    ],
)
def test_ordinary_import_names_validate(imp):
    QueryInSchema.model_validate(_body(imports=[imp]))


# ---------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------


@pytest.fixture
def small_body_client():
    app = FastAPI()
    app.add_middleware(main.BodySizeLimitMiddleware, max_bytes=100)

    @app.post("/echo")
    async def echo(payload: dict):
        return {"size": len(str(payload))}

    with TestClient(app) as client:
        yield client


def test_body_limit_refuses_declared_length(small_body_client: TestClient):
    assert small_body_client.post("/echo", json={"a": "b"}).status_code == 200
    response = small_body_client.post("/echo", json={"a": "b" * 200})
    assert response.status_code == 413


def test_body_limit_counts_a_chunked_body(small_body_client: TestClient):
    def chunks():
        yield b'{"a": "'
        for _ in range(50):
            yield b"bbbbbbbbbb"
        yield b'"}'

    response = small_body_client.post(
        "/echo", content=chunks(), headers={"content-type": "application/json"}
    )
    assert "content-length" not in response.request.headers
    assert response.status_code == 413


def test_app_enforces_a_body_limit(test_client: TestClient):
    response = test_client.post(
        "/generate_query",
        json=_body(query="# " + "x" * (server_policy.MAX_BODY_BYTES + 1)),
    )
    assert response.status_code == 413
    # The refusal is readable by a browser client.
    response = test_client.post(
        "/generate_query",
        json=_body(query="# " + "x" * (server_policy.MAX_BODY_BYTES + 1)),
        headers={"origin": "https://trilogydata.dev"},
    )
    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == "https://trilogydata.dev"


def test_hosted_server_has_no_terminate_route():
    app = FastAPI()
    app.include_router(main.create_server_router(hosted=True))
    with TestClient(app) as client:
        assert client.get("/terminate").status_code == 404
        assert client.get("/health").status_code == 200


def _request(client_host: str, **headers: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/terminate",
            "client": (client_host, 1234),
            "headers": [(k.encode(), v.encode()) for k, v in headers.items()],
        }
    )


def test_terminate_is_for_the_local_shell_only():
    may = main._may_terminate
    # The desktop shell: main process (no browser headers) or renderer fetch.
    assert may(_request("127.0.0.1"))
    assert may(_request("127.0.0.1", origin="app://."))
    assert may(_request("127.0.0.1", origin="http://localhost:5173"))
    # Another machine.
    assert not may(_request("192.168.1.20"))
    # A web page: <img src>, or fetch from a foreign origin.
    assert not may(_request("127.0.0.1", **{"sec-fetch-site": "cross-site"}))
    assert not may(_request("127.0.0.1", origin="https://evil.example"))


def test_terminate_refuses_a_cross_site_page(test_client: TestClient):
    response = test_client.get("/terminate", headers={"sec-fetch-site": "cross-site"})
    assert response.status_code == 403
    assert test_client.get("/health").status_code == 200


def test_local_server_ignores_foreign_host_headers(test_client: TestClient):
    """DNS rebinding: the page's hostname resolves to 127.0.0.1 but the Host
    header still names it."""
    assert (
        test_client.get("/health", headers={"host": "evil.example"}).status_code == 400
    )
    assert (
        test_client.get("/health", headers={"host": "localhost:5678"}).status_code
        == 200
    )
    assert (
        test_client.get("/health", headers={"host": "127.0.0.1:5678"}).status_code
        == 200
    )


@pytest.mark.parametrize(
    "origin,allowed",
    [
        ("https://trilogydata.dev", True),
        ("app://.", True),
        ("http://localhost:5173", True),
        # The dots used to be regex wildcards.
        ("https://trilogydataxdev", False),
        ("https://trilogy-data.github.io.evil.example", False),
        ("https://evil.example", False),
    ],
)
def test_cors_origins(test_client: TestClient, origin, allowed):
    response = test_client.get("/health", headers={"origin": origin})
    assert (response.headers.get("access-control-allow-origin") == origin) is allowed
    assert "access-control-allow-credentials" not in response.headers


def test_large_in_filter_is_prepared_in_linear_time():
    """One parameter per selected value: 5,000 values took over a minute."""
    env = parse_env_from_full_model(
        ModelInSchema.model_validate(
            {"name": "m", "sources": [{"alias": "m", "contents": "key d date;"}]}
        ).sources
    )
    env.parse("import m as m;")
    parameters: dict[str, str | int | float] = {
        f":d_abc_{i}": "2024-01-01" for i in range(5000)
    }
    filters = [f"m.d in ({', '.join(parameters)})", "m.d >= :lo"]
    parameters[":lo"] = "2024-01-01T00:00:00Z"

    started = time.perf_counter()
    declarations, cleaned, kwargs = prepare_filter_params(filters, parameters, env)
    assert time.perf_counter() - started < 2

    assert ":" not in cleaned[0] and cleaned[1] == "m.d >= lo"
    assert len(kwargs) == 5001
    # Typed from the concept it is compared to, and the value normalized.
    assert "parameter lo date;" in declarations
    assert kwargs["lo"] == "2024-01-01"


def test_param_colons_are_stripped_only_for_declared_parameters():
    _, cleaned, _ = prepare_filter_params(
        ["a = :p1 and b = :p10 and c = '2020'::date and d = :other"],
        {":p1": 1, ":p10": 2},
    )
    assert cleaned == ["a = p1 and b = p10 and c = '2020'::date and d = :other"]
