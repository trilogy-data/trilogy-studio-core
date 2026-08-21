# Multi-Layer Chart Rendering — Handoff

Follow-on to PR #250 (`chart-statement-rendering`), which made Trilogy `chart ...` statements
execute and render in the studio. That PR deliberately renders **only the first layer** and
reports the rest as a warning. This document is the brief for making the studio genuinely
render layered charts.

Read PR #250's diff first — `lib/editors/chartStatement.ts`, `pyserver/query_helpers.py`
(`chart_to_output`) and `lib/dashboards/spec.ts` are the three files this work extends.

## The language being served

```trilogy
chart
  set hide_legend
  set scale_y: log
  layer bar  (x_axis <- category, y_axis <- sum(value)     as total)
  layer line (x_axis <- category, y_axis <- avg(value)     as average)
  place hline at 5 as target;
```

Grammar (pytrilogy 0.3.335, `trilogy/parsing/trilogy.lark`):

```lark
chart_layer:     "layer"i CHART_TYPE "(" chart_layer_body ")" ("from"i select_statement)? order_by? limit?
chart_place:     "place"i CHART_PLACE_TYPE "at"i literal ("as"i IDENTIFIER)?
chart_statement: "chart"i chart_component+
```

Each layer compiles to **its own independent SELECT** — different grains, different column sets,
no requirement that they share an x field. `place hline|vline` is a constant reference line with
no query behind it at all.

## Why this is tractable

The studio's spec builders **already emit Vega-Lite `layer` arrays**:

| File                             | Existing layering                                                |
| -------------------------------- | ---------------------------------------------------------------- |
| `lib/dashboards/barChartSpec.ts` | `{layer: [barLayer, secondaryLineLayer]}` when `yField2` is set  |
| `lib/dashboards/lineAreaSpec.ts` | base marks + brush-filtered marks, nested `{layer: [...]}` pairs |
| `lib/dashboards/pointSpec.ts`    | `{layer: base}`                                                  |

What is single is the **data**, in exactly one line: `createBaseSpec(data)` in
`lib/dashboards/spec.ts` puts one `data: {values: …}` at the top of the spec and every layer
inherits it. Vega-Lite permits per-layer `data`, so co-rendering N independent result sets is a
data-model change, not a rendering limitation.

## Definition of done

1. `chart layer bar (…) layer line (…);` renders both layers over their own result sets.
2. `place hline at 5 as target` draws a labelled rule.
3. `chart layer bar (x_axis <- a, y_axis <- b) layer line (x_axis <- a, y_axis <- c);` subsumes the
   `yField2` dual-axis case — it should be the same code path, not a parallel one.
4. The warnings in `chartStatementToConfig` for extra layers and placements are **deleted**, not
   reworded — they exist only because of this gap.
5. A layered chart survives a page reload in the editor (persisted config) and does not corrupt
   single-dataset charts anywhere else.

## The chain that assumes one dataset

Work outward from the data, not from the spec. Each row is a place that assumes "one result set,
one column map, one config".

