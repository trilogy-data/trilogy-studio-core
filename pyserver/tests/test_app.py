from fastapi.testclient import TestClient
from ..io_models import (
    ConnectionInSchema,
    parse_env_from_full_model,
    ModelInSchema,
)
from ..io_models import ModelSourceInSchema, GenAIConnectionInSchema
from typing import List, Mapping


def test_read_main(test_client: TestClient):
    response = test_client.get("/")
    assert response.status_code == 200


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


def test_parse_full():
    input = ModelInSchema(
        name="test",
        sources=[
            ModelSourceInSchema(alias="", contents="select test.constant;"),
            ModelSourceInSchema(alias="test", contents="const constant <-1;"),
        ],
    )
    parse_env_from_full_model(input)

    test = {
        "name": "bigquery.google_analytics",
        "sources": [
            {
                "alias": "fundiverse",
                "contents": "\nkey user_pseudo_id int;\n\ndatasource fundiverse(\n    event_date: generic.event_date,\n    user_pseudo_id: user_pseudo_id,\n    event_time: generic.event_time,\n)\ngrain (generic.event_time)\naddress `preqldata.analytics_411641820.events_*`\n;",  # noqa: E501
            },
            {
                "alias": "pypreql",
                "contents": "\nkey user_pseudo_id int;\n\ndatasource pypreql(\n    event_date: generic.event_date,\n    user_pseudo_id: user_pseudo_id,\n    event_time: generic.event_time,\n)\ngrain (generic.event_time)\naddress `preqldata.analytics_417320071.events_*`\n;",  # noqa: E501
            },
            {
                "alias": "generic",
                "contents": "\n\nkey event_time int;\nkey event_date string;\n\n",
            },
        ],
    }
    input = ModelInSchema.model_validate(test)

    parse_env_from_full_model(input)