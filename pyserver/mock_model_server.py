"""
Minimal FastAPI server for testing generic model store functionality.

This server serves a basic example model index and model files for E2E testing
of the generic store feature in Trilogy Studio.

Run with: uvicorn mock_model_server:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Mock Model Store", version="1.0.0")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Example model data
EXAMPLE_MODEL = {
    "name": "Example DuckDB Model",
    "description": "A simple example model for testing the generic store feature. This model demonstrates the basic structure required for Trilogy models.",
    "engine": "duckdb",
    "components": [
        {
            "url": "https://raw.githubusercontent.com/trilogy-data/trilogy-public-models/main/duckdb/titanic/titanic.preql",
            "name": "Example Query",
            "type": "trilogy",
            "purpose": "Sample Trilogy query"
        }
    ]
}

EXAMPLE_BIGQUERY_MODEL = {
    "name": "Example BigQuery Model",
    "description": "A sample BigQuery model for testing multiple engines in the generic store.",
    "engine": "bigquery",
    "components": [
        {
            "url": "https://example.com/sample.sql",
            "name": "Sample Query",
            "type": "sql",
            "purpose": "Example SQL query"
        }
    ]
}


@app.get("/")
async def root():
    """Root endpoint with server information."""
    return {
        "message": "Mock Model Store Server",
        "description": "Serves example models for testing generic store functionality",
        "endpoints": {
            "/index.json": "Get list of available models",
            "/models/example-duckdb.json": "Get example DuckDB model",
            "/models/example-bigquery.json": "Get example BigQuery model"
        }
    }


@app.get("/index.json")
async def get_index():
    """
    Return the store index with list of available models.

    This follows the StoreIndex interface:
    {
        "name": "Store Name",
        "models": [
            {"name": "Display Name", "url": "Full URL to model JSON"}
        ]
    }
    """
    return {
        "name": "Mock Development Store",
        "models": [
            {
                "name": "Example DuckDB Model",
                "url": "http://localhost:8000/models/example-duckdb.json"
            },
            {
                "name": "Example BigQuery Model",
                "url": "http://localhost:8000/models/example-bigquery.json"
            }
        ]
    }


@app.get("/models/example-duckdb.json")
async def get_duckdb_model():
    """Return the example DuckDB model."""
    return EXAMPLE_MODEL


@app.get("/models/example-bigquery.json")
async def get_bigquery_model():
    """Return the example BigQuery model."""
    return EXAMPLE_BIGQUERY_MODEL


if __name__ == "__main__":
    import uvicorn
    print("Starting Mock Model Store Server on http://localhost:8000")
    print("Access the index at: http://localhost:8000/index.json")
    uvicorn.run(app, host="0.0.0.0", port=8000)
