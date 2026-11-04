# Default chart audit

## Cheapest-supplier listing

The requested result is a detail listing with two measures (supplier account balance and minimum part cost), numeric keys, supplier descriptions, and manufacturer. Use a scatter: account balance on X, minimum cost on Y, manufacturer as discrete color. Each result row remains a point, instead of overlapping/stacking detail records on a few categorical bars. Numeric keys are dimensions, never measures. This is exploratory comparison, not a claim that balance causes cost; the table remains the best way to inspect supplier contact details.

Latest main already selected this scatter and included the exact query shape in `chartAudit.test.ts`. This audit extends that coverage to the real Vega runtime, and fixes gaps that config-only tests missed. The fixture is synthetic data with the query's metadata and grain; it does not execute the user's database query.

## Findings fixed

- Count observed category tuples instead of multiplying independent cardinalities. Ten suppliers and their ten addresses represent ten groups, not a hundred. Repeated tuples now favor scatter when two measures are available.
- Start automatic resets, new authored configs, and chart-type switches from fresh field bindings. Old facets, secondary measures, and layer containers must not survive into a different visualization. An explicitly supplied layered config is still preserved.
- Secondary measures on line/area normalize into layers. Do not also assign automatic facets: the renderer rejects this combination.
- Share the supported-default type list between the picker, controls manager, and validator. Boxplot now gets its group and measure; beeswarm gets a category and optional discrete color, rather than inheriting fields from an unrelated automatic chart.

## Chart-by-chart review

| Type | Default selection and field policy | Verification / limits |
| --- | --- | --- |
| Bar | Small categorical axes and a measure; prefer scatter when category tuples repeat and two measures exist | Config corpus and Vega SVG execution |
| Horizontal bar | More than seven categories; narrowest category fallback | Config corpus and Vega SVG execution; very wide axes remain a readability limitation |
| Scatter | Two measures, including detail listings; bounded color/facets | SVG execution verifies at least one symbol per supplier result row; excludes numeric keys from measures |
| Line | Temporal axis, primary and optional secondary measure | SVG execution; secondary measure suppresses auto facets |
| Area | Explicit time-series choice | Same layering/facet constraint and runtime coverage as line |
| Heatmap | Explicit choice with two categories and numeric color | Config corpus and SVG execution; repeated cells can conceal detail |
| Boxplot | Explicit numeric distribution, optional category group | Added defaults; config corpus and SVG execution |
| Beeswarm | Explicit categorical distribution | Added defaults; config corpus and raw Vega SVG execution |
| Donut | Explicit category/value choice; bounded preferred category | Config corpus and SVG execution; no automatic recommendation, no positivity/sign inference |
| Headline | Numeric-only small results or fallback when other charts lack compatible fields | SVG execution; renderer caps the grid at 20 rows, so large one-measure/untyped results still merit manual distribution or table inspection |
| Map | Coordinate pair or geographic trait takes priority | Both coordinate and state defaults compile and parse; external basemap loading is not exercised by the new offline test |
| Tree | Not automatically selected or offered by eligibility | Existing builder/default path has no usable automatic field assignment; renderer work is deferred, not presented as a working recommendation |

## Coverage and boundaries

The 5,040-shape corpus covers row count, categorical cardinality, numeric key purpose, measure count, time, and geography. Forced-type coverage now includes boxplot and beeswarm. The runtime suite executes ten chart types through `generateVegaSpec`, Vega-Lite compilation where needed, `vega.parse`, and SVG generation. It detects invalid signal/layer composition that field-role assertions cannot find. Existing layered-chart tests remain in place.

Cardinality analysis scans at most 5,000 leading rows. The tuple check compares the same sample on both sides, so an unsampled tail alone does not force scatter. Sorted/truncated samples can still misrepresent a full dataset. Metadata and select order remain the measure-selection contract; we do not infer identifiers from column-name substrings or guess semantic relationships between measures. Previously persisted authored configurations are respected; these changes apply when defaults are initialized or reset.
