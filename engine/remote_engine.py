"""Remote query engine: run warehouse queries the browser can't reach itself.

The browser studio can't call Databricks directly (its Statement API sends no
CORS headers), so this router runs those queries on its behalf and hands back
Arrow IPC, the same bytes the desktop explorer's in-process bridge produces.
The studio's `httpRemoteWorkerHost` (lib/connections/httpRemoteWorkerHost.ts)
is the client. The contract is written up in docs/remote-worker-service.md.

**Private by default.** The router is mounted only when API keys are
configured and every route but /health needs one. A server-side engine is an
outbound proxy with the server's network position, so it is never left open.

**Stateless.** Every call carries the connection config; the warehouse holds
the statement. Any worker on any machine answers any call, scale to
zero loses nothing, and there is no session table to reap.

**Submit, then poll.** `POST /statements` waits up to `poll_seconds` and either
returns the result or `202 {statementId}`; the client polls
`POST /statements/{id}` until it gets bytes. No request outlives the proxy's
timeouts, however long the query runs.

**Credentials.** A call either names its own workspace (host, httpPath, token)
or names none of them and runs on the server's configured warehouse. Never a
mix: see `databricks_engine.resolve_settings`.

Like `databricks_engine`, this module imports nothing from the engine app (app.py) so
`trilogy serve` can mount the same router behind its own token.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import logging
import os
import secrets
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import databricks_engine as dbx

logger = logging.getLogger("trilogy.engine")

ARROW_MEDIA_TYPE = "application/vnd.apache.arrow.stream"
#: Response headers the browser must be allowed to read (CORS expose list).
EXPOSED_HEADERS = ["X-Row-Count", "X-Duration-Ms", "X-Statement-Id"]
DRIVERS = ("databricks",)


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


def _env_int(name: str, default: int) -> int:
    try:
        return max(int(os.environ.get(name, "") or default), 0)
    except ValueError:
        return default


def _env_flag(name: str, default: bool) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def parse_api_keys(raw: str) -> dict[str, str]:
    """`"<keyId>:<sha256 hex>,..."` → {keyId: digest}. Malformed entries are
    dropped with a warning rather than failing the whole server."""
    keys: dict[str, str] = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        key_id, sep, digest = entry.partition(":")
        digest = digest.strip().lower()
        if not sep or not key_id.strip() or len(digest) != 64:
            logger.warning("Ignoring malformed TRILOGY_ENGINE_API_KEYS entry")
            continue
        try:
            bytes.fromhex(digest)
        except ValueError:
            logger.warning("Ignoring malformed TRILOGY_ENGINE_API_KEYS entry")
            continue
        keys[key_id.strip()] = digest
    return keys


def server_databricks_from_env() -> dbx.DatabricksSettings | None:
    """The server's own warehouse, from the variables the Databricks CLI,
    SDKs and pytrilogy's `DatabricksConfig` read. None when unset."""
    host = os.environ.get("DATABRICKS_HOST")
    token = os.environ.get("DATABRICKS_TOKEN")
    if not (host and token):
        return None
    try:
        return dbx.DatabricksSettings.from_values(
            host=host,
            http_path=os.environ.get("DATABRICKS_HTTP_PATH"),
            warehouse_id=os.environ.get("DATABRICKS_WAREHOUSE_ID"),
            token=token,
            catalog=os.environ.get("DATABRICKS_CATALOG"),
            schema=os.environ.get("DATABRICKS_SCHEMA"),
        )
    except dbx.EngineError as exc:
        logger.error("Server Databricks config ignored: %s", exc.message)
        return None


