"""Databricks SQL warehouse access over the Statement Execution API.

The Python twin of the explorer's Rust worker
(`explorer/src-tauri/crates/query-bridge/src/workers/databricks.rs`): same
config keys, parameter binding, script splitting and type mapping, so a
connection behaves the same whether the desktop bridge or this server runs it.

Why a server at all: the Statement API sends no CORS headers, so the browser
studio cannot call it. `remote_engine` exposes this module over HTTP.

Unlike the desktop worker, nothing here holds a session. Every call carries
its config and the warehouse keeps the statement, so any worker process on any
machine can answer the next poll. Long queries are submit-then-poll, never one
long request (Fly's proxy and any client timeout sit in the way).

Module boundary: depends only on httpx and pyarrow, never on the engine app, so it
can move into pytrilogy for `trilogy serve` unchanged.
"""

from __future__ import annotations

import ipaddress
import re
import socket
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Self
from urllib.parse import urlsplit

import httpx
import pyarrow as pa

STATEMENTS_PATH = "/api/2.0/sql/statements"
# Paths taken from Databricks responses (`next_chunk_internal_link`) must stay
# under this prefix in strict mode.
STRICT_API_PREFIX = "/api/2.0/sql/"
LZ4_FRAME_MAGIC = b"\x04\x22\x4d\x18"
MAX_DOWNLOAD_REDIRECTS = 5
# Databricks statement ids are UUID-shaped. Anything else is refused before it
# is spliced into a URL path.
_STATEMENT_ID = re.compile(r"[0-9A-Za-z][0-9A-Za-z-]{7,63}")

DEFAULT_API_HOST_SUFFIXES = (
    ".cloud.databricks.com",
    ".azuredatabricks.net",
    ".gcp.databricks.com",
    ".cloud.databricks.us",
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class EngineError(Exception):
    """An error with a stable wire code and HTTP status."""

    code = "driver_error"
    status = 502

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class InvalidConfig(EngineError):
    code = "invalid_request"
    status = 400


class EgressDenied(EngineError):
    code = "invalid_request"
    status = 400


class UpstreamUnreachable(EngineError):
    code = "upstream_unreachable"
    status = 502


class StatementCanceled(EngineError):
    code = "canceled"
    status = 409

    def __init__(self, message: str = "query canceled by user"):
        super().__init__(message)


class ResultTooLarge(EngineError):
    code = "too_large"
    status = 413


class EngineTimeout(EngineError):
    code = "timeout"
    status = 504


# ---------------------------------------------------------------------------
# Egress policy
# ---------------------------------------------------------------------------


Resolver = Callable[[str], list[str]]


def _system_resolver(hostname: str) -> list[str]:
    infos = socket.getaddrinfo(hostname, 443, proto=socket.IPPROTO_TCP)
    return [str(info[4][0]) for info in infos]


def is_public_address(address: str) -> bool:
    """True only for globally routable unicast addresses. IPv4-mapped and
    NAT64 IPv6 forms are judged by the IPv4 address they carry."""
    try:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return is_public_address(str(ip.ipv4_mapped))
        if ip in ipaddress.ip_network("64:ff9b::/96"):
            return is_public_address(str(ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)))
    return ip.is_global and not ip.is_multicast


