# @trilogy-data/prism-trilogy

Prism syntax highlighting for the [Trilogy](https://trilogydata.dev) language, plus the raw
language vocabulary the grammar is built from.

Zero runtime dependencies. `prismjs` is an optional peer — the grammar itself is plain data and
needs no Prism code to construct.

## Install

```bash
pnpm add @trilogy-data/prism-trilogy prismjs
```

## Use

### Bundler / ESM

```js
import Prism from 'prismjs'
import '@trilogy-data/prism-trilogy/register'

const html = Prism.highlight(source, Prism.languages.trilogy, 'trilogy')
```

Or register explicitly, which is what you want if you hold your own Prism instance:

```js
import Prism from 'prismjs'
import { registerTrilogy } from '@trilogy-data/prism-trilogy'

registerTrilogy(Prism)
```

Both register the grammar under `trilogy` and under `preql`, the language's former name, which
still turns up in older fenced code blocks and saved models.

> **One Prism, please.** Prism keeps grammars on a module-level singleton. If your bundler gives
> the app and this package separate copies of `prismjs`, the grammar lands on the instance nobody
> highlights with — which shows up as silently unhighlighted code, not an error. Keep `prismjs`
> external in library builds and deduped in app builds.

### Script tag / CDN / autoloader

`dist/prism-trilogy.js` is a classic Prism component: it attaches to the global `Prism` exactly
like the files in `prismjs/components/`.

```html
<script src="https://unpkg.com/prismjs/prism.js"></script>
<script src="https://unpkg.com/@trilogy-data/prism-trilogy/dist/prism-trilogy.js"></script>
<pre><code class="language-trilogy">select sum(x) -&gt; total;</code></pre>
```

### Other highlighters

The grammar object is exported on its own, so it also drops into anything that speaks Prism's
grammar format (`refractor`, `react-syntax-highlighter`):

```js
import { trilogyGrammar } from '@trilogy-data/prism-trilogy'
```

### Vocabulary only

`@trilogy-data/prism-trilogy/vocabulary` is the keyword/function/type data with no highlighter
attached, for building a Monaco Monarch grammar, a TextMate bundle, an autocomplete provider or a
linter off the same lists:

```js
import { KEYWORDS, FUNCTIONS, DATA_TYPES, callPattern } from '@trilogy-data/prism-trilogy/vocabulary'
```

## Design notes

The grammar is **standalone, not derived from `Prism.languages.sql`**. Trilogy's lexical rules
disagree with SQL's on the things that matter most for reading a file:

| | Trilogy | SQL |
|---|---|---|
| Line comment | `#`, `//` | `--` |
| Block comment | none | `/* */` |
| `--` | `select_hide_modifier` — hides one select item | comment to end of line |
| Derivation / alias | `<-`, `->` | — |
| Cast | `x::int` | `cast(x as int)` |
| Custom function | `@name(...)` | — |
| Filter | `x ? y > 1` | — |

An SQL-derived grammar gets the two comment rules exactly backwards: a `#` comment is not
highlighted as one, and a `--hidden` modifier is.

Two ordering decisions in the grammar are load-bearing:

- **Function names are gated on call position** (`name` followed by `(`), against an explicit name
  list. That resolves the type/function overlap — `date(x)` is a function, a bare `date` is a type —
  and it is why `not (...)`, `in (...)` and `(select ...)` are not mistaken for calls.
- **Namespace segments are anchored on a leading letter**, so the rule can never match the `1.` of
  a decimal literal.

## Keeping up with the language

`src/vocabulary.ts` is derived from `trilogy/parsing/trilogy.lark` in
[pytrilogy](https://pypi.org/project/pytrilogy/), cut against **0.3.335**.

## Development

```bash
pnpm install
pnpm test        # vitest, tokenizes real Trilogy and asserts token types
pnpm typecheck
pnpm build       # ESM entries + the IIFE component build
```

## Releasing

Versioned independently of `@trilogy-data/trilogy-studio-components` — this package is meant to be
consumed outside this repo, so its cadence is its own.

Bump `version` in `package.json` and merge to `main`. `.github/workflows/publish-prism-trilogy.yml`
typechecks, tests, builds, and publishes if that version is not already on npm; an unchanged version
is a no-op, so merging other changes is safe.

The studio build does **not** depend on this being published — `lib` bundles the grammar from the
local `link:` reference — so a failed publish never blocks a studio release.