@dataclass
class EngineSettings:
    #: keyId → sha256 of the key. Empty disables the engine entirely.
    api_keys: dict[str, str] = field(default_factory=dict)
    policy: dbx.EgressPolicy = field(default_factory=dbx.EgressPolicy)
    server_databricks: dbx.DatabricksSettings | None = None
    #: Whether a caller may name its own workspace and token. Off pins the
    #: engine to the server's warehouse.
    allow_caller_credentials: bool = True
    #: How long one request waits on a statement before answering 202.
    poll_seconds: int = 10
    #: Budget for calls that must finish in one request (connect, describe,
    #: scripts). Stays under the proxy's idle timeout (fly.toml sets 50).
    sync_seconds: int = 90
    max_result_bytes: int = 256 * 1024 * 1024
    max_inflight: int = 16

    @property
    def enabled(self) -> bool:
        return bool(self.api_keys)

    @classmethod
    def from_env(cls, hosted: bool) -> EngineSettings:
        suffixes = tuple(
            s.strip().lower()
            for s in os.environ.get(
                "TRILOGY_ENGINE_DATABRICKS_HOST_SUFFIXES", ""
            ).split(",")
            if s.strip()
        )
        policy = dbx.EgressPolicy(
            strict=_env_flag("TRILOGY_ENGINE_STRICT_EGRESS", hosted),
            api_host_suffixes=suffixes or dbx.DEFAULT_API_HOST_SUFFIXES,
            allow_private=_env_flag("TRILOGY_ENGINE_ALLOW_PRIVATE_EGRESS", False),
        )
        return cls(
            api_keys=parse_api_keys(os.environ.get("TRILOGY_ENGINE_API_KEYS", "")),
            policy=policy,
            server_databricks=server_databricks_from_env(),
            allow_caller_credentials=_env_flag(
                "TRILOGY_ENGINE_ALLOW_CALLER_CREDENTIALS", True
            ),
            poll_seconds=_env_int("TRILOGY_ENGINE_POLL_SECONDS", 10) or 10,
            sync_seconds=_env_int("TRILOGY_ENGINE_SYNC_SECONDS", 90) or 90,
            max_result_bytes=_env_int(
                "TRILOGY_ENGINE_MAX_RESULT_BYTES", 256 * 1024 * 1024
            ),
            max_inflight=_env_int("TRILOGY_ENGINE_MAX_INFLIGHT", 16) or 16,
        )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def bearer_key_auth(api_keys: dict[str, str]) -> Callable[[Request], str]:
    """Dependency: `Authorization: Bearer <key>` → the key's id. Every
    configured digest is compared, in constant time, so timing says nothing
    about which key (or how much of one) matched."""

    def require_key(request: Request) -> str:
        header = request.headers.get("authorization", "")
        scheme, _, presented = header.partition(" ")
        if scheme.lower() != "bearer" or not presented.strip():
            raise HTTPException(401, "Engine API key required (Authorization: Bearer).")
        digest = hash_key(presented.strip())
        matched: str | None = None
        for key_id, expected in api_keys.items():
            if hmac.compare_digest(digest, expected):
                matched = key_id
        if matched is None:
            raise HTTPException(401, "Invalid engine API key.")
        return matched

    return require_key


# ---------------------------------------------------------------------------
# Wire models
# ---------------------------------------------------------------------------


class EngineCall(BaseModel):
    driver: Literal["databricks"] = "databricks"
    config: dict[str, Any] = Field(default_factory=dict)


class ExecuteCall(EngineCall):
    sql: str
    parameters: dict[str, Any] | None = None


class ScriptCall(EngineCall):
    sql: str


class DescribeCall(EngineCall):
    database: str | None = None
    schema_: str | None = Field(default=None, alias="schema")
    table: str | None = None

    model_config = {"populate_by_name": True}


DescribeKind = Literal["databases", "schemas", "tables", "columns", "table"]


class EngineBusy(dbx.EngineError):
    code = "overloaded"
    status = 503

    def __init__(self) -> None:
        super().__init__("Engine is busy; retry shortly.")


def error_response(exc: dbx.EngineError) -> JSONResponse:
    # `detail` too, so clients written against FastAPI's usual shape work.
    return JSONResponse(
        status_code=exc.status,
        content={"code": exc.code, "message": exc.message, "detail": exc.message},
        headers={"Retry-After": "2"} if exc.status == 503 else None,
    )


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


