# Bug: stdlib files' relative imports are not resolved as stdlib (breaks `std.money` under `DictImportResolver`)

**Package:** pytrilogy
**Version observed:** 0.3.277 (also present in earlier 0.3.2xx)
**Severity:** High — makes `std.money` unusable for any consumer that parses with a `DictImportResolver` (e.g. the web/sandbox studio backend). Any future stdlib file that imports a sibling is affected the same way.

## Summary

When the parser descends into a standard-library file, it loses the "this is stdlib" context. A stdlib file that imports a **sibling stdlib file with a bare relative name** (e.g. `std/money.preql` → `import currency;`) has that nested import resolved against whatever import resolver the environment config carries, instead of against the filesystem stdlib. With a `DictImportResolver` (which only knows client-provided source files), the nested import fails:

```
Unable to import 'lineitem', parsing error: Unable to import
'/usr/local/lib/python3.13/site-packages/trilogy/std/money.preql', parsing error:
Unable to import file currency, not resolvable from provided source files.
```

`std/money.preql` is currently the only stdlib file with a sibling import, which is why `std.date`, `std.geography`, etc. don't trip it — but the bug is general.

## Minimal reproduction (stock pytrilogy, default config)

```python
from trilogy import Environment
from trilogy.core.models.environment import EnvironmentConfig, DictImportResolver

content = {"lineitem": "import std.money;\nkey id int;"}
env = Environment(config=EnvironmentConfig(import_resolver=DictImportResolver(content=content)))
env.parse("import lineitem;")
# raises ImportError: ... Unable to import file currency, not resolvable from provided source files.
```

`std/money.preql` is a single line: `import currency;`.

## Root cause

Two pieces interact:

1. **stdlib detection is text-only and top-level only.** In
   `trilogy/parsing/v2/rules/import_rules.py`, `_resolve_import_path` decides:

   ```python
   path = input_path.split(".")
   is_stdlib = path[0] == "std"
   ```

   This is true for the *top-level* `import std.money;`, but when `money.preql` is
   parsed and its `import currency;` statement is hydrated, `input_path` is
   `"currency"`, so `path[0] == "std"` is `False`. The nested import is **not**
   flagged as stdlib.

2. **child parses inherit the parent resolver.** In
   `trilogy/parsing/v2/import_service.py`, the stdlib file is read from disk
   correctly (because `request.is_stdlib` was `True` for `std.money`):

   ```python
   text = _read_import_text(request.target, environment, request.is_stdlib)  # money.preql via safe_open
   ...
   new_env = Environment(
       working_path=dirname(request.target),                 # = .../trilogy/std
       config=environment.config.copy_for_root(root=root),   # resolver is copied/kept
       ...
   )
   ```

   The child env's config still carries the `DictImportResolver`. So when
   `import currency;` is hydrated with `is_stdlib=False`, `_resolve_import_path`
   takes the `DictImportResolver` branch (`target = ".".join(path) = "currency"`),
   and `_read_import_text` raises because `"currency"` isn't in the client's
   content dict.

   Note the child env's `working_path` is already the std directory — so a
   *filesystem* resolution of `currency` would have found
   `.../trilogy/std/currency.preql`. The context needed to resolve it correctly
   is present; it's just not used because `is_stdlib` was lost.

## Suggested fixes (any one of these)

**Option A — propagate stdlib context to nested imports (preferred).**
Once parsing inside a stdlib file, treat its relative imports as stdlib. E.g.
thread an `is_stdlib`/`in_stdlib` flag through `ImportRequest` →
`ImportHydrationService` → `HydrationContext`, and in `_resolve_import_path`
compute `is_stdlib = path[0] == "std" or context.in_stdlib`. Resolve the target
against `working_path` (the std dir) so siblings load from disk.

**Option B — detect stdlib by resolved path / working_path.**
In `_resolve_import_path`, also treat the import as stdlib when
`environment.working_path` is within the bundled `STDLIB_ROOT/std`. This catches
nested relative imports regardless of the import text.

**Option C — read from filesystem when the resolved file lives under stdlib.**
In `_read_import_text`, if `address` resolves under the trilogy std directory,
fall back to `safe_open` even when the resolver is a `DictImportResolver`.

Option A is the most precise: the real invariant is "a stdlib file's relative
imports are themselves stdlib imports."

## Current workaround (downstream, in trilogy-studio-core)

The studio subclasses `EnvironmentConfig` and, in `copy_for_root`, swaps the
inherited `DictImportResolver` for a `FileSystemImportResolver` whenever the
child-parse `root` is inside trilogy's bundled `std/` directory. With a
filesystem resolver, the child env's `working_path` (the std dir) resolves
`import currency;` off disk. See `pyserver/env_helpers.py`
(`_is_stdlib_root` + `StudioEnvironmentConfig.copy_for_root`). This can be
removed once the upstream fix lands.

## Suggested regression test (upstream)

```python
def test_stdlib_sibling_import_under_dict_resolver():
    from trilogy import Environment
    from trilogy.core.models.environment import EnvironmentConfig, DictImportResolver

    content = {"lineitem": "import std.money;\nkey id int;\nproperty id.amount float::usd;"}
    env = Environment(config=EnvironmentConfig(import_resolver=DictImportResolver(content=content)))
    env.parse("import lineitem;")
    assert "usd" in env.data_types  # type from std/currency.preql, reached via std/money.preql
```