@dataclass(frozen=True)
class EgressPolicy:
    """Where this process may send requests on a caller's behalf.

    Permissive is for a process the caller owns (`trilogy serve`, a local
    engine): any https host, plus plain http to loopback for test doubles.
    Strict is for a shared server: the workspace must be a Databricks cloud
    host, every hop is https on 443, and no request may reach a private,
    loopback or link-local address (cloud metadata, Fly's private network).
    """

    strict: bool = False
    api_host_suffixes: tuple[str, ...] = DEFAULT_API_HOST_SUFFIXES
    allow_private: bool = False
    resolver: Resolver = field(default=_system_resolver, compare=False)

    def check_api_base(self, base_url: str) -> None:
        if not self.strict:
            return
        parts = urlsplit(base_url)
        hostname = (parts.hostname or "").lower()
        if parts.scheme != "https" or parts.port not in (None, 443):
            raise EgressDenied("Databricks host must be https on port 443.")
        if not any(hostname.endswith(suffix) for suffix in self.api_host_suffixes):
            raise EgressDenied(
                f"Databricks host {hostname!r} is not a Databricks cloud workspace "
                f"({', '.join(self.api_host_suffixes)})."
            )
        self._check_resolves_public(hostname)

    def check_download(self, url: str) -> None:
        parts = urlsplit(url)
        hostname = (parts.hostname or "").lower()
        if not hostname or parts.username or parts.password:
            raise EgressDenied("Databricks returned an unusable result link.")
        if parts.scheme == "http" and not self.strict and _is_loopback_name(hostname):
            return
        if parts.scheme != "https":
            raise EgressDenied("Databricks result links must be https.")
        if self.strict:
            if parts.port not in (None, 443):
                raise EgressDenied("Databricks result links must use port 443.")
            self._check_resolves_public(hostname)

    def _check_resolves_public(self, hostname: str) -> None:
        if self.allow_private:
            return
        if hostname.endswith((".internal", ".flycast", ".localhost")):
            raise EgressDenied(f"Refusing to connect to private host {hostname!r}.")
        try:
            addresses = self.resolver(hostname)
        except OSError as exc:
            raise UpstreamUnreachable(f"could not resolve {hostname}: {exc}") from exc
        if not addresses or not all(is_public_address(a) for a in addresses):
            raise EgressDenied(
                f"Refusing to connect to {hostname!r}: it resolves to a private address."
            )


def _is_loopback_name(hostname: str) -> bool:
    return hostname in ("localhost", "127.0.0.1", "::1", "[::1]")


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


def _clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalize_base_url(host: str | None) -> str:
    """`scheme://authority` for a workspace host given with or without a
    scheme. Anything after the authority (`/?o=123`, a pasted path) is dropped.
    Plain http is accepted only for loopback, so a token never travels in the
    clear."""
    text = (host or "").strip()
    if text.startswith("https://"):
        scheme, rest = "https", text[len("https://") :]
    elif text.startswith("http://"):
        scheme, rest = "http", text[len("http://") :]
    else:
        scheme, rest = "https", text
    authority = re.split(r"[/?#]", rest, maxsplit=1)[0].strip()
    if not authority:
        raise InvalidConfig(
            "Databricks host is required (e.g. dbc-1234.cloud.databricks.com)."
        )
    if "@" in authority:
        raise InvalidConfig("Databricks host must not contain credentials.")
    if scheme == "http":
        hostname = urlsplit(f"http://{authority}").hostname or ""
        if not _is_loopback_name(hostname):
            raise InvalidConfig("Databricks host must use https.")
    return f"{scheme}://{authority}"


def warehouse_id_from_http_path(path: str | None) -> str | None:
    """The warehouse id in `/sql/1.0/warehouses/<id>` (or the older
    `/sql/1.0/endpoints/<id>`)."""
    parts = (path or "").strip().strip("/").split("/")
    for index, part in enumerate(parts[:-1]):
        if part in ("warehouses", "endpoints") and parts[index + 1]:
            return parts[index + 1]
    return None


#: Config keys that identify *where* to connect and *as whom*. If a caller sets
#: any of them, none of the server's own credentials are used: mixing a
#: caller-chosen host with the server's token would send that token anywhere.
CONNECTION_KEYS = ("host", "httpPath", "warehouseId", "token")


@dataclass(frozen=True)
class DatabricksSettings:
    base_url: str
    warehouse_id: str
    token: str = field(repr=False)
    catalog: str | None = None
    schema: str | None = None

    @classmethod
    def from_values(
        cls,
        host: str | None,
        http_path: str | None,
        warehouse_id: str | None,
        token: str | None,
        catalog: str | None = None,
        schema: str | None = None,
    ) -> DatabricksSettings:
        base_url = normalize_base_url(host)
        token = _clean(token)
        if not token:
            raise InvalidConfig("Databricks access token is required.")
        warehouse = _clean(warehouse_id) or warehouse_id_from_http_path(http_path)
        if not warehouse:
            raise InvalidConfig(
                "Databricks needs a SQL warehouse HTTP path (/sql/1.0/warehouses/<id>). "
                "All-purpose cluster paths aren't supported by the Statement Execution API."
            )
        return cls(
            base_url=base_url,
            warehouse_id=warehouse,
            token=token,
            catalog=_clean(catalog),
            schema=_clean(schema),
        )


