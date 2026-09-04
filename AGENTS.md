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

### Charts

`ChartConfig` (`lib/editors/results.ts`) is **recursive**. A config with a non-empty
`layers: ChartConfig[]` is a _container_: its own field bindings are ignored and it contributes only
statement-level settings (title, legend, scales, `placements`). A config without a `layers` key is an
ordinary single-layer chart and behaves exactly as it always has — that is the compatibility
contract, so never make `layers` required or default it to an array.

Everything goes through `normalizeChartConfig` (`lib/dashboards/layerSpec.ts`), which resolves any
config to `{root, layers[]}`. Load-bearing rules:

- **Every layer declares its own params, under a suffix.** Vega param names are global to a spec,
  so `highlight` / `select` are suffixed per layer (`layerParamSuffix`, `paramName`,
  `createInteractionEncodings(suffix)`, `createColorEncoding`'s `paramSuffix`) — that suffix is what
  lets N layers of the same chart type compile at all. **Layer 0 keeps the unsuffixed names**,
  because `chartHelpers.setupEventListeners` and the brush filter transforms reference them by
  literal name.
- **Brushing is one shared interval, owned by layer 0.** Layers past it _filter on_ the same `brush`
  param rather than declaring rival ones, so there is exactly one signal to listen to. Only
  `BRUSH_DECLARING_CHART_TYPES` (`line`/`area`/`point`) declare it: a layer filtering on `brush`
  under a `bar` primary produces a spec that **Vega-Lite compiles cleanly** and then dies at
  `vega.parse` with `Unrecognized signal name`. Tests that assert a layered spec is renderable must
  therefore go all the way to `vega.parse`, not stop at `compile()`. The same rule binds the
  listener side: `setupEventListeners` subscribes to `brush` on layer 0's chart type alone, because
  `view.addSignalListener` on a signal the spec never declared throws and the chart never renders.
  "Any layer is a line" is the wrong test.
- **Clicks are attributed by datum, not assumed to be layer 0.** Handlers read fields off
  `item.datum` and map them to concept addresses through a column map, and those differ per layer
  when layers are independent selects. `resolveLayerForDatum` picks the first layer whose bound
  fields are all present — layers sharing a result set all match and layer 0 wins (same row), while
  layers over separate selects match only their own datum.
- **`yField2` is folded at render time, not in persistence.** `migrateChartConfig` only runs on
  dashboard item data and would miss the editor, LLM and statement paths. `yField2` stays a valid
  _authoring_ shape (controls panel, LLM schema); layering is the _rendering_ model. Folded for
  `bar`, `line` and `area`; a bar's secondary becomes a line, a line/area's keeps the primary's
  type.
- **`LAYERABLE_CHART_TYPES`** (`lib/dashboards/constants.ts`) is a deliberate v1 scope boundary, not
  a permanent limit. `beeswarm` emits a raw _Vega_ spec; `headline`/`tree` own their top-level
  chrome and data; `geo-map` carries a projection. Adding one means unwrapping, not just editing the
  list.
- **Trellis cannot combine with layers** — Vega-Lite forbids facet inside a layered spec. pytrilogy
  parses it anyway (only its own renderer objects), so this fails client-side; `VegaLiteChart`
  catches the throw and renders the message rather than letting it escape into `nextTick`.
- **Validators must stay layer-aware.** `validateConfigFields`, `validateAndResetConfig` and
  `validateChartConfigForData` all reset a config they consider invalid, and callers _persist_ the
  replacement (`dashboardToolExecutor` writes `suggestedConfig` back). A container config has no root
  field bindings, so a non-layer-aware validator silently flattens the chart. Layers are validated on
  layerability and field existence — deliberately **not** on `determineEligibleChartTypes`, which is
  an auto-suggestion heuristic that rejects `layer bar` + `layer line` over a categorical x.
- **`showTitle` means "show a title"**, not "show the title someone handed me": an explicit
  `chartTitle` wins, otherwise `deriveChartTitle` synthesizes one with pytrilogy's precedence
  (`AltairRenderer._statement_title`). `determineDefaultConfig` leaves it **false** so titles stay
  opt-in.

Trilogy `chart ...` statements land through `chartStatementToConfig` (`lib/editors/chartStatement.ts`).
Each layer compiles to its own SELECT, so `QueryResult.layers` carries one `Results` per layer with
`layers[0] === results`, and `generateVegaSpec` takes an optional `layerData` giving each layer its
own `data.values` and column map. Field names on the wire are _safe addresses_
(`line_item_return_flag`) — the SQL alias and the `Results.headers` key. `QueryOutColumn.name` is the
dotted address and `enrichTrilogyColumns` stores it as `column.address` without renaming the key. Do
not "fix" that mismatch; the config matching header keys is what makes `validateConfigFields` pass.

Design record: `docs/chart-layering-audit.md`.

### Generated LLM guidance

`lib/llm/data/trilogySyntax.generated.ts` is generated from the **installed** pytrilogy by
`pnpm sync:trilogy-ai` and is regenerated as a side effect of `pnpm build`. It is upstream's content
verbatim (`trilogy/ai/prompts.py`), so do not hand-edit it — to document a language feature there,
add a `SyntaxExample` to pytrilogy's `trilogy/ai/syntax_examples.py`. `pnpm check:trilogy-ai` fails
CI on drift. Note it is embedded in three frozen agent prompts, so regenerating busts the Anthropic
prompt cache once; batch it with other prompt changes.

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

`./venv/Scripts/python.exe`
