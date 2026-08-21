# Audit: Multi-Layer Chart Rendering

Review of `docs/chart-layering-handoff.md` against the code as of `f48816f`, plus the scoping the
handoff doc is missing. Read the handoff first — this supplements it, it does not replace it.

**Headline:** the handoff is accurate about the data plumbing and inaccurate about the rendering.
Its central claim — "the per-type builders should not need to change" — is wrong, for four
independent reasons (params, legends, non-layerable chart types, the point-chart compile step).
It also scopes the work in the wrong order: it goes straight at multi-*dataset* layering (the
chart-statement case) when the change the frontend actually wants — recursive `ChartConfig` with
layers over **one** dataset — is separable, independently shippable, and needs no server work.

---

## 1. Claims verified

These hold up; build on them without re-checking.

| Claim | Verdict |
| ----- | ------- |
| Spec builders already emit `layer: []` (`barChartSpec`, `lineAreaSpec`, `pointSpec`, `donutSpec`, `headlineSpec`, `treeSpec`, `mapSpec`) | ✅ |
| `createBaseSpec` puts one `data: {values}` at the top and every layer inherits it (`spec.ts:53`) | ✅ |
| Vega-Lite allows per-layer `data`; `width/height: 'container'` must stay top-level; layers can't contain `facet` | ✅ |
| `ChartLayerOut` has per-layer SQL + roles but no per-layer `columns` (`io_models.py:186`) | ✅ |
| `chart_to_output` promotes layer 1's SQL and params to the top level (`query_helpers.py:676`) | ✅ |
| `resolve: {scale: {y: 'independent'}}` is the existing dual-axis knob (`spec.ts:296`) | ✅ |
| pytrilogy forbids repeated roles per layer, so `y_fields` is capped at 1 (`parsing/v2/rules/chart_rules.py:75`) | ✅ |
| `CHART_ROLES` has no `y_axis2` — `yField2` is unreachable from the language | ✅ |
| The trellis restriction is real and enforced upstream (`altair_renderer.py:66`) | ✅ |
| pytrilogy 0.3.335 is in the repo-root `.venv`; `altair_renderer.py` is the semantics reference | ✅ |

## 2. Claims that are wrong or misleading

**`extractEligibleCrossFilterFields` does not assume one dataset.** `crossFilters.ts:57` takes
`completionItems: Iterable<{label: string}>` — Monaco completions, not columns. It is not on the
change list at all. The real single-dataset assumption in that file is downstream, in the
selection→SQL-filter mapping keyed by item id.

**Per-layer columns cannot be built in `chart_to_output`.** The doc says to build them "the same way
`generate_single_query` builds them today (from `layer.select.output_components` against `env`)" but
puts the field on `ChartLayerOut`, which is populated by `_chart_layer_to_output(layer, dialect)` —
no `env`. Neither `query_to_output` nor either of its two callsites in `studio_endpoints.py`
(lines 284, 340) has `env` either. The columns have to be built inside `generate_single_query`
(which has `env` and `layer_selects`, `query_helpers.py:360`) and threaded out through the return
tuple. That widens `generate_single_query`, `generate_query_core` and `generate_multi_query_core`
— three signatures and two callsites, not one field.

**"The per-type builders should not need to change" is the doc's load-bearing error.** See §3.

## 3. What the handoff misses

### 3.1 Vega-Lite param names are global — layering the same chart type twice will not compile

Every builder hard-codes its param names: `highlight`, `select`, `brush`. Two bar layers emit two
params named `highlight` and Vega refuses to compile ("Duplicate signal name"). The codebase
already knows this — `lineAreaSpec.ts:157` names its secondary-axis param `highlight2` precisely to
dodge the collision.

Worse, the names are referenced as string literals from three places that don't know about layers:

- `helpers.ts:958` `createInteractionEncodings()` returns `condition: {param: 'select'}` / `'highlight'`
- `chartHelpers.ts:443` `view.addSignalListener('brush', …)`
- `lineAreaSpec.ts:41` `transform: [{filter: {param: 'brush'}}]`

**Required:** thread a layer suffix through `createInteractionEncodings(suffix)` and every builder's
`params`. Recommended rule, which keeps every existing handler working untouched: **layer 0 owns the
interaction params unsuffixed and is the only interactive layer; layers 1..n get suffixed names and
no `select`/`brush` params.** That also settles the brushing decision the doc flags as open.

### 3.2 Four chart types don't drop into a Vega-Lite `layer` array as they stand

