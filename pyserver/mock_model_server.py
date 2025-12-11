"""
Minimal FastAPI server for testing generic model store functionality.

This server serves a basic example model index and model files for E2E testing
of the generic store feature in Trilogy Studio.

Run with: uvicorn mock_model_server:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

app = FastAPI(title="Mock Model Store", version="1.0.0")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic Models
class ImportFile(BaseModel):
    """Component file in a model import"""

    url: str
    name: str
    alias: str = ""
    purpose: str
    type: Optional[str] = None


class ModelImport(BaseModel):
    """Model import definition"""

    name: str
    engine: str
    description: str
    link: str = ""
    tags: list[str] = Field(default_factory=list)
    components: list[ImportFile]


class StoreModelIndex(BaseModel):
    """Individual model entry in the store index"""

    name: str
    url: str


class StoreIndex(BaseModel):
    """Store index containing list of available models"""

    name: str
    models: list[StoreModelIndex]


# Example model data
EXAMPLE_MODEL = ModelImport(
    name="Example DuckDB Model",
    description="A simple example model for testing the generic store feature. This model demonstrates the basic structure required for Trilogy models.",
    engine="duckdb",
    link="https://github.com/trilogy-data/trilogy-public-models",
    tags=["example", "duckdb"],
    components=[
        ImportFile(
            url="https://raw.githubusercontent.com/trilogy-data/trilogy-public-models/main/duckdb/titanic/titanic.preql",
            name="Example Query",
            alias="example",
            type="trilogy",
            purpose="source",
        ),
        ImportFile(
            url="http://localhost:8000/dashboards/example-dashboard.json",
            name="Example Dashboard",
            alias="",
            type="dashboard",
            purpose="visualization",
        ),
    ],
)

EXAMPLE_BIGQUERY_MODEL = ModelImport(
    name="Example BigQuery Model",
    description="A sample BigQuery model for testing multiple engines in the generic store.",
    engine="bigquery",
    link="https://cloud.google.com/bigquery",
    tags=["example", "bigquery"],
    components=[
        ImportFile(
            url="https://example.com/sample.sql",
            name="Sample Query",
            alias="sample",
            type="sql",
            purpose="source",
        )
    ],
)

# Dashboard example data
EXAMPLE_DASHBOARD = {
    "name": "Example DuckDB Dashboard",
    "layout": [{"x": 0, "y": 0, "w": 10, "h": 13, "i": "0"}],
    "gridItems": {
        "0": {
            "type": "chart",
            "content": "select class, passenger_id.count;",
            "name": "Passenger Class Distribution",
            "width": 1108,
            "height": 475,
            "allowCrossFilter": True,
            "chartConfig": {
                "chartType": "barh",
                "xField": "passenger_id_count",
                "yField": "class",
                "yField2": "",
                "colorField": "",
                "sizeField": "",
                "groupField": "",
                "trellisField": "",
                "geoField": "",
                "annotationField": "",
                "hideLegend": False,
                "showTitle": True,
            },
            "chartFilters": [],
            "filters": [],
            "conceptFilters": [],
            "parameters": {},
        }
    },
    "nextId": 1,
    "createdAt": "2025-12-11T13:45:04.773Z",
    "updatedAt": "2025-12-11T13:45:14.721Z",
    "filter": None,
    "imports": [{"name": "example", "alias": ""}],
    "version": 1,
    "state": "editing",
    "description": "Example dashboard showing Titanic passenger data",
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
            "/models/example-bigquery.json": "Get example BigQuery model",
        },
    }


@app.get("/index.json", response_model=StoreIndex)
async def get_index() -> StoreIndex:
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
    return StoreIndex(
        name="Mock Development Store",
        models=[
            StoreModelIndex(
                name="Example DuckDB Model",
                url="http://localhost:8000/models/example-duckdb.json",
            ),
            StoreModelIndex(
                name="Example BigQuery Model",
                url="http://localhost:8000/models/example-bigquery.json",
            ),
        ],
    )


@app.get("/models/example-duckdb.json", response_model=ModelImport)
async def get_duckdb_model() -> ModelImport:
    """Return the example DuckDB model."""
    return EXAMPLE_MODEL


@app.get("/models/example-bigquery.json", response_model=ModelImport)
async def get_bigquery_model() -> ModelImport:
    """Return the example BigQuery model."""
    return EXAMPLE_BIGQUERY_MODEL


@app.get("/dashboards/example-dashboard.json")
async def get_example_dashboard():
    """Return the example dashboard."""
    return EXAMPLE_DASHBOARD

PORT = 8100

if __name__ == "__main__":
    import uvicorn

    print(f"Starting Mock Model Store Server on http://localhost:{PORT}")
    print(f"Access the index at: http://localhost:{PORT}/index.json")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
