import concurrent.futures
from io_models import QueryInSchema
from trilogy.parser import parse_text
from env_helpers import parse_env_from_full_model
from trilogy.render import get_dialect_generator
from fastapi.testclient import TestClient

X = {
    "query": "SELECT\r\n    names.state,\r\n    sum(names.total_births) as total_births\r\norder by\r\ntotal_births desc;",
    "dialect": "bigquery",
    "full_model": {
        "name": "",
        "sources": [
            {
                "alias": "names",
                "contents": "import std.date;\n\nkey id string; # Unique identifier for each row\nproperty id.name string; # Given name of a person at birth \nproperty id.gender string; # Sex (M=male or F=female) \nproperty id.state string; # The common two character abbreviation for a state, such as MA for Massachusetts or CT for Connecticut\nproperty id.year int::year; #\t4-digit year of birth \nproperty id.births int; # Number of occurrences of the name \nauto total_births <- sum(births); # Sum of name count along chosen dimensions\n\ndatasource usa_names(\n    raw('''FARM_FINGERPRINT(CONCAT(CAST(name AS STRING), cast(state as string),  cast(year as string), cast(gender as string)))'''):id,\n    name:name,\n    number:births,\n    year:year,\n    gender:gender,\n    state:state\n)\ngrain(id)\naddress `bigquery-public-data.usa_names.usa_1910_current`;\n",
            }
        ],
    },
    "imports": [{"name": "names", "alias": "names"}],
    "extra_filters": ["names.name='''Mary'''"],
    "parameters": {},
}


def test_read_main(test_client: TestClient):
    response = test_client.get("/")
    assert response.status_code == 200


def _generate_query_worker(test_client: TestClient, query_json: str):
    """Worker function to execute a single API call"""
    response = test_client.post("generate_query", data=query_json) #type: ignore
    if response.status_code != 200:
        print(f"Error: {response.status_code} - {response.text}")
    return response.status_code


def test_generate_query_parallel(
    test_client: TestClient, num_requests=100, max_workers=20
):
    """Execute API requests in parallel using ThreadPoolExecutor"""
    query = QueryInSchema.model_validate(X)
    query_json = query.model_dump_json()
    response = test_client.post("/generate_query", data=query_json) #type: ignore
    response.raise_for_status()
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks to the executor
        futures = [
            executor.submit(_generate_query_worker, test_client, query_json)
            for _ in range(num_requests)
        ]

        # Collect results as they complete
        results = [
            future.result() for future in concurrent.futures.as_completed(futures)
        ]

    # Check that all requests succeeded
    assert all(status_code == 200 for status_code in results)


def _scale_worker(query_data):
    """Worker function to execute a single parsing and generation operation"""
    query = QueryInSchema(**query_data)
    env = parse_env_from_full_model(query.full_model.sources)
    dialect = get_dialect_generator(query.dialect)

    for imp in query.imports:
        if imp.alias:
            imp_string = f"import {imp.name} as {imp.alias};"
        else:
            imp_string = f"import {imp.name};"
        parse_text(imp_string, env)

    # Note: Fixing a syntax error in the original code
    # The original had: *, parsed = parse*text(query.query, env)
    # Corrected to:
    _, parsed = parse_text(query.query, env)

    final = parsed[-1]
    result = dialect.generate_queries(environment=env, statements=[final])
    return result


def test_scale_parallel(num_requests=50, max_workers=10):
    """Execute parsing and generation operations in parallel using ThreadPoolExecutor"""
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks to the executor
        futures = [executor.submit(_scale_worker, X) for _ in range(num_requests)]

        # Collect results as they complete
        results = [
            future.result() for future in concurrent.futures.as_completed(futures)
        ]

    return results