| File                                     | What assumes single                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pyserver/io_models.py`                  | `ChartLayerOut` carries per-layer SQL + roles but **no per-layer `columns`**; `QueryOut.columns` is layer 1's only                   |
| `pyserver/query_helpers.py`              | `generate_single_query` returns layer 1's columns; `chart_to_output` promotes layer 1's SQL to `generated_sql`                       |
| `lib/stores/queryExecutionService.ts`    | Executes `queryResult.generated_sql` once; `QueryResult.results` is one `Results`                                                    |
| `lib/editors/chartStatement.ts`          | Maps `layers[0]` to one flat `ChartConfig`; warns about the rest                                                                     |
| `lib/editors/results.ts`                 | `ChartConfig` is flat (`xField`, `yField`, `yField2`, …)                                                                             |
| `lib/dashboards/spec.ts`                 | `createBaseSpec` sets top-level `data`; `generateVegaSpec(data, config, columns, …)` takes one of each                               |
| `lib/components/VegaLiteChart.vue`       | Props `data: Row[]` + `columns: Map<string, ResultColumn>`                                                                           |
| `lib/components/chartControlsManager.ts` | `internalConfig` is one `ChartConfig`; `validateAndResetConfig` resets to defaults when fields don't resolve                         |
| `lib/components/ChartControlPanel.vue`   | Renders `Controls` from `lib/dashboards/constants.ts`, each `field: keyof ChartConfig`                                               |
| `lib/components/chartHelpers.ts`         | `validateConfigFields(config, columns)`, `handleBrush(name, item, config, columns)`, `setupEventListeners(view, config, columns, …)` |
| `lib/components/chartRenderManager.ts`   | `renderChart(c1, c2, spec, config, columns, theme, isMobile, brushHandler, title, force)`                                            |

### The one gap that isn't obvious

The wire format from PR #250 gives you per-layer **SQL and roles**, but **not per-layer columns**.
The chart pipeline needs a `Map<string, ResultColumn>` per layer — `getVegaFieldType`,
`getFormatHint`, tooltip titles and `::hex` colour scales all resolve fields through it. So
`ChartLayerOut` needs a `columns: list[QueryOutColumn]` field, built the same way
`generate_single_query` builds them today (from `layer.select.output_components` against `env`).
Keep `QueryOut.columns` as layer 1's for back-compat with chart-unaware clients.

Field names on the wire are **safe addresses** (`line_item_return_flag`), which is also the SQL
alias and therefore the `Results.headers` key. `QueryOutColumn.name` is the dotted address
(`line_item.return_flag`) and `enrichTrilogyColumns` stores it as `column.address` without
renaming the key. Do not "fix" this mismatch — the chart config matching header keys is what makes
`validateConfigFields` pass.

## Reference implementation

pytrilogy renders the same statements with Altair, and its renderer is the closest thing to a
spec for the semantics:

`.venv/Lib/site-packages/trilogy/rendering/altair_renderer.py`

- `render(statement, layer_data)` — takes **a list of per-layer row sets**, exactly the shape this
  work needs, and `alt.layer(*layer_charts)`s the results.
- `_render_layer(layer, data, scales)` — role → encoding channel mapping. Note `x_axis`/`y_axis` are
  _literal_ axes: for `barh`, `y_axis` is the category, which matches the studio's own `barh`
  convention (`yField` categorical, `xField` numeric).
- `_render_placement(placement)` — `mark_rule()` with `alt.datum(value)` on `y` for hline / `x` for
  vline, plus a `mark_text` label pinned to the rule. Port this shape directly.
- `_encode` — `set scale_x|scale_y` applies to continuous value axes only; a banded category axis
  ignores it.

It also enforces a restriction you must reproduce:

> Trellis roles cannot be combined with multiple layers, place rules, or annotations.

That isn't arbitrary — Vega-Lite forbids facet channels inside a layered spec. Detect it and
surface it as an error, don't silently drop a layer.

## Vega-Lite constraints worth knowing before you design

- Each entry in `layer: []` may carry its own `data: {values: […]}`.
- `width`/`height: 'container'` must stay on the **top-level** spec, never per layer.
- Layers cannot contain `facet`; facet must wrap the whole spec (which is why the trellis
  restriction exists).
- `resolve: {scale: {y: 'independent'}}` is how the existing `yField2` path gets a dual axis —
  the same knob decides shared vs independent axes for real layers. `spec.ts` already sets it.
- Legends across layers with independent data need explicit `color` scales or you get one legend
  per layer.

## Suggested shape

Not prescriptive, but this keeps the blast radius small:

1. **Server** — add `columns` to `ChartLayerOut`. Extend `pyserver/tests/test_query_core.py`'s
   `test_multi_layer_chart_reports_every_layer` to assert per-layer columns.
2. **A layered config type** — `ChartConfig` grows an optional `layers?: LayerConfig[]` (or a
   sibling `LayeredChartConfig`), where `LayerConfig` is the existing flat shape minus the
   statement-level settings (`hideLegend`, `showTitle`, `scaleX`, `scaleY`, placements). Keep the
   flat single-layer shape working untouched — dashboards persist it and `migrateChartConfig`
   exists for exactly this kind of evolution.
3. **Execution** — `QueryResult` grows `layers: {results: Results, columns: …}[]`.
   `executeQueryInternal` runs each `chart.layers[i].generated_sql` (with that layer's
   `parameters`) instead of only the promoted one. Keep `results` pointing at layer 1 so the
   results grid and every existing consumer keep working.
4. **Spec** — `generateVegaSpec` gains a layered path: call the existing per-type builder once per
   layer with that layer's `config`/`columns`, attach `data: {values}` to each returned layer
   object, and stitch into `{layer: [...]}`. Placements become additional rule layers. The
   per-type builders should not need to change.
5. **Delete the warnings** in `chartStatementToConfig` and the notice rendering in
   `lib/components/editor/Results.vue` once both cases render.

## Decisions you have to make (flag them, don't guess)

- **Brushing / cross-filter.** `handleBrush` and `extractEligibleCrossFilterFields`
  (`lib/dashboards/crossFilters.ts`) assume one dataset. What does selecting a region mean when
  layers have different grains? Simplest defensible answer: brushing applies to layer 1 only, and
  eligible cross-filter fields come from layer 1's columns. Say so in the PR rather than leaving it
  implicit.
- **Controls UI.** `ChartControlPanel.vue` edits one config. Options: hide the controls for
  statement-authored layered charts (they're authored in code, not the panel), or add a layer
  selector. Hiding is a legitimate first cut — the statement is the source of truth.
- **Dashboards.** `dashboardQueryExecutor`'s `onSuccess` takes only `result.results`, and
  `updateItemChartConfig` persists a single config. PR #250 deliberately left dashboards ignoring
  `result.chartConfig` because adopting it would rewrite persisted item config on every refresh.
  Layering does not have to solve that — but don't regress it.
- **`yField2`.** Folding it into layers is the clean end state; keeping both is duplicate surface
  area. If you fold it, `migrateChartConfig` in `lib/editors/results.ts` is where the conversion
  belongs, and `barChartSpec`/`lineAreaSpec`'s secondary-layer branches come out.

## Tests to write

- `lib/editors/chartStatement.test.ts` — a two-layer spec produces two layer configs and **no**
  warnings; a spec with placements produces placement config and no warning.
- `lib/dashboards/*.test.ts` — a layered spec emits `layer: [...]` with per-layer `data.values`,
  and a single-layer chart still emits a flat spec (regression guard for every existing chart).
- `lib/stores/queryExecutionService.test.ts` — two layers means two `executeSql` calls with the
  right SQL and each layer's parameters.
- `pyserver/tests/test_query_core.py` — per-layer columns.
- `e2e/test-trilogy-editor.spec.ts` — the basic Trilogy editor test already runs a single-layer
  chart statement; extend it (or add a sibling) with a two-layer statement asserting a rendered
  canvas. Note the mobile projects stack editor/results into tabs and flip to results when a query
  starts — `selectAllEditorContent` in that spec clicks `editor-tab` first for this reason.

## Environment notes (learned the hard way in PR #250)

- **Use the repo-root `.venv`** — it has pytrilogy 0.3.335. `pyserver/.venv` is stale at 0.3.211,
  which predates `chart layer …` entirely and fails to parse it.
- **The resolver is a separate long-running process.** `.env.development` sets
  `VITE_RESOLVER_URL=http://127.0.0.1:5678`, so the dev studio talks to your local
  `python pyserver/main.py`. Editing `query_helpers.py` requires restarting it — vite HMR won't.
  Then hard-reload the page: `TrilogyResolver` memoizes `/generate_query` responses in an in-page
  LRU keyed on query text, so a re-run of identical text replays the stale response.
  A studio pointed at the default hosted resolver (`trilogy-service.fly.dev`) will not have your
  server changes at all.
- **`src/` imports lib by relative path** (`../lib/…`), so no `pnpm build:lib` for dev. But lib
  reads the grammar package's **dist**, so editing `prism-trilogy/src/vocabulary.ts` needs
  `pnpm build:grammar` before lib tests see it.
- **`pnpm build` typechecks more than the root does.** `vue-tsc -b` covers lib's tests;
  `npx vue-tsc --noEmit` does not. Run the former before pushing.
- **`pnpm build` also regenerates** `lib/llm/data/trilogySyntax.generated.ts` from the installed
  pytrilogy. Revert it unless you mean to update it.
- **e2e:** needs pyserver on 5678 and vite on 5173. Warm vite with a request first — a cold first
  load takes ~25s and Playwright's `goto` gives up at 60s. Run one project at a time locally;
  seven parallel workers each booting duckdb-wasm produces failures CI (workers: 1) won't show.
  Webkit-on-Windows also fails the demo-model tests on CORS — that's environmental, not you.
- **`npx vitest run --exclude "**/providers.integration.test.ts"`** — that suite hits live LLM APIs.
- **pyserver checks:** `mypy . --explicit-package-bases`, `ruff check . --fix`, `black .` from
  inside `pyserver/`, per AGENTS.md.

## Out of scope

Dashboard items adopting statement-authored charts; a `geo`/`map` layer type (pytrilogy's own
renderer raises `NotImplementedError` on the `geo` role — PR #250 infers `geo-map` from the role's
presence); `copy into png '…' from chart …`, which shares the gap all `copy` statements have.

## Upstream asks that would simplify this

Filed in PR #250's description; repeated here because they change the design if they land.

- **Multiple `y_axis` bindings per layer.** `chart_layer_body` rejects a repeated role, so a
  two-series chart must be two layers — two independent SELECTs — even when one query would do.
  `ProcessedChartLayer.y_fields` is _already a list_; only the parser forbids filling it. If this
  lands, the common dual-series case collapses to one dataset and needs none of the multi-dataset
  plumbing above.
- A `map`/`geo` layer type, so `geo` stops being a role that implies a chart type.