Ranked by how hard the barrier actually is — an earlier draft of this audit said "cannot at all",
which overstates it for three of the four:

- **`beeswarm`** (`beeSwarmSpec.ts:110`) is the only genuine format barrier: it returns a raw
  **Vega** spec — `$schema: .../vega/v6.json`, `data: [ … ]` as an array, `signals`, `scales`,
  `marks`. Layering it means composing at the Vega level (compile each Vega-Lite layer, merge
  `marks`/`scales`/`data`), which the codebase already does half of — `spec.ts:410` compiles point
  charts to Vega today.
- **`headline`** (`headlineSpec.ts:324`) is ordinary Vega-Lite; it just owns its top-level chrome
  (`$schema`, `width/height: 'container'`, `config`). Its inner marks are plain unit specs and
  already namespace their params as `highlight_${index}` / `select_${index}`. Splicing its `layer`
  array in and dropping the chrome would work.
- **`tree`/`treemap`** (`treeSpec.ts:22`) — same story, plus it owns its `data` and a stratify
  pipeline.
- **`geo-map`** (`mapSpec.ts:496`) carries a `projection`, topojson base layers and nested per-mark
  `data`. Vega-Lite does allow `projection` on a layer, so this compiles; composing a map with a
  cartesian chart is just rarely meaningful.

**Decision (v1):** carve them out with a `LAYERABLE_CHART_TYPES` allowlist — `bar`, `barh`, `line`,
`area`, `point`, `boxplot`, `donut`, `heatmap` — and raise an explicit error when a multi-layer
config names a type outside it, mirroring how pytrilogy surfaces the trellis restriction rather than
dropping a layer silently. This is a scope boundary, not a permanent limitation; headline, treemap
and geo become unwrapping work, and beeswarm becomes Vega-level composition, whenever they're
wanted. The language's `CHART_TYPE` terminal already excludes `geo-map`, `tree` and `beeswarm`, so
in v1 the allowlist only bites configs built in the UI or by the LLM.

### 3.3 Point charts compile to Vega at the end of `generateVegaSpec`

`spec.ts:410` runs `compile(spec).spec` and `addLabelTransformToTextMarks` for `chartType === 'point'`.
In a layered spec that decision is no longer a property of "the" chart type — it's a property of
*any* layer being a point layer, and the compile has to happen once at the top level after
stitching, not per layer. Straightforward, but it means `generateVegaSpec`'s tail cannot stay a
switch on `config.chartType`.

### 3.4 A layered chart needs a series legend, and today's color encoding fights it

Every builder calls `createColorEncoding(config, config.colorField, …)`. N layers with a colorField
produce N legends; N layers *without* one produce a chart where nothing tells the reader which mark
is "total" and which is "average" — which is the whole point of `layer bar (…) layer line (…)`.

The Vega-Lite idiom is a constant-datum color per layer plus a shared scale:
`color: {datum: '<layer label>', type: 'nominal'}` on each layer with
`resolve: {scale: {color: 'shared'}}`. The label is already on the wire — `ChartLayerOut.field_labels`
holds the `as` alias, and `altair_renderer.py:92` `_field_title` is the exact precedence to port
(alias, else the field address, humanized).

Related and unmentioned: with a shared y scale across layers, the **axis title** comes from whichever
layer Vega-Lite resolves first. Two layers over different measures need either an explicit shared
title or independent scales.

### 3.5 Nothing decides shared vs independent axes for real layers

The doc says `resolve` "is the same knob" as the `yField2` path — true, but the language has no
setting for it and the doc proposes no rule. This is a decision that has to be made, not deferred:
`chart layer bar (y_axis <- total) layer line (y_axis <- average)` almost certainly wants a shared
y, while `… layer line (y_axis <- margin_pct)` wants an independent one. Suggested rule: shared by
default; independent when the layers' y fields disagree on format hint (`getFormatHint`,
`helpers.ts:818`) — i.e. currency vs percent vs plain. Whatever you pick, it needs a
`linkY2`-equivalent escape hatch on the root config.

### 3.6 A recursive config walks straight into the validators that reset configs

Three places will silently destroy a layered config today:

- `chartHelpers.ts:398` `validateConfigFields` — checks root fields only; a container config with
  no root `xField`/`yField` and no `hideLegend`/`showTitle` hits the `!anySet && !anyConfigSet`
  branch and returns `false`.
- `chartControlsManager.ts:157` `validateAndResetConfig` — on `false`, calls
  `initializeConfig(…, null, …, force=true)`, which replaces the config with `determineDefaultConfig`
  output. The layers are gone, and `onChartConfigChange` **persists the flattened result**.
