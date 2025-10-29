from fastapi.testclient import TestClient
from io_models import (
    ModelInSchema,
    ModelSourceInSchema,
    FormatQueryOutSchema,
    QueryInSchema,
    DrilldownQueryInSchema,
    Import,
)


def test_read_main(test_client: TestClient):
    response = test_client.get("/")
    assert response.status_code == 200


def test_model_response(test_client: TestClient):

    model = ModelInSchema(
        name="test_parse",
        sources=[
            ModelSourceInSchema(
                alias="test",
                contents="""key cuid int; 
property cuid.name string;
auto customer_count <- count(cuid);

datasource customers (
    id: cuid,
    name: name,
)
grain (cuid,)
query '''
select 1 as id, 'bob' as name
union all
select 2 as id, 'fred' as name
union all
select 3 as id, 'alice' as name
'''
;
""",
            )
        ],
    )

    response = test_client.post("/parse_model", data=model.model_dump_json())  # type: ignore
    assert response.status_code == 200
    assert response.json()["sources"][0]["concepts"][0]["address"] == "local.cuid"


def test_format_query(test_client: TestClient):

    request = QueryInSchema(
        imports=[],
        query="select name, customer_count;",
        dialect="duck_db",
        full_model=ModelInSchema(
            name="test_parse",
            sources=[
                ModelSourceInSchema(
                    alias="test",
                    contents="""key cuid int; 
property cuid.name string;
auto customer_count <- count(cuid);     
datasource customers (
    id: cuid,
    name: name,
)
grain (cuid,)
query '''
select 1 as id, 'bob' as name
union all
select 2 as id, 'fred' as name
union all
select 3 as id, 'alice' as name
'''
;""",
                )
            ],
        ),
    )
    response = test_client.post("/format_query", data=request.model_dump_json())  # type: ignore
    assert response.status_code == 200
    assert "customer_count" in response.json()["text"]


def test_drilldown_query(test_client: TestClient):

    request = DrilldownQueryInSchema(
        imports=[
            Import(
                name="test",
                alias="",
            )
        ],
        query="select name, customer_count;",
        dialect="duck_db",
        drilldown_remove="name",
        drilldown_add=["last_name"],
        drilldown_filter="local.name='bob'",
        full_model=ModelInSchema(
            name="test_parse",
            sources=[
                ModelSourceInSchema(
                    alias="test",
                    contents="""key cuid int; 
property cuid.name string;
property cuid.last_name string;
auto customer_count <- count(cuid);     
datasource customers (
    id: cuid,
    name,
    last_name
)
grain (cuid,)
query '''
select 1 as id, 'bob' as name   , 'smith' as last_name
union all
select 2 as id, 'fred' as name   , 'johnson' as last_name
union all
select 3 as id, 'alice' as name , 'williams' as last_name
'''
;""",
                )
            ],
        ),
    )
    response = test_client.post("/drilldown_query", data=request.model_dump_json())  # type: ignore
    assert response.status_code == 200
    assert (
        response.json()["text"]
        == """import test;

WHERE
    name = 'bob'
SELECT
    last_name,
    customer_count,
;"""
    ), response.json()["text"]


# def test_read_models(test_client: TestClient):
#     response = test_client.get("/models")
#     assert response.status_code == 200

#     arguments: List[Mapping[str, str | None | dict[str, str | None | list]]] = [
#         {
#             "name": "test-duck",
#             "dialect": "duck_db",
#             "model": list(public_models.keys())[0],
#             "extra": None,
#         },
#         {
#             "name": "test-duck",
#             "dialect": "duck_db",
#             "model": None,
#             "extra": None,
#             "full_model": {"name": "fix-names-2", "sources": []},
#         },
#     ]

#     for arg in arguments:
#         parsed = ConnectionInSchema.model_validate(arg)

#         response = test_client.post("/connection", data=parsed.model_dump_json())  # type: ignore
#         assert response.status_code == 200


# def test_gen_ai(test_client: TestClient):
#     arguments: List[
#         Mapping[str, str | Provider | None | dict[str, str | None | list]]
#     ] = [
#         {"name": "test-openai", "provider": Provider.OPENAI, "apiKey": "fake-key"},
#     ]

#     for arg in arguments:
#         parsed = GenAIConnectionInSchema.model_validate(arg)
#         response = test_client.post("/gen_ai_connection", data=parsed.model_dump_json(by_alias=True))  # type: ignore # noqa: E501
#         assert response.status_code == 403