def resolve_settings(
    config: dict[str, Any] | None, server_default: DatabricksSettings | None
) -> DatabricksSettings:
    """Settings for one call, from the caller's config or the server's own.

    `catalog` / `schema` may always be overridden by the caller. The connection
    itself (host, warehouse, token) comes entirely from one side.
    """
    config = config or {}
    if not isinstance(config, dict):
        raise InvalidConfig("config must be an object")
    caller_connects = any(_clean(config.get(key)) for key in CONNECTION_KEYS)
    if not caller_connects:
        if server_default is None:
            raise InvalidConfig(
                "This engine has no Databricks warehouse configured; "
                "provide host, httpPath and token."
            )
        return DatabricksSettings(
            base_url=server_default.base_url,
            warehouse_id=server_default.warehouse_id,
            token=server_default.token,
            catalog=_clean(config.get("catalog")) or server_default.catalog,
            schema=_clean(config.get("schema")) or server_default.schema,
        )
    return DatabricksSettings.from_values(
        host=config.get("host"),
        http_path=config.get("httpPath"),
        warehouse_id=config.get("warehouseId"),
        token=config.get("token"),
        catalog=config.get("catalog"),
        schema=config.get("schema"),
    )


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------


def api_error_message(code: int, body: str) -> str:
    """User-facing message for a non-2xx API response. Never echoes request
    headers, so the token can't leak into an error string."""
    message = body[:300]
    try:
        parsed = httpx.Response(200, content=body).json()
        if isinstance(parsed, dict) and isinstance(parsed.get("message"), str):
            message = parsed["message"]
    except ValueError:
        pass
    hints = {
        401: " Check the access token: it may be expired, revoked, or for a different workspace.",
        403: " The token's user lacks permission (CAN USE on the warehouse), or an IP access list blocks this server.",
        404: " Check the workspace host and the warehouse HTTP path.",
    }
    return f"Databricks API error ({code}): {message}{hints.get(code, '')}"


