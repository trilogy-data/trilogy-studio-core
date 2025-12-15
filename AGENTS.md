## Context on Setup

### /lib
/lib contains core typescript code

This should be reusable outside this package, via a published NPM package.

Vue project.

### /pyserver
/pyserver contains backend server python code

This includes a API server and a MCP server.

### /src
/src contains a frontend wrapper that uses components in lib and is the default IDE.

## CI
Deployed on github CI

## Development

Always use pnpm, not npm.

After updating python scripts (in the pyserver subfolder, always cd into it for python work)

```bash
mypy . --explicit-package-bases
ruff check . --fix
black
```

The virtual env should always be referenced from base of repo; always use a virtual env.

example on windows:

```./venv/Scripts/python.exe```