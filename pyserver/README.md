

## Fly.io deployment

```bash
fly deploy
```

Docker build runs tests. Make sure they pass.

## Tests/CI

Pytest for most tests.

Ruff for formatting.

Mypy for type checking; requires explicit package base; run from pyserver subfolder.
```bash
mypy . --explicit-package-bases
```