class DatabricksClient:
    def __init__(
        self,
        settings: DatabricksSettings,
        policy: EgressPolicy,
        transport: httpx.BaseTransport | None = None,
        user_agent: str = "trilogy-studio-engine",
    ):
        self.settings = settings
        self.policy = policy
        policy.check_api_base(settings.base_url)
        self._http = httpx.Client(
            transport=transport,
            # A redirect could carry the bearer token to another host.
            follow_redirects=False,
            # The API calls return within the requested wait; downloads of
            # large chunks are the slow path.
            timeout=httpx.Timeout(60.0, connect=15.0, read=120.0),
            headers={"User-Agent": user_agent},
            # Proxy env vars would route around the egress policy.
            trust_env=False,
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    # -- raw API --------------------------------------------------------------

    def url(self, path: str) -> str:
        """Join an API path onto the workspace base. Paths include links taken
        from responses, so they must be rooted: `//other.host` or
        `@other.host` would change the authority the token is sent to."""
        if not path.startswith("/") or path.startswith("//"):
            raise EngineError(
                f"refusing non-workspace API path from Databricks response: {path!r}"
            )
        if self.policy.strict and not path.startswith(STRICT_API_PREFIX):
            raise EngineError(
                f"refusing Databricks API path outside {STRICT_API_PREFIX}: {path!r}"
            )
        return f"{self.settings.base_url}{path}"

    def _request(self, method: str, path: str, body: Any = None) -> dict[str, Any]:
        try:
            response = self._http.request(
                method,
                self.url(path),
                json=body,
                headers={"Authorization": f"Bearer {self.settings.token}"},
            )
        except httpx.HTTPError as exc:
            raise UpstreamUnreachable(
                f"could not reach Databricks: {type(exc).__name__}"
            ) from None
        if response.status_code >= 300:
            raise EngineError(api_error_message(response.status_code, response.text))
        try:
            data = response.json()
        except ValueError:
            raise EngineError("unexpected Databricks response: not JSON") from None
        return data if isinstance(data, dict) else {}

    def get(self, path: str) -> dict[str, Any]:
        return self._request("GET", path)

    def post(self, path: str, body: Any) -> dict[str, Any]:
        return self._request("POST", path, body)

    def download(self, url: str, headers: Any) -> bytes:
        """Fetch a presigned result link. It points at cloud storage, so the
        workspace token is never attached; only the headers Databricks
        returned with the link.

        Redirects are followed by hand, re-checking every hop against the
        egress policy. Large results on Databricks-managed storage answer
        `307` to a sibling path on the same host. The link's own headers go
        only to the host Databricks named."""
        extra = (
            {k: v for k, v in headers.items() if isinstance(v, str)}
            if isinstance(headers, dict)
            else {}
        )
        origin = urlsplit(url).netloc
        for _hop in range(MAX_DOWNLOAD_REDIRECTS + 1):
            self.policy.check_download(url)
            same_host = urlsplit(url).netloc == origin
            try:
                response = self._http.get(url, headers=extra if same_host else {})
            except httpx.HTTPError as exc:
                raise UpstreamUnreachable(
                    f"Databricks result download failed: {type(exc).__name__}"
                ) from None
            location = response.headers.get("location")
            if response.status_code in (301, 302, 303, 307, 308) and location:
                url = str(httpx.URL(url).join(location))
                continue
            break
        else:
            raise EngineError("Databricks result download redirected too many times.")
        if response.status_code >= 300:
            raise EngineError(
                f"Databricks result download failed with HTTP {response.status_code}. "
                "If the workspace restricts cloud storage access (private link / "
                "firewall), this server needs to reach the storage account too."
            )
        return response.content

    # -- statements -----------------------------------------------------------

    def verify(self) -> None:
        """Check host, token and warehouse with a metadata call, which unlike
        `SELECT 1` does not start a stopped warehouse."""
        self.get(f"/api/2.0/sql/warehouses/{self.settings.warehouse_id}")

    def submit(
        self,
        sql: str,
        parameters: list[dict[str, Any]] | None = None,
        *,
        arrow: bool = True,
        wait_seconds: int = 10,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "statement": sql,
            "warehouse_id": self.settings.warehouse_id,
            "disposition": "EXTERNAL_LINKS" if arrow else "INLINE",
            "format": "ARROW_STREAM" if arrow else "JSON_ARRAY",
            # The API accepts 0 (async) or 5-50 seconds.
            "wait_timeout": f"{max(5, min(wait_seconds, 50))}s",
            "on_wait_timeout": "CONTINUE",
        }
        if self.settings.catalog:
            body["catalog"] = self.settings.catalog
        if self.settings.schema:
            body["schema"] = self.settings.schema
        if parameters:
            body["parameters"] = parameters
        return self.post(STATEMENTS_PATH, body)

    def status(self, statement_id: str) -> dict[str, Any]:
        return self.get(f"{STATEMENTS_PATH}/{check_statement_id(statement_id)}")

    def cancel(self, statement_id: str) -> None:
        self.post(f"{STATEMENTS_PATH}/{check_statement_id(statement_id)}/cancel", {})

    def wait(
        self,
        response: dict[str, Any],
        deadline: float,
        sleep: Callable[[float], None] = time.sleep,
    ) -> dict[str, Any]:
        """Poll until the statement is terminal or `deadline` (monotonic) has
        passed. Returns the last response; raise on failure states."""
        interval = 0.25
        while True:
            state = statement_state(response)
            if state == "SUCCEEDED":
                return response
            if state not in ("PENDING", "RUNNING"):
                raise_for_terminal(response)
            if time.monotonic() + interval >= deadline:
                return response
            sleep(interval)
            interval = min(interval * 2, 2.0)
            response = self.status(statement_id_of(response))

    def collect_arrow(
        self, response: dict[str, Any], max_bytes: int = 0
    ) -> tuple[bytes, int]:
        """Download every chunk of an ARROW_STREAM result and re-encode it as a
        single IPC stream. Returns (ipc bytes, row count)."""
        manifest = response.get("manifest") or {}
        declared = manifest.get("total_byte_count")
        if max_bytes and isinstance(declared, int) and declared > max_bytes:
            raise ResultTooLarge(_too_large_message(declared, max_bytes))
        lz4 = manifest.get("result_compression") == "LZ4_FRAME"

        sink = pa.BufferOutputStream()
        writer: pa.ipc.RecordBatchStreamWriter | None = None
        rows = 0
        downloaded = 0
        links = list((response.get("result") or {}).get("external_links") or [])
        while links:
            next_path: str | None = None
            for link in links:
                url = link.get("external_link")
                if not isinstance(url, str):
                    raise EngineError("result chunk had no link")
                raw = self.download(url, link.get("http_headers"))
                downloaded += len(raw)
                if max_bytes and downloaded > max_bytes:
                    raise ResultTooLarge(_too_large_message(downloaded, max_bytes))
                reader = pa.ipc.open_stream(_maybe_decompress(raw, lz4))
                if writer is None:
                    writer = pa.ipc.new_stream(sink, reader.schema)
                for batch in reader:
                    rows += batch.num_rows
                    writer.write_batch(batch)
                link_next = link.get("next_chunk_internal_link")
                next_path = link_next if isinstance(link_next, str) else None
            links = (
                list(self.get(next_path).get("external_links") or [])
                if next_path
                else []
            )

        # Zero-row results (and DDL) come back without links; build an empty
        # stream from the manifest so the client still gets column headers.
        if writer is None:
            writer = pa.ipc.new_stream(sink, schema_from_manifest(manifest))
        writer.close()
        return sink.getvalue().to_pybytes(), rows

    def query_rows(
        self,
        sql: str,
        parameters: list[dict[str, Any]] | None,
        deadline: float,
    ) -> list[list[str | None]]:
        """Run a small query to completion and return rows as nullable strings."""
        response = self.wait(
            self.submit(sql, parameters, arrow=False, wait_seconds=10), deadline
        )
        if statement_state(response) != "SUCCEEDED":
            self._cancel_quietly(response)
            raise EngineTimeout(
                "Databricks did not answer in time; the warehouse may be starting. Try again."
            )
        out: list[list[str | None]] = []
        chunk = response.get("result") or {}
        while True:
            for row in chunk.get("data_array") or []:
                out.append([c if isinstance(c, str) else None for c in row])
            next_path = chunk.get("next_chunk_internal_link")
            if not isinstance(next_path, str):
                return out
            chunk = self.get(next_path)

    def run_script(self, sql: str, deadline: float) -> None:
        for statement in split_statements(sql):
            response = self.wait(
                self.submit(statement, arrow=False, wait_seconds=10), deadline
            )
            if statement_state(response) != "SUCCEEDED":
                self._cancel_quietly(response)
                raise EngineTimeout("Databricks script did not finish in time.")

    def _cancel_quietly(self, response: dict[str, Any]) -> None:
        try:
            self.cancel(statement_id_of(response))
        except EngineError:
            pass

    # -- introspection --------------------------------------------------------
    #
    # Reads `system.information_schema`, which spans every Unity Catalog
    # catalog the token can see and lets names be bound as parameters instead
    # of spliced into identifiers. hive_metastore-only workspaces don't fill it.

    def default_schema(self) -> str:
        return self.settings.schema or "default"

    def describe_databases(self, deadline: float) -> list[dict[str, Any]]:
        rows = self.query_rows(
            "SELECT catalog_name FROM system.information_schema.catalogs ORDER BY catalog_name",
            None,
            deadline,
        )
        return [{"name": r[0]} for r in rows if r and r[0]]

    def describe_schemas(self, database: str, deadline: float) -> list[dict[str, Any]]:
        rows = self.query_rows(
            "SELECT schema_name, comment FROM system.information_schema.schemata "
            "WHERE catalog_name = :catalog ORDER BY schema_name",
            [str_param("catalog", database)],
            deadline,
        )
        return [
            _drop_none({"name": r[0], "database": database, "description": _at(r, 1)})
            for r in rows
            if r and r[0]
        ]

    def describe_tables(
        self, database: str, schema: str | None, deadline: float
    ) -> list[dict[str, Any]]:
        schema = schema or self.default_schema()
        rows = self.query_rows(
            "SELECT table_name, table_type, comment FROM system.information_schema.tables "
            "WHERE table_catalog = :catalog AND table_schema = :schema ORDER BY table_name",
            [str_param("catalog", database), str_param("schema", schema)],
            deadline,
        )
        return [
            _drop_none(
                {
                    "name": r[0],
                    "schema": schema,
                    "database": database,
                    "description": _at(r, 2),
                    "assetType": "view" if "VIEW" in (_at(r, 1) or "") else "table",
                }
            )
            for r in rows
            if r and r[0]
        ]

    def describe_columns(
        self, database: str, schema: str, table: str, deadline: float
    ) -> list[dict[str, Any]]:
        rows = self.query_rows(
            "SELECT column_name, full_data_type, is_nullable, comment "
            "FROM system.information_schema.columns "
            "WHERE table_catalog = :catalog AND table_schema = :schema AND table_name = :table "
            "ORDER BY ordinal_position",
            [
                str_param("catalog", database),
                str_param("schema", schema),
                str_param("table", table),
            ],
            deadline,
        )
        columns = []
        for r in rows:
            if not r or not r[0]:
                continue
            dtype = _at(r, 1) or ""
            columns.append(
                _drop_none(
                    {
                        "name": r[0],
                        "type": dtype,
                        "trilogyType": map_databricks_type(dtype),
                        "nullable": (_at(r, 2) or "").upper() == "YES",
                        "primary": False,
                        "unique": False,
                        "autoincrement": False,
                        "description": _at(r, 3),
                    }
                )
            )
        return columns

    def describe_table(
        self, database: str, schema: str | None, table: str, deadline: float
    ) -> dict[str, Any]:
        schema = schema or self.default_schema()
        return {
            "name": table,
            "schema": schema,
            "database": database,
            "assetType": "table",
            "columns": self.describe_columns(database, schema, table, deadline),
        }


# ---------------------------------------------------------------------------
# Statement responses
# ---------------------------------------------------------------------------


def check_statement_id(statement_id: str) -> str:
    if not isinstance(statement_id, str) or not _STATEMENT_ID.fullmatch(statement_id):
        raise InvalidConfig("invalid statement id")
    return statement_id


def statement_state(response: dict[str, Any]) -> str:
    status = response.get("status") or {}
    state = status.get("state") if isinstance(status, dict) else None
    return state if isinstance(state, str) else ""


def statement_id_of(response: dict[str, Any]) -> str:
    statement_id = response.get("statement_id")
    if not isinstance(statement_id, str):
        raise EngineError("response had no statement_id")
    return statement_id


def raise_for_terminal(response: dict[str, Any]) -> None:
    state = statement_state(response)
    if state == "FAILED":
        error = (response.get("status") or {}).get("error") or {}
        message = error.get("message") if isinstance(error, dict) else None
        raise EngineError(message if isinstance(message, str) else "statement failed")
    if state == "CANCELED":
        raise StatementCanceled()
    if state == "CLOSED":
        raise EngineError("Databricks statement was closed.")
    raise EngineError(f"unexpected Databricks statement state: {state!r}")


def _too_large_message(size: int, cap: int) -> str:
    return (
        f"Result is {size / 1_048_576:.0f} MiB, over this engine's "
        f"{cap / 1_048_576:.0f} MiB limit. Add a LIMIT or aggregate further."
    )


def _maybe_decompress(raw: bytes, declared: bool) -> pa.Buffer | bytes:
    if not (declared or raw.startswith(LZ4_FRAME_MAGIC)):
        return raw
    try:
        stream = pa.input_stream(pa.py_buffer(raw), compression="lz4")
        return stream.read_buffer()
    except (pa.ArrowException, OSError) as exc:
        raise EngineError(f"could not decompress result chunk: {exc}") from None


_MANIFEST_TYPES: dict[str, pa.DataType] = {
    "BOOLEAN": pa.bool_(),
    "BYTE": pa.int8(),
    "SHORT": pa.int16(),
    "INT": pa.int32(),
    "LONG": pa.int64(),
    "FLOAT": pa.float32(),
    "DOUBLE": pa.float64(),
    "DATE": pa.date32(),
    "TIMESTAMP": pa.timestamp("us", tz="UTC"),
    "BINARY": pa.binary(),
}


def schema_from_manifest(manifest: dict[str, Any]) -> pa.Schema:
    columns = ((manifest.get("schema") or {}).get("columns")) or []
    fields = []
    for column in columns:
        name = column.get("name") or ""
        type_name = column.get("type_name") or ""
        if type_name == "DECIMAL":
            precision = min(int(column.get("type_precision") or 38), 38)
            dtype: pa.DataType = pa.decimal128(
                precision, int(column.get("type_scale") or 0)
            )
        else:
            dtype = _MANIFEST_TYPES.get(type_name, pa.string())
        fields.append(pa.field(name, dtype, nullable=True))
    return pa.schema(fields)


# ---------------------------------------------------------------------------
# Parameters, scripts, types
# ---------------------------------------------------------------------------


def referenced_param_names(sql: str) -> set[str]:
    """Names of the `:name` markers in a statement; `::type` casts are
    skipped. Markers inside string literals are picked up too, which only
    keeps an unused name, never drops a real one."""
    names: set[str] = set()
    i = 0
    while i < len(sql):
        if sql.startswith("::", i):
            i += 2
            continue
        if (
            sql[i] == ":"
            and i + 1 < len(sql)
            and (sql[i + 1].isalpha() or sql[i + 1] == "_")
            and sql[i + 1].isascii()
        ):
            end = i + 1
            while (
                end < len(sql)
                and sql[end].isascii()
                and (sql[end].isalnum() or sql[end] == "_")
            ):
                end += 1
            names.add(sql[i + 1 : end])
            i = end
            continue
        i += 1
    return names


def to_statement_params(sql: str, parameters: Any) -> list[dict[str, Any]]:
    """Translate the studio's named-parameter map into Statement API params.

    The studio merges its own map (keys like `:p0`) with the resolver's (`p0`),
    so a value can arrive under both spellings. Accept either and bind only
    names the statement references; the API rejects a leading colon. Lists and
    structs are refused (pytrilogy renders those inline for Databricks).
    """
    if parameters is None:
        return []
    if not isinstance(parameters, dict):
        raise EngineError("query parameters must be a name → value map")
    out = []
    for name in sorted(referenced_param_names(sql)):
        if name in parameters:
            value = parameters[name]
        elif f":{name}" in parameters:
            value = parameters[f":{name}"]
        else:
            continue
        if value is None:
            out.append({"name": name})
        elif isinstance(value, bool):
            out.append({"name": name, "value": str(value).lower(), "type": "BOOLEAN"})
        elif isinstance(value, int):
            out.append({"name": name, "value": str(value), "type": "BIGINT"})
        elif isinstance(value, float):
            out.append({"name": name, "value": repr(value), "type": "DOUBLE"})
        elif isinstance(value, str):
            out.append({"name": name, "value": value, "type": "STRING"})
        else:
            raise EngineError(f"Databricks can't bind list or struct parameter :{name}")
    return out


def str_param(name: str, value: str) -> dict[str, Any]:
    return {"name": name, "value": value, "type": "STRING"}


def split_statements(sql: str) -> list[str]:
    """Split a script on top-level `;`, skipping semicolons in quotes,
    backtick identifiers and comments. Comment-only fragments are dropped; the
    Statement API runs exactly one statement per request."""
    out: list[str] = []
    cur: list[str] = []
    has_code = False
    i = 0
    n = len(sql)
    while i < n:
        c = sql[i]
        nxt = sql[i + 1] if i + 1 < n else ""
        if c in "'\"`":
            has_code = True
            cur.append(c)
            i += 1
            while i < n:
                q = sql[i]
                cur.append(q)
                i += 1
                if q == "\\" and c != "`" and i < n:
                    cur.append(sql[i])
                    i += 1
                elif q == c:
                    break
        elif c == "-" and nxt == "-":
            while i < n and sql[i] != "\n":
                cur.append(sql[i])
                i += 1
        elif c == "/" and nxt == "*":
            end = sql.find("*/", i + 2)
            end = n if end == -1 else end + 2
            cur.append(sql[i:end])
            i = end
        elif c == ";":
            if has_code:
                out.append("".join(cur).strip())
            cur = []
            has_code = False
            i += 1
        else:
            has_code = has_code or not c.isspace()
            cur.append(c)
            i += 1
    if has_code:
        out.append("".join(cur).strip())
    return out


_TYPE_MAP = {
    **dict.fromkeys(("STRING", "VARCHAR", "CHAR"), "string"),
    **dict.fromkeys(
        ("BIGINT", "LONG", "INT", "INTEGER", "SMALLINT", "SHORT", "TINYINT", "BYTE"),
        "int",
    ),
    **dict.fromkeys(("DOUBLE", "FLOAT", "REAL"), "float"),
    **dict.fromkeys(("DECIMAL", "DEC", "NUMERIC"), "numeric"),
    "BOOLEAN": "bool",
    "DATE": "date",
    "TIMESTAMP": "timestamp",
    "TIMESTAMP_LTZ": "timestamp",
    "TIMESTAMP_NTZ": "datetime",
    "ARRAY": "array",
    "MAP": "map",
    "STRUCT": "struct",
}


def map_databricks_type(type_name: str) -> str:
    """Databricks type names (information_schema `full_data_type`) to the
    studio's ColumnType values."""
    base = re.split(r"[(<]", type_name.strip().upper(), maxsplit=1)[0].strip()
    return _TYPE_MAP.get(base, "unknown")


def _at(row: list[str | None], index: int) -> str | None:
    return row[index] if index < len(row) else None


def _drop_none(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}
