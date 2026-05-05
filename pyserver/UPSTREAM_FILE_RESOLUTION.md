# Proposal: pluggable file-existence resolver for Trilogy

## Why

Trilogy's `datasource ... file '...'` feature assumes the parser has direct
filesystem access to the data files. Today, in
`trilogy/parsing/v2/rules/datasource_rules.py::_process_file_path`, the parser
unconditionally:

1. Resolves the path against `environment.working_path` (defaults to
   `os.getcwd()`).
2. Calls `Path(base).exists()` to set `Address.exists`.
3. The downstream rule (`datasource_node`) then flips the datasource status to
   `DatasourceState.UNPOPULATED` if `not exists`, and `build.py` skips
   datasources whose status isn't `PUBLISHED`.

This is correct when Trilogy runs *next to* the data — CLIs, notebooks, local
SDK use. It breaks for split-deployment topologies where the parser/compiler
runs on a server and the files live on a different machine.

Concrete case: **Trilogy Explorer** (the Tauri-shelled studio in
`trilogy-studio-core/explorer/`) is a local desktop app. It compiles Trilogy
queries by calling a hosted pyserver (`trilogy-service.fly.dev`) and executes
the returned SQL against an in-browser duckdb-wasm. CSVs/parquet files live on
the user's disk, registered with duckdb-wasm by basename. The hosted pyserver
has no view of those files, so today every `file '…'` datasource is silently
dropped during build.

We currently work around this in `pyserver/env_helpers.py::mark_known_files`
by post-processing the env after parse: walking `env.datasources`, comparing
each file address's basename to a client-supplied allowlist, and flipping
`address.exists` / `datasource.status` back. This works but it (a) ignores
glob/array forms, (b) duplicates resolution logic, and (c) couples the
pyserver to internal trilogy data classes.

## Proposed upstream change

Add an optional resolver hook on `EnvironmentConfig` that the parser consults
*instead of* `Path.exists`. Default behaviour stays identical (filesystem
check), so existing callers are unaffected.

### API sketch

```python
# trilogy/core/models/environment.py

class FileExistenceResolver(Protocol):
    """Tells the parser whether a file address should be treated as live.

    Called once per file address during parse (after path resolution but
    before the existence check). The resolver may also return a *replacement*
    path string — used by hosted compilers to rewrite addresses to whatever
    name the downstream executor will see (e.g. a basename registered with
    duckdb-wasm).
    """

    def __call__(self, resolved_path: str) -> "FileResolution | None":
        ...


@dataclass
class FileResolution:
    exists: bool
    location: str | None = None  # if set, used in place of `resolved_path`


@dataclass
class EnvironmentConfig:
    allow_duplicate_declaration: bool = True
    import_resolver: BaseImportResolver = field(
        default_factory=FileSystemImportResolver
    )
    file_resolver: FileExistenceResolver | None = None  # NEW
```

### Parser integration

```python
# trilogy/parsing/v2/rules/datasource_rules.py::_process_file_path

def _process_file_path(context: RuleContext, ipath: str) -> tuple[str, str, bool]:
    is_cloud = ipath.startswith(REMOTE_PREFIXES)
    is_glob = any(c in ipath for c in "*?[")
    if is_cloud:
        base = ipath
        suffix = "." + ipath.rsplit(".", 1)[-1] if "." in ipath else ""
    else:
        path = Path(ipath)
        if path.is_relative_to("."):
            path = Path(context.environment.working_path) / path
        base = str(path.resolve().absolute())
        suffix = path.suffix

    resolver = context.environment.config.file_resolver
    if resolver is not None:
        decision = resolver(base)
        if decision is not None:
            base = decision.location or base
            return base, suffix, decision.exists

    exists = is_cloud or is_glob or Path(base).exists()
    return base, suffix, exists
```

### Caller usage (what pyserver would do)

```python
class KnownFilesResolver:
    def __init__(self, files: Iterable[str]):
        self._known = {Path(f).name for f in files}

    def __call__(self, resolved_path: str) -> FileResolution | None:
        name = Path(resolved_path).name
        if name in self._known:
            # Force "exists" and rewrite to the basename so generated SQL
            # references the name the client knows about.
            return FileResolution(exists=True, location=name)
        return None  # fall through to default Path.exists()


env = Environment(
    config=EnvironmentConfig(
        import_resolver=DictImportResolver(content=...),
        file_resolver=KnownFilesResolver(client.files),
    )
)
```

The hosted pyserver would replace its post-parse walk with a one-line
resolver registration.

## Alternative shapes considered

1. **Boolean `skip_file_existence_check` flag.** Simpler, but would happily
   accept any path the user typed, including typos — no allowlist. We'd lose
   the safety net of "if it isn't in the manifest, the parser flags it."

2. **Reimplement file resolution server-side.** Already what we do — works,
   but tightly couples downstream tools to trilogy internals (`Address`,
   `DatasourceState`, etc.) and breaks every time the parser layout changes.

3. **Make the resolver also handle globs / arrays.** Worth doing in a v2 of
   this hook; `file [\`a.parquet\`, \`b.parquet\`]` and `file '*.parquet'`
   currently bypass the existence check (the parser trusts the caller for
   globs already) so they're not blocking. The resolver would still be useful
   for *path rewriting* in those forms.

## Migration path

- Add `FileExistenceResolver` / `FileResolution` types and the optional
  `file_resolver` field. Default `None`, no behaviour change.
- Bump trilogy minor version.
- pyserver pins the new version, deletes `mark_known_files`, and registers
  `KnownFilesResolver` on `EnvironmentConfig` instead.

## Why the hook lives on `EnvironmentConfig`, not `Environment`

`EnvironmentConfig` already holds `import_resolver` (also a swap-out point for
hosted callers using `DictImportResolver`). File resolution is the same shape
of concern — "the source of truth for *where stuff lives* isn't the local
disk" — so it belongs in the same place. Putting it on `Environment` directly
would force every caller that constructs throwaway envs (e.g. the import
parser building child environments in `import_service.py`) to thread it
through manually; `copy_for_root` already deep-copies `EnvironmentConfig`, so
the resolver propagates for free.

## Test plan upstream

- `tests/parser/test_file_resolver.py`: a `file 'absent.csv'` declaration
  with no resolver → `addr.exists is False`, status `UNPOPULATED` (existing
  behaviour, regression guard).
- Same input with a resolver that returns `FileResolution(exists=True,
  location="absent.csv")` → `addr.exists is True`, status `PUBLISHED`,
  `addr.location == "absent.csv"`.
- Resolver returning `None` falls through to default filesystem check.

## Owner

Bouncing over to upstream for review. Local reference impl that this
proposal would replace: `pyserver/env_helpers.py::mark_known_files`.
