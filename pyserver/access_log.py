"""Per-request access log for the hosted resolver: one BigQuery row per request.

The record trilogy-cloud's platform reporting reads for resolver traffic
(``platform_models/platform_reporting/resolver_traffic.preql`` there). Fly keeps
about 100 lines of log buffer and its edge metrics carry no route or client, so
without this nothing can say which endpoints studio uses, from where, how long
they take, or how often the request gate turns callers away.

Off unless ``ACCESS_LOG=bigquery``. The desktop bundle, local development and
the test suite record nothing. Deployed (fly.toml), rows stream to
``ACCESS_LOG_TABLE`` (``project.dataset.table``) with ``tabledata.insertAll``
as the service account whose JSON key is in ``GCP_SA_KEY``. The table and its
schema live in trilogy-cloud's terraform (``terraform/api_logs.tf``,
``terraform/schemas/resolver_requests.json``); :func:`bigquery_row` must match
that schema column for column.

What a row holds:

- **The route template**, for a request that matched one. The resolver's
  routes carry no ids, but the template is the stable key either way. Only an
  *unmatched* request keeps its path (truncated, no query string, id-like
  segments masked), because the probe itself is what a scanner reveals.
- **No query string, no body, no headers beyond those below.** Request bodies
  are customer models and queries; only the dialect and the number of queries
  in a batch are kept, noted by the endpoint (:func:`note`).
- **The caller**: ``Fly-Client-IP``, the ``Fly-Region`` edge, ``User-Agent``
  and ``Origin`` (truncated). Origin is what separates hosted studio from a
  local build, the desktop app and scripts, none of which sign in.
- **Where the caller is**: country and network from DB-IP's free databases
  (CC BY 4.0), looked up by the writer thread, never on the request path.
  Paths come from ``GEOIP_COUNTRY_DB`` / ``GEOIP_ASN_DB`` (the image bundles
  both); a missing file leaves the columns NULL.
- **What the request cost**: total latency, and for gated endpoints the time
  spent waiting for a worker thread (``queue_ms``). A 503 is the gate
  refusing the request outright.
- **Which machine answered** (``FLY_MACHINE_ID``), so a cold start is visible
  as a new machine.

Client IPs and user agents are personal data. The table expires partitions
after 30 days; nothing here keeps a copy.

The write is off the request path and best-effort: requests go into a bounded
queue (a full queue drops the row and counts it), and one daemon thread per
worker process batches them into ``insertAll`` calls. A failed write drops the
batch with a warning. Losing access-log rows must never fail or slow a request.

``GET /health`` is not recorded: Fly's checks call it every 30 seconds and do
not arrive through the edge.
"""

from __future__ import annotations

import contextvars
import json
import logging
import os
import queue
import re
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("trilogy.access_log")

UNMATCHED_ROUTE = "<unmatched>"
#: A CORS preflight, answered by CORSMiddleware before routing.
PREFLIGHT_ROUTE = "<preflight>"
SKIPPED_PATHS = frozenset({"/health"})

QUEUE_CAPACITY = 10_000
BATCH_MAX = 500
FLUSH_INTERVAL_SECONDS = 10.0

MAX_PATH_CHARS = 300
MAX_USER_AGENT_CHARS = 300
MAX_ORIGIN_CHARS = 120
MAX_HOST_CHARS = 120
MAX_AS_ORG_CHARS = 200
MAX_DIALECT_CHARS = 40

TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/bigquery.insertdata"
#: Refresh this long before Google's stated expiry.
TOKEN_SLACK_SECONDS = 300


# ---------------------------------------------------------------------------
# What an endpoint adds to its own row
# ---------------------------------------------------------------------------

_notes: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "access_log_notes", default=None
)


def note(**values: Any) -> None:
    """Attach values to the current request's row. A no-op outside a logged
    request (tests, the desktop app, a disabled log)."""
    notes = _notes.get()
    if notes is not None:
        notes.update(values)


# ---------------------------------------------------------------------------
# Rows
# ---------------------------------------------------------------------------


@dataclass
class AccessRecord:
    requested_at: datetime
    method: str
    route: str
    status: int
    latency_ms: int
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    path: str | None = None
    request_bytes: int | None = None
    client_ip: str | None = None
    edge_region: str | None = None
    user_agent: str | None = None
    origin: str | None = None
    host: str | None = None
    machine_id: str | None = None
    dialect: str | None = None
    query_count: int | None = None
    queue_ms: int | None = None
    country: str | None = None
    asn: int | None = None
    as_org: str | None = None


