

## Fly.io deployment

```bash
fly deploy
```

Docker build runs tests. Make sure they pass.

## Tests

Basic pytest coverage.

```bash
mypy . --explicit-package-bases
```