"""
Minimal FastAPI server for testing generic model store functionality.

This server serves a basic example model index and model files for E2E testing
of the generic store feature in Trilogy Studio.

Run with: python mock_model_server.py
Or: uvicorn mock_model_server:app --reload --port 8100
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

PORT = 8100
BASE_URL = f"http://localhost:{PORT}"


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
            url=f"{BASE_URL}/dashboards/example-dashboard.json",
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
            "content": "select unnest(['first', 'second', 'third']) as class, unnest([1,2,45]) as passenger_id.count;",
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
    "description": "Example dashboard.",
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
                url=f"{BASE_URL}/models/example-duckdb.json",
            ),
            StoreModelIndex(
                name="Example BigQuery Model",
                url=f"{BASE_URL}/models/example-bigquery.json",
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


class ShareLinkRequest(BaseModel):
    """Request parameters for generating a share link"""

    model: str  # Model name from the store
    asset_name: str  # Asset (dashboard or editor) name to open
    asset_type: str = "dashboard"  # Asset type: dashboard, editor, trilogy
    base_app_url: str = "http://localhost:5173"  # Base URL of the app


class ShareLinkResponse(BaseModel):
    """Response containing both readable and encoded share links"""

    readable: str
    encoded: str
    model_url: str
    store_url: str


@app.post("/share-link", response_model=ShareLinkResponse)
async def generate_share_link(request: ShareLinkRequest) -> ShareLinkResponse:
    """
    Generate a share link for importing a model and opening an asset.

    This endpoint creates URLs that can be shared to allow others to:
    1. Register the model store automatically
    2. Import the specified model
    3. Open the specified asset (dashboard or editor)

    Example usage:
    POST /share-link
    {
        "model": "example-duckdb",
        "asset_name": "Example DuckDB Dashboard",
        "asset_type": "dashboard",
        "base_app_url": "http://localhost:5173"
    }
    """
    from urllib.parse import quote

    from fastapi import HTTPException

    # Map model names to their URLs
    model_urls = {
        "example-duckdb": f"{BASE_URL}/models/example-duckdb.json",
        "example-bigquery": f"{BASE_URL}/models/example-bigquery.json",
    }

    # Map model names to their model config names
    model_names = {
        "example-duckdb": EXAMPLE_MODEL.name,
        "example-bigquery": EXAMPLE_BIGQUERY_MODEL.name,
    }

    # Map model names to their engines (connection types)
    model_engines = {
        "example-duckdb": EXAMPLE_MODEL.engine,
        "example-bigquery": EXAMPLE_BIGQUERY_MODEL.engine,
    }

    if request.model not in model_urls:
        raise HTTPException(
            status_code=404,
            detail=f"Model '{request.model}' not found. Available: {list(model_urls.keys())}",
        )

    model_url = model_urls[request.model]
    model_name = model_names[request.model]
    engine = model_engines[request.model]
    store_url = BASE_URL

    # Build the readable URL (human-friendly, not encoded)
    readable_params = f"#skipTips=true&screen=asset-import&import={model_url}&store={store_url}&assetType={request.asset_type}&assetName={request.asset_name}&modelName={model_name}&connection={engine}"
    readable_url = f"{request.base_app_url}{readable_params}"

    # Build the encoded URL (safe for sharing)
    encoded_params = (
        f"#skipTips=true"
        f"&screen=asset-import"
        f"&import={quote(model_url, safe='')}"
        f"&store={quote(store_url, safe='')}"
        f"&assetType={quote(request.asset_type, safe='')}"
        f"&assetName={quote(request.asset_name, safe='')}"
        f"&modelName={quote(model_name, safe='')}"
        f"&connection={quote(engine, safe='')}"
    )
    encoded_url = f"{request.base_app_url}{encoded_params}"

    return ShareLinkResponse(
        readable=readable_url,
        encoded=encoded_url,
        model_url=model_url,
        store_url=store_url,
    )


@app.get("/share-link/example-dashboard")
async def get_example_dashboard_share_link(
    base_app_url: str = "http://localhost:5173",
) -> ShareLinkResponse:
    """
    Convenience endpoint to get a share link for the example DuckDB dashboard.

    Query params:
    - base_app_url: The base URL of the app (default: http://localhost:5173)
    """
    from urllib.parse import quote

    model_url = f"{BASE_URL}/models/example-duckdb.json"
    store_url = BASE_URL
    model_name = EXAMPLE_MODEL.name
    asset_name = "Example DuckDB Dashboard"
    asset_type = "dashboard"
    engine = EXAMPLE_MODEL.engine

    # Build the readable URL
    readable_params = f"#skipTips=true&screen=asset-import&import={model_url}&store={store_url}&assetType={asset_type}&assetName={asset_name}&modelName={model_name}&connection={engine}"
    readable_url = f"{base_app_url}{readable_params}"

    # Build the encoded URL
    encoded_params = (
        f"#skipTips=true"
        f"&screen=asset-import"
        f"&import={quote(model_url, safe='')}"
        f"&store={quote(store_url, safe='')}"
        f"&assetType={quote(asset_type, safe='')}"
        f"&assetName={quote(asset_name, safe='')}"
        f"&modelName={quote(model_name, safe='')}"
        f"&connection={quote(engine, safe='')}"
    )
    encoded_url = f"{base_app_url}{encoded_params}"

    return ShareLinkResponse(
        readable=readable_url,
        encoded=encoded_url,
        model_url=model_url,
        store_url=store_url,
    )


@app.get("/share-link/example-editor")
async def get_example_editor_share_link(
    base_app_url: str = "http://localhost:5173",
) -> ShareLinkResponse:
    """
    Convenience endpoint to get a share link for the example trilogy editor.

    Query params:
    - base_app_url: The base URL of the app (default: http://localhost:5173)
    """
    from urllib.parse import quote

    model_url = f"{BASE_URL}/models/example-duckdb.json"
    store_url = BASE_URL
    model_name = EXAMPLE_MODEL.name
    # Get the trilogy component name from the model
    trilogy_component = next(
        (c for c in EXAMPLE_MODEL.components if c.type == "trilogy"), None
    )
    asset_name = trilogy_component.name if trilogy_component else "Example Query"
    asset_type = "trilogy"
    engine = EXAMPLE_MODEL.engine

    # Build the readable URL
    readable_params = f"#skipTips=true&screen=asset-import&import={model_url}&store={store_url}&assetType={asset_type}&assetName={asset_name}&modelName={model_name}&connection={engine}"
    readable_url = f"{base_app_url}{readable_params}"

    # Build the encoded URL
    encoded_params = (
        f"#skipTips=true"
        f"&screen=asset-import"
        f"&import={quote(model_url, safe='')}"
        f"&store={quote(store_url, safe='')}"
        f"&assetType={quote(asset_type, safe='')}"
        f"&assetName={quote(asset_name, safe='')}"
        f"&modelName={quote(model_name, safe='')}"
        f"&connection={quote(engine, safe='')}"
    )
    encoded_url = f"{base_app_url}{encoded_params}"

    return ShareLinkResponse(
        readable=readable_url,
        encoded=encoded_url,
        model_url=model_url,
        store_url=store_url,
    )


if __name__ == "__main__":
    import uvicorn

    print(f"Starting Mock Model Store Server on http://localhost:{PORT}")
    print(f"Access the index at: http://localhost:{PORT}/index.json")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