- `helpers.ts:654` `validateChartConfigForData` → `suggestedConfig` — the same flattening, reached
  from `chatToolExecutor.ts:152`, `dashboardToolExecutor.ts:344` and
  `editorRefinementToolExecutor.ts:455`. `dashboardToolExecutor` writes the suggestion back via
  `updateItemChartConfig`, so an LLM-authored layered chart on a dashboard would be silently
  rewritten to a single-layer one on the next validation pass.

**These have to be made layer-aware before a recursive config can reach the editor or a dashboard**,
not after. This is the single biggest correctness risk in the whole change and the handoff does not
mention it.

Also: `chartControlsManager.ts:63` `applyMissingDefaultsForCurrentChartType` backfills root
`xField`/`yField` from defaults; on a container config that writes junk into persisted state even if
rendering ignores it.

### 3.7 `migrateChartConfig` doesn't recurse — and is the wrong home for the `yField2` fold

`results.ts:110` maps deprecated chart-type names at the root only. Once configs nest, it has to
walk `layers`. That part is straightforward.

The handoff also nominates it as the home for the `yField2` → two-layer conversion. It isn't:
`migrateChartConfig` has exactly **two callsites, both in `base.ts:1078-1079`**, on dashboard item
data. Editor configs, LLM-authored configs and statement-authored configs never pass through it, so
folding `yField2` there would convert one path out of four.

**Do the fold at render time instead.** A `normalizeChartConfig(config)` in `spec.ts` that expands
`yField2` into a real second layer runs on the single production rendering callsite, so every path
gets identical treatment with no persistence migration and no risk of rewriting stored configs.
`yField2` then stays the *authoring* shape (the controls panel and the LLM schema keep it, unchanged)
while layering becomes the *rendering* model — which is exactly the split that lets
`barChartSpec`'s and `lineAreaSpec`'s secondary-layer branches be deleted without touching a single
stored config.

### 3.8 The LLM tool schema is a byte-stability contract

`sharedToolSchemas.ts:39` `chartConfigSchema` is embedded in tool definitions that feed the global
toolset, which is a **memoized byte-stable union** — the golden test in `toolRegistry.test.ts` is
the release gate, and tools render before the system prompt, so any edit busts the Anthropic prompt
cache once. Adding `layers` is fine, but it is a deliberate one-time cache bust plus a golden-test
update, and it must be a single explicit level of nesting (`layers: {type: 'array', items: <flat
layer schema>}`) — not a `$ref` self-reference, which tool schemas handle unreliably. The
`CHART_CONFIG_EXAMPLE` and `chartConfigGuidance` prose need a layered example or the model will
never emit one.

### 3.9 Not on the doc's file list but affected

- `lib/dashboards/base.ts` (1100 lines) — chart-config-shaped helpers used by the dashboard builder.
- `lib/dashboards/itemData.ts`, `lib/stores/dashboardStore.ts` — persistence of item chart config.
- `lib/components/dashboard/DashboardChart.vue:157-210` — spreads config in and out of the store;
  shallow spread preserves a `layers` reference, so this is safe *if* the controls manager doesn't
  drop it (see §3.6).
- `lib/llm/editorRefinementTools.ts:313`, `lib/llm/chatToolExecutor.ts:28` — `chartConfig` on tool
  inputs and artifacts.
- `lib/editors/editor.ts:268-291` — `setChartConfig` / `setStatementChartConfig` / serialization.

One genuine piece of good news the doc undersells: **`generateVegaSpec` has exactly one production
callsite** (`VegaLiteChart.vue:246`). The rendering blast radius is small; it's the config-validation
and persistence surface that's wide.

---

## 4. Recommended shape

The handoff's suggested shape is sound but sequenced wrong. Split the work in two, because the
frontend model change you actually want does not depend on the server at all.

### Phase A — recursive `ChartConfig`, one dataset (no server work)

```ts
export interface ChartConfig {
  chartType: chartTypes
  xField?: string
  // … existing flat fields, all per-layer semantics …

  /** Non-empty ⇒ this config is a container: its own field bindings are
   *  ignored and only its statement-level settings apply. Absent ⇒ today's
   *  flat single-layer config, byte-identical. */
  layers?: ChartConfig[]

  // root-only settings
  placements?: ChartPlacement[]
  hideLegend?: boolean
  showTitle?: boolean
  scaleX?: 'linear' | 'log' | 'sqrt'
  scaleY?: 'linear' | 'log' | 'sqrt'
  linkY2?: boolean
}
```

