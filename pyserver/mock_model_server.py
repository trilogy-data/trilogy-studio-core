"""
Minimal FastAPI server for testing generic model store functionality.

This server conforms to the Remote Store Contract documented in
docs/remote-store-contract.md. It serves an index, file CRUD endpoints, and
the legacy /models/*.json endpoints used by the community-model browser.

Run with: python mock_model_server.py
Or: uvicorn mock_model_server:app --reload --port 8100
"""

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
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

PORT = int(os.getenv("MOCK_MODEL_SERVER_PORT", "8100"))
BASE_URL = f"http://localhost:{PORT}"

# Directory that backs the /files endpoints. Kept alongside the mock server
# so contributors can poke at real files on disk while iterating.
FILES_ROOT = Path(
    os.getenv(
        "MOCK_MODEL_SERVER_FILES_ROOT", Path(__file__).parent / "mock_store_files"
    )
).resolve()

# Extensions the write endpoints accept — matches the contract.
ALLOWED_WRITE_EXTENSIONS = {".preql", ".sql", ".csv", ".py"}

# Extensions the editor snapshot enumerates (csv is writable but not editable).
EDITOR_EXTENSIONS = {".preql", ".sql", ".py"}


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


class ConnectionSpec(BaseModel):
    """Runtime connection declaration advertised in /index.json.

    Mirrors docs/remote-store-contract.md: only `type` is required. `options`
    holds non-secret connection fields; secrets (tokens, passwords, private
    keys) are never transmitted here.
    """

    type: str
    options: dict[str, str] = Field(default_factory=dict)


class StoreIndex(BaseModel):
    """Store index containing list of available models"""

    name: str
    project_name: Optional[str] = None
    connection: Optional[ConnectionSpec] = None
    models: list[StoreModelIndex]
    # Paths (posix, relative to the store root) that the server has declared
    # as startup scripts via trilogy.toml's [setup] section. Clients add
    # EditorTag.STARTUP_SCRIPT to editors matching these paths so they run
    # on connection reset.
    startup_scripts: list[str] = Field(default_factory=list)


class StoreDirectoryListing(BaseModel):
    """One directory-listing entry in the /files response."""

    directory: str
    files: list[str]


class StoreFilesResponse(BaseModel):
    directories: list[StoreDirectoryListing]


class CreateFileRequest(BaseModel):
    path: str
    content: str


class UpdateFileRequest(BaseModel):
    content: str


