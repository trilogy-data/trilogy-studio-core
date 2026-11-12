"""What the resolver refuses, and why.

The hosted resolver is a public, unauthenticated API: anyone can POST a model
and a query and get SQL back. Nothing is executed and nothing is stored, so
the things worth defending are the process itself (availability) and the
machine it runs on (its filesystem). This module holds the limits and guards
that do that; `io_models` applies them to request bodies and `main` wires the
transport-level ones.

Every limit is an environment variable so a deployment can move it without a
code change. `0` disables a limit.
"""

from __future__ import annotations

import os
import re

from trilogy import Environment
from trilogy.core.enums import AddressType
from trilogy.core.models.datasource import Address


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return max(int(raw), 0)
    except ValueError:
        return default


def _env_flag(name: str) -> bool | None:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return None
    return raw in ("1", "true", "yes", "on")


# ---------------------------------------------------------------------------
# Hosted mode
#
# True when the server runs for callers it shares no machine with (the Fly
# deployment, the all-in-one Docker image). False for the desktop bundle and
# local development, where the caller owns the filesystem the server sees.
# Both Dockerfiles set IN_DOCKER_IMAGE=1; TRILOGY_HOSTED overrides either way.
# ---------------------------------------------------------------------------
_hosted_override = _env_flag("TRILOGY_HOSTED")
HOSTED: bool = (
    _hosted_override
    if _hosted_override is not None
    else os.environ.get("IN_DOCKER_IMAGE", "") == "1"
)

# ---------------------------------------------------------------------------
# Size limits
# ---------------------------------------------------------------------------

#: Whole request body. Requests carry the full model on every call, so this is
#: the bound on what one request can make the server hold and parse. The
#: largest model in the test payloads is 8 KB.
MAX_BODY_BYTES = _env_int("TRILOGY_MAX_BODY_BYTES", 5 * 1024 * 1024)
#: Queries in one /generate_queries batch. A batch holds a worker thread until
#: its last query is planned, so this bounds how long one admitted request can
#: keep it.
MAX_QUERIES_PER_BATCH = _env_int("TRILOGY_MAX_QUERIES_PER_BATCH", 500)
MAX_MODEL_SOURCES = _env_int("TRILOGY_MAX_MODEL_SOURCES", 1000)
MAX_IMPORTS = _env_int("TRILOGY_MAX_IMPORTS", 500)
MAX_FILES = _env_int("TRILOGY_MAX_FILES", 2000)
#: Generous on purpose: a dashboard `in (...)` filter binds one parameter per
#: selected value, so a large multi-select is thousands of parameters in one
#: long filter string.
MAX_EXTRA_FILTERS = _env_int("TRILOGY_MAX_EXTRA_FILTERS", 200)
MAX_FILTER_CHARS = _env_int("TRILOGY_MAX_FILTER_CHARS", 200_000)
MAX_PARAMETERS = _env_int("TRILOGY_MAX_PARAMETERS", 5000)
MAX_NAME_CHARS = 500

# ---------------------------------------------------------------------------
# Nesting guard
#
# pytrilogy's Rust (pest) parser recurses once per nesting level with no depth
# limit, so a few kilobytes of `((((...` overflow the native stack and abort
# the whole worker process: no exception, every in-flight request on that
# worker is lost. Measured on pytrilogy 0.3.489 for parentheses, brackets,
# `case`, `not`, inline filters (`?`) and nested types (`list<list<...`).
#
# Bracket depth is tracked exactly. The bracketless constructs cannot be
# given a depth without parsing, so they are bounded by how many a single
# statement holds: N of them cannot nest deeper than N.
#
# This is a stopgap for the constructs known to recurse. The real fix is a
# depth limit in pytrilogy's parser.
# ---------------------------------------------------------------------------
MAX_NESTING_DEPTH = _env_int("TRILOGY_MAX_NESTING_DEPTH", 64)
MAX_STATEMENT_NESTABLE_TOKENS = _env_int("TRILOGY_MAX_STATEMENT_NESTABLE_TOKENS", 250)

