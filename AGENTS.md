## Context on Setup

### /lib
/lib contains core typescript code

This should be reusable outside this package, via a published NPM package.

Vue project.

### /prism-trilogy
/prism-trilogy is the standalone `@trilogy-data/prism-trilogy` package: the Prism grammar for
Trilogy plus `src/vocabulary.ts`, the shared keyword/function/type lists.

That vocabulary is the single source of truth for language words. The Monaco Monarch grammar
(`lib/monaco/trilogyLanguage.ts`), the Prism registration (`lib/utility/prism.ts`) and the `::`
autocomplete (`lib/language/constants.ts`) all read from it — do not add a word to any of those
directly. `scripts/check-trilogy-vocabulary.mjs --check` diffs the vocabulary against pytrilogy's
`trilogy/parsing/trilogy.lark` and fails CI on drift.

It is a linked, build-time-only dependency of /lib (bundled into lib's dist, so it must be built
first: `pnpm build:grammar`). It publishes to npm on its own version, via
`.github/workflows/publish-prism-trilogy.yml`.

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