# Example model data
EXAMPLE_MODEL = ModelImport(
    name="Example DuckDB Model",
    description="A simple example model for testing the generic store feature. This model demonstrates the basic structure required for Trilogy models.",
    engine="duckdb",
    link="https://github.com/trilogy-data/trilogy-public-models",
    tags=["example", "duckdb"],
    components=[
        ImportFile(
            url=f"{BASE_URL}/files/example.preql",
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

EXAMPLE_PREQL_SEED = """key example int;
property example.name string;

# one trivial row so the example store exercises the editor code path
datasource seed (
    example: example,
    name: name,
)
grain (example)
query '''
select 1 as example, 'hello' as name
''';
"""

# Advertised to clients via /index.json `startup_scripts`. Keeping it as a
# module-level constant means the seeder, the endpoint, and any test can agree
# on one source of truth.
EXAMPLE_STARTUP_SQL_SEED = (
    "-- Runs when the remote-backed connection resets.\n"
    "CREATE TABLE IF NOT EXISTS mock_setup_marker (ran_at TIMESTAMP);\n"
    "INSERT INTO mock_setup_marker VALUES (CURRENT_TIMESTAMP);\n"
)
EXAMPLE_STARTUP_SCRIPTS = ["setup.sql"]


def seed_files_root() -> None:
    """Ensure the files directory exists with at least one .preql file."""
    FILES_ROOT.mkdir(parents=True, exist_ok=True)
    seed_path = FILES_ROOT / "example.preql"
    if not seed_path.exists():
        seed_path.write_text(EXAMPLE_PREQL_SEED, encoding="utf-8")
    setup_path = FILES_ROOT / "setup.sql"
    if not setup_path.exists():
        setup_path.write_text(EXAMPLE_STARTUP_SQL_SEED, encoding="utf-8")


def resolve_store_path(path: str) -> Path:
    """Resolve a relative store path against FILES_ROOT, rejecting traversal."""
    if not path or path.startswith("/") or ".." in Path(path).parts:
        raise HTTPException(status_code=400, detail=f"Invalid path: {path!r}")
    candidate = (FILES_ROOT / path).resolve()
    try:
        candidate.relative_to(FILES_ROOT)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid path: {path!r}")
    return candidate


def ensure_allowed_extension(path: str) -> None:
    suffix = Path(path).suffix.lower()
    if suffix not in ALLOWED_WRITE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Extension {suffix!r} is not writable. Allowed: {sorted(ALLOWED_WRITE_EXTENSIONS)}",
        )


seed_files_root()


@app.get("/")
async def root() -> dict[str, object]:
    """Root endpoint with server information."""
    return {
        "message": "Mock Model Store Server",
        "description": "Serves example models for testing generic store functionality",
        "endpoints": {
            "/index.json": "Get store index (name, project_name, connection, models)",
            "/files": "List files in the store",
            "/files/{path}": "GET / PUT / DELETE file content",
            "/models/example-duckdb.json": "Get example DuckDB model",
            "/models/example-bigquery.json": "Get example BigQuery model",
        },
    }


@app.get("/index.json", response_model=StoreIndex)
async def get_index() -> StoreIndex:
    """Return the store index with runtime connection declaration."""
    return StoreIndex(
        name="Mock Development Store",
        project_name="mock_dev_store",
        connection=ConnectionSpec(type="duckdb", options={}),
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
        startup_scripts=list(EXAMPLE_STARTUP_SCRIPTS),
    )


@app.get("/files", response_model=StoreFilesResponse)
async def list_files() -> StoreFilesResponse:
    """List files grouped by directory, using literal '/' separators."""
    directories: dict[str, list[str]] = {}
    for entry in sorted(FILES_ROOT.rglob("*")):
        if not entry.is_file():
            continue
        rel = entry.relative_to(FILES_ROOT)
        parent = rel.parent.as_posix()
        directory_key = "" if parent == "." else parent
        directories.setdefault(directory_key, []).append(entry.name)

    listings = [
        StoreDirectoryListing(directory=key, files=sorted(files))
        for key, files in sorted(directories.items())
    ]
    return StoreFilesResponse(directories=listings)


@app.get("/files/{path:path}")
async def get_file(path: str) -> Response:
    """Fetch raw file content. 404 if the file is absent."""
    target = resolve_store_path(path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    return Response(content=target.read_bytes(), media_type="text/plain; charset=utf-8")


@app.post("/files", status_code=201)
async def create_file(request: CreateFileRequest) -> Response:
    """Create a file. 409 if it already exists."""
    ensure_allowed_extension(request.path)
    target = resolve_store_path(request.path)
    if target.exists():
        raise HTTPException(
            status_code=409, detail=f"File already exists: {request.path}"
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(request.content, encoding="utf-8")
    return Response(status_code=201)


@app.put("/files/{path:path}")
async def update_file(path: str, request: UpdateFileRequest) -> Response:
    """Overwrite a file. 404 if it doesn't exist."""
    ensure_allowed_extension(path)
    target = resolve_store_path(path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    target.write_text(request.content, encoding="utf-8")
    return Response(status_code=200)


@app.delete("/files/{path:path}", status_code=204)
async def delete_file(path: str) -> Response:
    """Delete a file. 404 if already absent."""
    target = resolve_store_path(path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    target.unlink()
    return Response(status_code=204)


@app.get("/models/example-duckdb.json", response_model=ModelImport)
async def get_duckdb_model() -> ModelImport:
    """Return the example DuckDB model."""
    return EXAMPLE_MODEL


@app.get("/models/example-bigquery.json", response_model=ModelImport)
async def get_bigquery_model() -> ModelImport:
    """Return the example BigQuery model."""
    return EXAMPLE_BIGQUERY_MODEL


@app.get("/dashboards/example-dashboard.json")
async def get_example_dashboard() -> dict:
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
    """Generate a share link for importing a model and opening an asset.

    Mock-only convenience — NOT part of the production contract.
    """
    from urllib.parse import quote

    model_urls = {
        "example-duckdb": f"{BASE_URL}/models/example-duckdb.json",
        "example-bigquery": f"{BASE_URL}/models/example-bigquery.json",
    }

    model_names = {
        "example-duckdb": EXAMPLE_MODEL.name,
        "example-bigquery": EXAMPLE_BIGQUERY_MODEL.name,
    }

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

    readable_params = f"#skipTips=true&screen=asset-import&import={model_url}&store={store_url}&assetType={request.asset_type}&assetName={request.asset_name}&modelName={model_name}&connection={engine}"
    readable_url = f"{request.base_app_url}{readable_params}"

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
    """Mock-only convenience for the example DuckDB dashboard."""
    from urllib.parse import quote

    model_url = f"{BASE_URL}/models/example-duckdb.json"
    store_url = BASE_URL
    model_name = EXAMPLE_MODEL.name
    asset_name = "Example DuckDB Dashboard"
    asset_type = "dashboard"
    engine = EXAMPLE_MODEL.engine

    readable_params = f"#skipTips=true&screen=asset-import&import={model_url}&store={store_url}&assetType={asset_type}&assetName={asset_name}&modelName={model_name}&connection={engine}"
    readable_url = f"{base_app_url}{readable_params}"

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
    """Mock-only convenience for the example trilogy editor."""
    from urllib.parse import quote

    model_url = f"{BASE_URL}/models/example-duckdb.json"
    store_url = BASE_URL
    model_name = EXAMPLE_MODEL.name
    trilogy_component = next(
        (c for c in EXAMPLE_MODEL.components if c.type == "trilogy"), None
    )
    asset_name = trilogy_component.name if trilogy_component else "Example Query"
    asset_type = "trilogy"
    engine = EXAMPLE_MODEL.engine

    readable_params = f"#skipTips=true&screen=asset-import&import={model_url}&store={store_url}&assetType={asset_type}&assetName={asset_name}&modelName={model_name}&connection={engine}"
    readable_url = f"{base_app_url}{readable_params}"

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
    print(f"Files root: {FILES_ROOT}")
    print(f"Access the index at: http://localhost:{PORT}/index.json")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