_NESTING_TOKEN = re.compile(
    r"""
      '''.*?''' | \"\"\".*?\"\"\"          # triple-quoted strings
    | '(?:[^'\\]|\\.)*' | "(?:[^"\\]|\\.)*"  # strings
    | `[^`]*`                               # quoted identifiers / paths
    | \#[^\n]*                              # comments
    | (?P<open>[(\[{])
    | (?P<close>[)\]}])
    | (?P<end>;)
    | (?P<nestable>\?|<|\b(?:case|not)\b)
    """,
    re.VERBOSE | re.DOTALL | re.IGNORECASE,
)


def check_nesting(text: str) -> str:
    """Raise ValueError if `text` nests deeper than the parser can be trusted
    with. Linear in the length of the text."""
    if not MAX_NESTING_DEPTH and not MAX_STATEMENT_NESTABLE_TOKENS:
        return text
    depth = 0
    nestable = 0
    for match in _NESTING_TOKEN.finditer(text):
        kind = match.lastgroup
        if kind == "open":
            depth += 1
            if MAX_NESTING_DEPTH and depth > MAX_NESTING_DEPTH:
                raise ValueError(
                    f"brackets nested more than {MAX_NESTING_DEPTH} levels deep"
                )
        elif kind == "close":
            depth = max(depth - 1, 0)
        elif kind == "end":
            depth = 0
            nestable = 0
        elif kind == "nestable":
            nestable += 1
            if (
                MAX_STATEMENT_NESTABLE_TOKENS
                and nestable > MAX_STATEMENT_NESTABLE_TOKENS
            ):
                raise ValueError(
                    "statement too complex: more than "
                    f"{MAX_STATEMENT_NESTABLE_TOKENS} case / not / ? / < "
                    "tokens in one statement"
                )
    return text


# ---------------------------------------------------------------------------
# Names spliced into Trilogy source
#
# Import names, import aliases and parameter names are interpolated into
# `import <name> as <alias>;` and `parameter <name> <type>;`. They are
# identifiers, never expressions, so anything that could end the statement or
# start another is refused instead of being passed through.
# ---------------------------------------------------------------------------
_PARAMETER_NAME = re.compile(r":?[A-Za-z_][A-Za-z0-9_]*")
_UNSAFE_NAME_CHARS = re.compile(r"[\s;'\"`#]")


def check_parameter_name(name: str) -> str:
    if len(name) > MAX_NAME_CHARS or not _PARAMETER_NAME.fullmatch(name):
        raise ValueError(
            "parameter names must be identifiers, optionally prefixed with ':'"
        )
    return name


def check_import_name(name: str) -> str:
    # Empty is allowed: clients send `alias: ""` for "no alias".
    if len(name) > MAX_NAME_CHARS or _UNSAFE_NAME_CHARS.search(name):
        raise ValueError(
            "import names and aliases cannot contain whitespace, quotes, ';' or '#'"
        )
    return name


# ---------------------------------------------------------------------------
# Local file reads
# ---------------------------------------------------------------------------


class LocalFileAccessError(ValueError):
    pass


def reject_server_file_reads(env: Environment) -> None:
    """Refuse a model that would make a hosted resolver read its own disk.

    A datasource bound to a `.sql` file is rendered by opening that file and
    inlining its contents into the generated SQL (`BaseDialect.render_source`).
    Locally that is the feature. Hosted, the path is the caller's and the disk
    is the server's: `file \\`/any/path.sql\\`` returns that file's contents
    in the response. A hosted resolver can never see the caller's files, so
    there is no legitimate request this turns away.

    Other file types (csv, parquet, scripts) are only ever rendered as a path
    for the caller's engine to open, never read here.
    """
    if not HOSTED:
        return
    for name, datasource in env.datasources.items():
        address = datasource.address
        if isinstance(address, Address) and address.type == AddressType.SQL:
            raise LocalFileAccessError(
                f"Datasource '{name}' reads a .sql file, which a hosted "
                "resolver cannot open. Inline the query in the datasource "
                "(`query '''...'''`) or run the resolver locally."
            )
