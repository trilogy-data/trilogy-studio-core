## Context on Setup

### /lib
/lib contains core typescript code

This should be reusable outside this package, via a published NPM package.

### /pyserver
/pyserver contains backend server python code

This includes a API server and a MCP server.

### /src
/src contains a frontend wrapper that uses components in lib and is the default IDE.

## CI
Deployed on github CI

## Development

Always use pnpm, not npm.