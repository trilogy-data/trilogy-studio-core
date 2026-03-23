"""
Authenticated fixture-backed remote store server for Playwright tests.

This mirrors the remote store contract used by Trilogy Studio:
- /index.json
- /models/{name}.json
- /files
- /files/{path:path}
- POST/PUT/DELETE file CRUD

The server copies the provided fixture directory into a temporary workspace on
startup so tests can safely exercise write operations.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

PORT = int(os.getenv("MOCK_REMOTE_STORE_PORT", "8101"))
HOST = os.getenv("MOCK_REMOTE_STORE_HOST", "localhost")
BASE_URL = f"http://{HOST}:{PORT}"
AUTH_TOKEN = os.getenv("MOCK_REMOTE_STORE_TOKEN", "")
MODEL_NAME = os.getenv("MOCK_REMOTE_STORE_MODEL_NAME", "data")

DEFAULT_FIXTURE_ROOT = (
    Path(__file__).resolve().parent.parent / "e2e" / "fixtures" / "remote-store"
)
FIXTURE_ROOT = Path(
    os.getenv("MOCK_REMOTE_STORE_FIXTURE", str(DEFAULT_FIXTURE_ROOT))
).resolve()
WORK_ROOT = Path(tempfile.mkdtemp(prefix="trilogy-remote-store-fixture-")).resolve()

SUPPORTED_FILE_TYPES = {
    ".preql": ("trilogy", "source"),
    ".sql": ("sql", "source"),
    ".csv": ("csv", "data"),
}
WRITABLE_EXTENSIONS = set(SUPPORTED_FILE_TYPES)

app = FastAPI(title="Mock Remote Store", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StoreModelIndex(BaseModel):
    name: str
    url: str


class StoreIndex(BaseModel):
    name: str
    models: list[StoreModelIndex]


class ImportFile(BaseModel):
    url: str
    name: str
    alias: str = ""
    purpose: str
    type: str


class ModelImport(BaseModel):
    name: str
    engine: str
    description: str
    link: str = ""
    tags: list[str] = []
    components: list[ImportFile]


class FileCreateRequest(BaseModel):
    path: str
    content: str


class FileUpdateRequest(BaseModel):
    content: str


def require_auth(x_trilogy_token: Optional[str] = Header(default=None)) -> None:
    if AUTH_TOKEN and x_trilogy_token != AUTH_TOKEN:
        raise HTTPException(
            status_code=401, detail="Invalid or missing X-Trilogy-Token header"
        )


def initialize_workspace() -> None:
    if WORK_ROOT.exists():
        shutil.rmtree(WORK_ROOT)
    shutil.copytree(FIXTURE_ROOT, WORK_ROOT)


def normalize_relative_path(value: str) -> str:
    return value.replace("\\", "/").strip("/")


def resolve_store_path(relative_path: str) -> Path:
    normalized = normalize_relative_path(relative_path)
    if not normalized:
        raise HTTPException(status_code=400, detail="Path is required")

    resolved = (WORK_ROOT / normalized).resolve()
    try:
        resolved.relative_to(WORK_ROOT)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail="Path must stay within the served directory"
        ) from exc

    extension = resolved.suffix.lower()
    if extension not in WRITABLE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Path must end with .preql, .sql, or .csv",
        )

    return resolved


def iter_store_files() -> list[Path]:
    return sorted(
        path
        for path in WORK_ROOT.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_FILE_TYPES
    )


def build_file_listing() -> dict[str, list[str]]:
    directories: dict[str, list[str]] = defaultdict(list)
    for file_path in iter_store_files():
        relative_path = file_path.relative_to(WORK_ROOT).as_posix()
        parent = Path(relative_path).parent.as_posix()
        if parent == ".":
            parent = ""

        directories[parent].append(file_path.name)

        if parent:
            parts = parent.split("/")
            current = ""
            for part in parts:
                current = f"{current}/{part}" if current else part
                directories.setdefault(current, [])

    directories.setdefault("", [])
    return {
        directory: sorted(files) for directory, files in sorted(directories.items())
    }


def build_model_import(model_name: str) -> ModelImport:
    components: list[ImportFile] = []
    for file_path in iter_store_files():
        relative_path = file_path.relative_to(WORK_ROOT).as_posix()
        extension = file_path.suffix.lower()
        component_type, purpose = SUPPORTED_FILE_TYPES[extension]
        encoded_path = quote(relative_path, safe="/")

        components.append(
            ImportFile(
                url=f"{BASE_URL}/files/{encoded_path}",
                name=relative_path[: -len(extension)],
                alias=(
                    relative_path[: -len(extension)] if component_type == "csv" else ""
                ),
                purpose=purpose,
                type=component_type,
            )
        )

    return ModelImport(
        name=model_name,
        engine="duckdb",
        description="Fixture-backed remote store model for Playwright tests.",
        components=components,
    )


initialize_workspace()


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "message": "Mock Remote Store",
        "workspace": str(WORK_ROOT),
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/index.json", response_model=StoreIndex, dependencies=[Depends(require_auth)])
async def index() -> StoreIndex:
    return StoreIndex(
        name="Fixture Remote Store",
        models=[
            StoreModelIndex(
                name=MODEL_NAME,
                url=f"{BASE_URL}/models/{MODEL_NAME}.json",
            )
        ],
    )


@app.get(
    "/models/{model_name}.json",
    response_model=ModelImport,
    dependencies=[Depends(require_auth)],
)
async def model_import(model_name: str) -> ModelImport:
    return build_model_import(model_name)


@app.get("/files", dependencies=[Depends(require_auth)])
async def list_files() -> dict[str, list[dict[str, object]]]:
    directories = build_file_listing()
    return {
        "directories": [
            {"directory": directory, "files": files}
            for directory, files in directories.items()
        ]
    }


@app.get("/files/{file_path:path}", dependencies=[Depends(require_auth)])
async def get_file(file_path: str) -> PlainTextResponse:
    resolved = resolve_store_path(file_path)
    if not resolved.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return PlainTextResponse(resolved.read_text(encoding="utf-8"))


@app.post("/files", status_code=201, dependencies=[Depends(require_auth)])
async def create_file(payload: FileCreateRequest) -> dict[str, str]:
    resolved = resolve_store_path(payload.path)
    if resolved.exists():
        raise HTTPException(status_code=409, detail="File already exists")

    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(payload.content, encoding="utf-8")
    return {"path": resolved.relative_to(WORK_ROOT).as_posix()}


@app.put("/files/{file_path:path}", dependencies=[Depends(require_auth)])
async def update_file(file_path: str, payload: FileUpdateRequest) -> dict[str, str]:
    resolved = resolve_store_path(file_path)
    if not resolved.exists():
        raise HTTPException(status_code=404, detail="File not found")

    resolved.write_text(payload.content, encoding="utf-8")
    return {"path": resolved.relative_to(WORK_ROOT).as_posix()}


@app.delete(
    "/files/{file_path:path}", status_code=204, dependencies=[Depends(require_auth)]
)
async def delete_file(file_path: str) -> Response:
    resolved = resolve_store_path(file_path)
    if not resolved.exists():
        raise HTTPException(status_code=404, detail="File not found")

    resolved.unlink()
    return Response(status_code=204)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