def bigquery_row(r: AccessRecord) -> dict[str, Any]:
    """One row in the shape of trilogy-cloud's
    ``terraform/schemas/resolver_requests.json``."""
    return {
        "request_id": r.request_id,
        "requested_at": r.requested_at.isoformat(timespec="microseconds").replace(
            "+00:00", "Z"
        ),
        "method": r.method,
        "route": r.route,
        "path": r.path,
        "status": r.status,
        "latency_ms": r.latency_ms,
        "queue_ms": r.queue_ms,
        "request_bytes": r.request_bytes,
        "dialect": r.dialect,
        "query_count": r.query_count,
        "client_ip": r.client_ip,
        "edge_region": r.edge_region,
        "user_agent": r.user_agent,
        "origin": r.origin,
        "host": r.host,
        "machine_id": r.machine_id,
        "country": r.country,
        "asn": r.asn,
        "as_org": r.as_org,
    }


def truncate(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    return value if len(value) <= limit else value[:limit]


_UUID = re.compile(
    r"^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$"
)
_LONG_HEX = re.compile(r"^[0-9a-fA-F]{16,}$")
_DIGITS = re.compile(r"^\d{4,}$")
_TOKENISH = re.compile(r"^[A-Za-z0-9_\-]{32,}$")


def mask_path(path: str) -> str:
    """An unmatched path with id-like and token-like segments replaced, so a
    caller's own identifiers never land in the log."""
    segments = []
    for segment in path.split("/"):
        if _UUID.match(segment) or _LONG_HEX.match(segment) or _DIGITS.match(segment):
            segments.append(":id")
        elif _TOKENISH.match(segment):
            segments.append(":token")
        else:
            segments.append(segment)
    return truncate("/".join(segments), MAX_PATH_CHARS) or "/"


# ---------------------------------------------------------------------------
# Geolocation
# ---------------------------------------------------------------------------


class Geo:
    """DB-IP country + ASN readers. Either may be absent."""

    def __init__(self, country: Any = None, asn: Any = None):
        self.country = country
        self.asn = asn

    @classmethod
    def from_env(cls) -> Geo:
        def open_db(var: str) -> Any:
            path = os.environ.get(var)
            if not path:
                return None
            try:
                import maxminddb

                return maxminddb.open_database(path)
            except Exception as exc:  # noqa: BLE001 -- geo is optional
                logger.warning(
                    "access log: %s=%s unreadable (%s); geo columns stay NULL",
                    var,
                    path,
                    exc,
                )
                return None

        geo = cls(open_db("GEOIP_COUNTRY_DB"), open_db("GEOIP_ASN_DB"))
        logger.info(
            "access log geolocation: country %s, asn %s",
            "on" if geo.country else "off",
            "on" if geo.asn else "off",
        )
        return geo

    def enrich(self, record: AccessRecord) -> None:
        if not record.client_ip:
            return
        try:
            if self.country is not None:
                found = self.country.get(record.client_ip) or {}
                record.country = (found.get("country") or {}).get("iso_code")
            if self.asn is not None:
                found = self.asn.get(record.client_ip) or {}
                record.asn = found.get("autonomous_system_number")
                record.as_org = truncate(
                    found.get("autonomous_system_organization"), MAX_AS_ORG_CHARS
                )
        except ValueError:
            # Not an IP address (a malformed Fly-Client-IP).
            return


# ---------------------------------------------------------------------------
# BigQuery
# ---------------------------------------------------------------------------


class BigQueryTable:
    """A table written with streaming inserts as a service account."""

    def __init__(self, spec: str, credentials: dict[str, Any]):
        parts = spec.split(".")
        if len(parts) != 3 or not all(
            re.fullmatch(r"[A-Za-z0-9_\-]+", p) for p in parts
        ):
            raise ValueError(f"ACCESS_LOG_TABLE={spec} is not project.dataset.table")
        for key in ("client_email", "private_key"):
            if not credentials.get(key):
                raise ValueError(f"GCP_SA_KEY has no {key}")
        self.project, self.dataset, self.table = parts
        self.credentials = credentials
        self._token: str | None = None
        self._token_expires = 0.0
        self.http = httpx.Client(timeout=30.0)

    @property
    def name(self) -> str:
        return f"{self.project}.{self.dataset}.{self.table}"

    @property
    def url(self) -> str:
        return (
            "https://bigquery.googleapis.com/bigquery/v2/projects/"
            f"{self.project}/datasets/{self.dataset}/tables/{self.table}"
        )

    def access_token(self) -> str:
        """An OAuth token from the key's signed JWT (the service-account
        flow), cached until shortly before it expires."""
        now = time.time()
        if self._token and now < self._token_expires:
            return self._token
        import jwt

        assertion = jwt.encode(
            {
                "iss": self.credentials["client_email"],
                "scope": SCOPE,
                "aud": TOKEN_URL,
                "iat": int(now),
                "exp": int(now) + 3600,
            },
            self.credentials["private_key"],
            algorithm="RS256",
            headers={"kid": self.credentials.get("private_key_id", "")},
        )
        response = self.http.post(
            TOKEN_URL,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
        )
        response.raise_for_status()
        body = response.json()
        self._token = body["access_token"]
        self._token_expires = (
            now + int(body.get("expires_in", 3600)) - TOKEN_SLACK_SECONDS
        )
        return self._token

    def insert(self, rows: list[AccessRecord]) -> None:
        response = self.http.post(
            f"{self.url}/insertAll",
            headers={"Authorization": f"Bearer {self.access_token()}"},
            json=insert_all_body(rows),
        )
        if response.status_code >= 300:
            raise RuntimeError(
                f"insertAll returned {response.status_code}: {response.text[:500]}"
            )
        # A 200 can still carry per-row refusals. With skipInvalidRows off,
        # one bad row fails the whole request, so any entry means none landed.
        errors = response.json().get("insertErrors") or []
        if errors:
            raise RuntimeError(
                f"insertAll refused the batch ({len(errors)} row error(s)): "
                f"{json.dumps(errors[0])[:500]}"
            )


def insert_all_body(rows: list[AccessRecord]) -> dict[str, Any]:
    """``insertId`` is the row id, so BigQuery drops a retried duplicate
    within its best-effort dedup window."""
    return {
        "skipInvalidRows": False,
        "ignoreUnknownValues": False,
        "rows": [{"insertId": r.request_id, "json": bigquery_row(r)} for r in rows],
    }


# ---------------------------------------------------------------------------
# The writer
# ---------------------------------------------------------------------------


class AccessLog:
    """Queue + writer thread. The thread starts on the first record in each
    process: gunicorn ``--preload`` imports the app in the master and forks,
    and a thread started before the fork does not exist in the workers."""

    def __init__(
        self,
        write: Callable[[list[AccessRecord]], None],
        geo: Geo | None = None,
        flush_interval: float = FLUSH_INTERVAL_SECONDS,
    ):
        self.write = write
        self.geo = geo or Geo()
        self.flush_interval = flush_interval
        self.dropped = 0
        self._queue: queue.Queue[AccessRecord] = queue.Queue(QUEUE_CAPACITY)
        self._pid: int | None = None
        self._lock = threading.Lock()

    def record(self, record: AccessRecord) -> None:
        self._ensure_writer()
        try:
            self._queue.put_nowait(record)
        except queue.Full:
            self.dropped += 1

    def _ensure_writer(self) -> None:
        pid = os.getpid()
        if self._pid == pid:
            return
        with self._lock:
            if self._pid == pid:
                return
            # A forked child inherits the parent's queue object; start clean.
            self._queue = queue.Queue(QUEUE_CAPACITY)
            threading.Thread(
                target=self._run, name="access-log-writer", daemon=True
            ).start()
            self._pid = pid

    def _run(self) -> None:
        batch: list[AccessRecord] = []
        deadline = time.monotonic() + self.flush_interval
        while True:
            timeout = max(0.0, deadline - time.monotonic())
            try:
                record = self._queue.get(timeout=timeout)
                self.geo.enrich(record)
                batch.append(record)
            except queue.Empty:
                pass
            if len(batch) >= BATCH_MAX or time.monotonic() >= deadline:
                self.flush(batch)
                batch = []
                deadline = time.monotonic() + self.flush_interval

    def flush(self, batch: list[AccessRecord]) -> None:
        if self.dropped:
            logger.warning("access log: dropped %d record(s), queue full", self.dropped)
            self.dropped = 0
        if not batch:
            return
        try:
            self.write(batch)
        except Exception as exc:  # noqa: BLE001 -- the log must never take the server down
            logger.warning(
                "access log: dropped a batch of %d row(s): %s", len(batch), exc
            )


def from_env() -> AccessLog | None:
    """The configured access log, or None when ``ACCESS_LOG`` is unset or
    ``off``. A misconfigured log (no table, no usable key) is logged as an
    error and the server runs without one: the resolver serves every studio
    user, and losing a day of traffic rows is the cheaper failure."""
    mode = (os.environ.get("ACCESS_LOG") or "off").strip().lower()
    if mode == "off":
        return None
    try:
        return _bigquery_from_env(mode)
    except (RuntimeError, TypeError, ValueError) as exc:
        logger.error("access log: %s; running without an access log", exc)
        return None


def _bigquery_from_env(mode: str) -> AccessLog:
    if mode != "bigquery":
        raise RuntimeError(f"ACCESS_LOG={mode} is not one of off, bigquery")
    spec = (os.environ.get("ACCESS_LOG_TABLE") or "").strip()
    if not spec:
        raise RuntimeError(
            "ACCESS_LOG=bigquery needs ACCESS_LOG_TABLE (project.dataset.table)"
        )
    try:
        credentials = json.loads(os.environ.get("GCP_SA_KEY") or "")
    except json.JSONDecodeError:
        raise RuntimeError(
            "ACCESS_LOG=bigquery needs GCP_SA_KEY (a service-account JSON key)"
        ) from None
    if not isinstance(credentials, dict):
        raise TypeError("GCP_SA_KEY is not a service-account JSON key")
    table = BigQueryTable(spec, credentials)
    logger.info("access log: streaming to BigQuery table %s", table.name)
    return AccessLog(table.insert, Geo.from_env())


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------


def _header(headers: list[tuple[bytes, bytes]], name: bytes) -> str | None:
    for key, value in headers:
        if key == name:
            return value.decode("latin-1")
    return None


class AccessLogMiddleware:
    """Pure ASGI, so the endpoint runs in this middleware's context and its
    :func:`note` calls land on this request's row (``BaseHTTPMiddleware``
    would run it in a copied context)."""

    def __init__(self, app: ASGIApp, log: AccessLog):
        self.app = app
        self.log = log

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") in SKIPPED_PATHS:
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        requested_at = datetime.now(timezone.utc)
        status = 500
        notes: dict[str, Any] = {}
        token = _notes.set(notes)

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            _notes.reset(token)
            try:
                self.log.record(
                    build_record(scope, status, requested_at, started, notes)
                )
            except Exception:
                logger.exception("access log: could not record a request")


def build_record(
    scope: Scope,
    status: int,
    requested_at: datetime,
    started: float,
    notes: dict[str, Any],
) -> AccessRecord:
    headers = scope.get("headers") or []
    route = scope.get("route")
    template = getattr(route, "path", None)
    content_length = _header(headers, b"content-length")
    dialect = notes.get("dialect")
    query_count = notes.get("query_count")
    queue_ms = notes.get("queue_ms")
    method = scope.get("method", "")
    if template:
        route, path = template, None
    elif method == "OPTIONS" and _header(headers, b"access-control-request-method"):
        route, path = PREFLIGHT_ROUTE, None
    else:
        route, path = UNMATCHED_ROUTE, mask_path(scope.get("path", ""))
    return AccessRecord(
        requested_at=requested_at,
        method=method,
        route=route,
        path=path,
        status=status,
        latency_ms=int((time.perf_counter() - started) * 1000),
        request_bytes=int(content_length)
        if content_length and content_length.isdigit()
        else None,
        client_ip=_header(headers, b"fly-client-ip"),
        edge_region=_header(headers, b"fly-region"),
        user_agent=truncate(_header(headers, b"user-agent"), MAX_USER_AGENT_CHARS),
        origin=truncate(_header(headers, b"origin"), MAX_ORIGIN_CHARS),
        host=truncate(_header(headers, b"host"), MAX_HOST_CHARS),
        machine_id=os.environ.get("FLY_MACHINE_ID"),
        dialect=truncate(str(dialect), MAX_DIALECT_CHARS) if dialect else None,
        query_count=int(query_count) if query_count is not None else None,
        queue_ms=int(queue_ms) if queue_ms is not None else None,
    )