def create_engine_router(
    settings: EngineSettings,
    auth: Callable[..., Any] | None = None,
    transport: Any = None,
) -> APIRouter:
    """Routes under `/v1`. The engine app mounts it at the root; `trilogy serve` at `/engine`.

    `auth` overrides the bearer-key dependency; `trilogy serve` passes its own
    serve-token check. `transport` is an httpx transport for tests.
    """
    dependency = auth or bearer_key_auth(settings.api_keys)
    router = APIRouter(prefix="/v1", dependencies=[Depends(dependency)])
    inflight = threading.BoundedSemaphore(settings.max_inflight)

    @contextmanager
    def admitted() -> Iterator[None]:
        if not inflight.acquire(blocking=False):
            raise EngineBusy()
        try:
            yield
        finally:
            inflight.release()

    @contextmanager
    def client_for(call: EngineCall) -> Iterator[dbx.DatabricksClient]:
        config = call.config or {}
        if not settings.allow_caller_credentials and any(
            dbx._clean(config.get(key)) for key in dbx.CONNECTION_KEYS
        ):
            raise dbx.InvalidConfig(
                "This engine only runs its own configured warehouse; "
                "remove host, httpPath and token from the connection."
            )
        resolved = dbx.resolve_settings(config, settings.server_databricks)
        with dbx.DatabricksClient(
            resolved, settings.policy, transport=transport
        ) as client:
            yield client

    def run(fn: Callable[[], Response | dict | list]) -> Any:
        try:
            with admitted():
                return fn()
        except dbx.EngineError as exc:
            return error_response(exc)

    def arrow_or_pending(
        client: dbx.DatabricksClient, response: dict[str, Any], started: float
    ) -> Response:
        state = dbx.statement_state(response)
        statement_id = dbx.statement_id_of(response)
        if state != "SUCCEEDED":
            return JSONResponse(
                status_code=202, content={"statementId": statement_id, "state": state}
            )
        body, rows = client.collect_arrow(response, settings.max_result_bytes)
        return Response(
            content=body,
            media_type=ARROW_MEDIA_TYPE,
            headers={
                "X-Row-Count": str(rows),
                "X-Duration-Ms": str(int((time.monotonic() - started) * 1000)),
                "X-Statement-Id": statement_id,
            },
        )

    @router.get("/info")
    def info() -> dict[str, Any]:
        server = settings.server_databricks
        return {
            "drivers": list(DRIVERS),
            "databricks": {
                "serverWarehouse": server is not None,
                "callerCredentials": settings.allow_caller_credentials,
                "catalog": server.catalog if server else None,
                "schema": server.schema if server else None,
            },
            "limits": {
                "maxResultBytes": settings.max_result_bytes,
                "pollSeconds": settings.poll_seconds,
            },
        }

    @router.post("/connect")
    def connect(call: EngineCall) -> Any:
        def go() -> dict[str, Any]:
            with client_for(call) as client:
                client.verify()
            return {
                "queryType": "databricks",
                "capabilities": {"cancel": True, "describe": True},
            }

        return run(go)

    @router.post("/statements")
    def submit(call: ExecuteCall) -> Any:
        def go() -> Response:
            started = time.monotonic()
            with client_for(call) as client:
                params = dbx.to_statement_params(call.sql, call.parameters)
                response = client.submit(
                    call.sql, params, wait_seconds=settings.poll_seconds
                )
                response = client.wait(response, started + settings.poll_seconds)
                return arrow_or_pending(client, response, started)

        return run(go)

    @router.post("/statements/{statement_id}")
    def poll(statement_id: str, call: EngineCall) -> Any:
        def go() -> Response:
            started = time.monotonic()
            with client_for(call) as client:
                response = client.wait(
                    client.status(statement_id), started + settings.poll_seconds
                )
                return arrow_or_pending(client, response, started)

        return run(go)

    @router.post("/statements/{statement_id}/cancel")
    def cancel(statement_id: str, call: EngineCall) -> Any:
        def go() -> dict[str, Any]:
            with client_for(call) as client:
                client.cancel(statement_id)
            return {"canceled": True}

        return run(go)

    @router.post("/script", response_model=None)
    def script(call: ScriptCall) -> Any:
        def go() -> Response:
            with client_for(call) as client:
                client.run_script(call.sql, time.monotonic() + settings.sync_seconds)
            return Response(status_code=204)

        return run(go)

    @router.post("/describe/{kind}")
    def describe(kind: DescribeKind, call: DescribeCall) -> Any:
        def go() -> Any:
            deadline = time.monotonic() + settings.sync_seconds
            with client_for(call) as client:
                database = call.database or ""
                if kind == "databases":
                    return client.describe_databases(deadline)
                if not database:
                    raise dbx.InvalidConfig("database is required")
                if kind == "schemas":
                    return client.describe_schemas(database, deadline)
                if kind == "tables":
                    return client.describe_tables(database, call.schema_, deadline)
                if not call.table:
                    raise dbx.InvalidConfig("table is required")
                if kind == "columns":
                    return client.describe_columns(
                        database,
                        call.schema_ or client.default_schema(),
                        call.table,
                        deadline,
                    )
                return client.describe_table(
                    database, call.schema_, call.table, deadline
                )

        return run(go)

    return router


def create_health_router() -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "drivers": list(DRIVERS)}

    return router


# ---------------------------------------------------------------------------
# Key minting: `python remote_engine.py new-key <id>`
# ---------------------------------------------------------------------------


def _main() -> None:
    parser = argparse.ArgumentParser(description="Remote engine utilities")
    sub = parser.add_subparsers(dest="command", required=True)
    new_key = sub.add_parser("new-key", help="Mint an API key")
    new_key.add_argument("key_id", help="Who the key is for, e.g. 'ethan'")
    args = parser.parse_args()
    if args.command == "new-key":
        key = f"tre_{secrets.token_urlsafe(32)}"
        print(f"API key (give to the user, shown once): {key}")
        print(f"TRILOGY_ENGINE_API_KEYS entry:          {args.key_id}:{hash_key(key)}")


if __name__ == "__main__":
    _main()