The "container ⇒ root bindings ignored" rule is what keeps every existing config working with zero
migration: no `layers` key means nothing changes anywhere.

Deliverables:

1. `normalizeChartConfig` in `spec.ts` — one function that turns any config into
   `{root, layers[]}`, expanding `yField2` into a second layer (§3.7). Single-layer output must stay
   byte-identical to today's flat spec; the stitching only engages at `layers.length > 1`.
2. `generateVegaSpec` grows a layered branch: for each layer call the existing per-type builder,
   apply the param suffix, stitch into `{layer: […]}`, keep `width/height/facet/title/config` at the
   root, decide `resolve`, and run the point-compile once at the end.
3. Param namespacing in `createInteractionEncodings` and every builder (§3.1).
4. `LAYERABLE_CHART_TYPES` allowlist + explicit error (§3.2).
5. Series-legend encoding (§3.4).
6. Layer-aware `validateConfigFields`, `validateAndResetConfig`, `validateChartConfigForData` (§3.6).
7. Recursive `migrateChartConfig` for nested chart-type renames (§3.7).
8. Delete `barChartSpec`'s `secondaryLineLayer` and `lineAreaSpec`'s `secondaryLayer` branches once
   the normalizer covers `yField2`. This is a net **deletion** of duplicated surface area — the
   strongest argument for doing Phase A first.

Phase A alone subsumes definition-of-done item 3, and does it for every chart type at once instead
of only bar.

### Phase B — N datasets (the chart-statement case)

Everything the handoff describes, on top of A:

8. Per-layer `columns` on the wire — built in `generate_single_query`, threaded through
   `generate_query_core` / `generate_multi_query_core` (§2).
9. `QueryResult.layers: {results: Results, columns: Map<…>}[]`; `executeQueryInternal` runs each
   layer's SQL with that layer's params; `results` keeps pointing at layer 1.
10. `generateVegaSpec` takes per-layer `{data, columns}` and attaches `data: {values}` per layer.
    Recommend converting the signature to an options object at this point — it already has nine
    positional params, and there is one production callsite.
11. `place hline|vline` → rule + text marks, ported from `altair_renderer.py:157` `_render_placement`.
12. Trellis-vs-layers restriction, surfaced as an error (`altair_renderer.py:66`).
13. Delete the warnings in `chartStatementToConfig` and the `chart-statement-warnings` block in
    `Results.vue:64`.

### Decisions this audit takes a position on

- **Brushing / cross-filter:** layer 0 only, falling out of the param-suffix rule in §3.1. Say it in
  the PR.
- **Controls UI:** hide the control panel for any config with `layers` in the first cut. A layer
  selector is a real feature, not a side effect of this work, and `updateConfig`'s
  `(field: keyof ChartConfig, value: string|boolean|number)` signature cannot express it anyway.
- **`yField2`:** fold it at render time, not in persistence (§3.7). It is unreachable from the
  language (`CHART_ROLES` has no `y_axis2`) and it duplicates layering in two builders, but it stays
  a valid authoring shape in the controls and the LLM schema.
- **Dashboards:** don't adopt statement charts (unchanged from PR #250), but §3.6 is a *regression*
  risk, not an adoption question — the validators must stop flattening before Phase A ships.

## 5. Test additions beyond the handoff's list

The handoff's list is good; add:

- `lib/dashboards/spec.test.ts` — two layers of the **same** chart type compile without duplicate
  param names (guard for §3.1). Assert against `vega-lite`'s `compile()`, not just spec shape.
- `lib/dashboards/spec.test.ts` — a non-layerable type in a multi-layer config throws.
- `lib/components/chartControlsManager.test.ts` + `lib/dashboards/helpers.test.ts` — a layered
  config survives `validateAndResetConfig` and `validateChartConfigForData` (guard for §3.6).
- `lib/editors/results.test.ts` — `migrateChartConfig` converts `yField2` to a second layer and
  recurses into `layers`.
- `lib/llm/registry/toolRegistry.test.ts` — the golden byte-stability test needs its expected value
  regenerated in the same commit that touches `chartConfigSchema`.

## 6. Out of scope (additions)

The handoff's list, plus: a layer selector in `ChartControlPanel`, and layered chart **image export**
(`chartHelpers.ts:64` download path goes through the active Vega view, so it should follow for free,
but it is untested against multi-dataset specs).
