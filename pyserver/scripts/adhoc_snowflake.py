import requests
import base64
import json
import time
import uuid


def snowflake_rest_auth(account, username, password):
    """
    Authenticate with Snowflake using basic auth and get a session token
    """
    # Construct the Snowflake login endpoint URL
    base_url = f"https://{account}.snowflakecomputing.com"
    login_url = f"{base_url}/session/v1/login-request"

    # Create basic auth credentials
    credentials = f"{username}:{password}"
    encoded_credentials = base64.b64encode(credentials.encode("utf-8")).decode("utf-8")

    # Set up headers
    headers = {
        "Authorization": f"Basic {encoded_credentials}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "PythonRestExample/1.0",
    }

    # Create login request payload
    data = {
        "data": {"ACCOUNT_NAME": account, "LOGIN_NAME": username, "PASSWORD": password}
    }

    # Make the authentication request
    response = requests.post(login_url, headers=headers, json=data)

    if response.status_code != 200:
        print(f"Authentication failed: {response.status_code}")
        print(response.text)
        return None, None

    # Extract session token and master token from response
    response_data = response.json()
    session_token = response_data.get("data", {}).get("token")
    master_token = response_data.get("data", {}).get("masterToken")
    print(response_data)
    return session_token, master_token, base_url


def get_results(base_url, location, session_token):
    """
    Get query results from a given location URL
    """
    if not location:
        return "No location header returned"

    result_url = f"{base_url}{location}"
    headers = {
        "Authorization": f'Snowflake Token="{session_token}"',
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "PythonRestExample/1.0",
    }

    response = requests.get(result_url, headers=headers)

    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error getting results: {response.status_code}")
        print(response.text)
        response.raise_for_status()
        return f"Error: {response.text}"


def execute_snowflake_query(
    account, username, password, warehouse, database, schema, query
):
    """
    Execute a SQL query on Snowflake using REST API
    """
    # First authenticate to get tokens
    session_token, master_token, base_url = snowflake_rest_auth(
        account, username, password
    )

    if not session_token or not master_token:
        return "Authentication failed"

    # Construct the query endpoint URL
    # Construct the query endpoint URL (using the queries/v1 endpoint)
    query_url = f"{base_url}/queries/v1/query-request?requestId={uuid.uuid4()}"

    # Set up headers with session token
    headers = {
        "Authorization": f'Snowflake Token="{session_token}"',
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    # Create query request payload
    payload = {
        "sqlText": query,
        "asyncExec": True,
        "sequenceId": 1,
        "querySubmissionTime": int(time.time()),
        "bindings": {},
    }

    # Execute the query
    response = requests.post(query_url, headers=headers, json=payload)

    if response.status_code in (200, 202):  # Asynchronous execution
        # Get the statement handle from the Location header
        payload = response.json()
        print(payload)
        poll_for_results(base_url, payload["data"]["queryId"], session_token)
        return get_results(base_url, payload["data"]["getResultUrl"], session_token)
    elif response.status_code == 200:  # Synchronous execution
        return response.json()
    else:
        print(f"Query execution failed: {response.status_code}")
        print(response.text)
        response.raise_for_status()
        return f"Error: {response.text}"


def poll_for_results(base_url, queryId, session_token):

    max_attempts = 10
    attempt = 0

    while attempt < max_attempts:
        response = requests.get(
            url=f"{base_url}/monitoring/queries/{queryId}",
            headers={
                "content-type": "application/json",
                "accept": "application/json",
                "authorization": f'Snowflake Token="{session_token}"',
            },
        )

        if response.status_code == 200:
            # Results are ready
            return response.json()
        elif response.status_code == 202:
            # Still processing, wait and retry
            attempt += 1
            time.sleep(1)
        else:
            return (
                f"Error polling for results: {response.status_code} - {response.text}"
            )

    return "Max polling attempts reached, query results not available"


# def poll_for_results(base_url, location, session_token):
#     """
#     Poll for query results until they're ready
#     """
#     if not location:
#         return "No location header returned"

#     result_url = f"{base_url}{location}"
#     headers = {
#         "Authorization": f'Snowflake Token="{session_token}"',
#         "Content-Type": "application/json",
#         "Accept": "application/json",
#         "User-Agent": "PythonRestExample/1.0",
#     }

#     max_attempts = 10
#     attempt = 0

#     while attempt < max_attempts:
#         response = requests.get(result_url, headers=headers)

#         if response.status_code == 200:
#             # Results are ready
#             return response.json()
#         elif response.status_code == 202:
#             # Still processing, wait and retry
#             attempt += 1
#             time.sleep(1)
#         else:
#             return (
#                 f"Error polling for results: {response.status_code} - {response.text}"
#             )

#     return "Max polling attempts reached, query results not available"


# Usage example
if __name__ == "__main__":
    # Replace these with your Snowflake credentials
    account = "###"  # e.g., "xy12345.us-east-1" (without .snowflakecomputing.com)
    username = "###"
    password = "####"
    warehouse = "your_warehouse"
    database = "your_database"
    schema = "your_schema"

    # Execute a simple query
    query = "SELECT 1"
    result = execute_snowflake_query(
        account, username, password, warehouse, database, schema, query
    )

    print("Query Result:")
    print(json.dumps(result, indent=2))
