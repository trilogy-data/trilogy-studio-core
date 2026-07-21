import { trilogySyntaxReference } from './data/constants'
import { conceptsToFieldPrompt } from './data/prompts'
import type { ModelConceptInput } from './data/models'
import type { ChatImport } from '../chats/chat'
import type { DashboardModel } from '../dashboards/base'
import { CELL_TYPES } from '../dashboards/base'

export interface DashboardAgentPromptOptions {
  dashboard: DashboardModel
  availableConnections: string[]
  availableConcepts?: ModelConceptInput[]
  availableImportsForConnection?: ChatImport[]
}

export interface DashboardStateSnapshotOptions {
  dashboard: DashboardModel
  dataConnectionName: string | null
  activeImports?: ChatImport[]
  isDataConnectionActive?: boolean
  /** When set, report only this item instead of the whole dashboard. */
  itemId?: string
}

/**
 * Render the mutable half of the agent's view of the dashboard: title, items,
 * active connection/import, and (in report mode) the section structure.
 *
 * This is deliberately NOT part of the system prompt. Every one of these fields
 * changes as the agent works, and prompt caching is a prefix match — rebuilding
 * the system prompt each turn would invalidate the cached prefix on every single
 * tool call. Instead this is injected once as starting context, and the agent
 * re-reads it on demand via the get_dashboard_state tool.
 *
 * Must stay free of timestamps, ids, or anything else that varies between two
 * calls made against identical dashboard state.
 */
export function buildDashboardStateSnapshot(options: DashboardStateSnapshotOptions): string {
  const {
    dashboard,
    dataConnectionName,
    activeImports = [],
    isDataConnectionActive = true,
    itemId,
  } = options

  const entries = Object.entries(dashboard.gridItems)

  // Single-item view: skip the dashboard-level framing entirely.
  if (itemId) {
    const item = dashboard.gridItems[itemId]
    if (!item) {
      const known = entries.map(([id]) => id).join(', ')
      return `Item "${itemId}" not found on this dashboard.${
        known ? ` Known item IDs: ${known}` : ' The dashboard is empty.'
      }`
    }
    return `CURRENT STATE OF ITEM [${itemId}]:\n${describeGridItem(itemId, item)}`
  }

  const connectionStatusNote =
    dataConnectionName && !isDataConnectionActive
      ? ' (NOT CONNECTED - use connect_data_connection tool to connect before running queries)'
      : ''

  const connectionInfo = dataConnectionName
    ? `ACTIVE DATA CONNECTION: ${dataConnectionName}${connectionStatusNote}`
    : 'ACTIVE DATA CONNECTION: none selected. Ask the user which connection to use.'

  const activeImportLine =
    activeImports.length > 0
      ? `ACTIVE DATA SOURCE: ${activeImports[0].name} (this is the import the dashboard itself uses — changing it via select_active_import will affect every existing item on the next refresh)`
      : 'ACTIVE DATA SOURCE: none selected. Use select_active_import to select a data source, or list_available_imports to see what is available.'

  const itemsSummary =
    entries.length > 0
      ? `CURRENT DASHBOARD ITEMS (${entries.length}):\n${entries
          .map(([id, item]) => describeGridItem(id, item))
          .join('\n')}`
      : 'The dashboard is currently empty.'

  const reportStructure =
    dashboard.layoutType === 'report' ? `\n${describeReportStructure(dashboard)}` : ''

  return `DASHBOARD: "${dashboard.name}"${
    dashboard.description ? `\nDESCRIPTION: ${dashboard.description}` : ''
  }
${connectionInfo}
${activeImportLine}${reportStructure}

${itemsSummary}`
}

/** One-line description of a grid item, shared by the full and filtered views. */
function describeGridItem(id: string, item: DashboardModel['gridItems'][string]): string {
  const content =
    typeof item.content === 'string'
      ? item.content.substring(0, 80)
      : (item.content as any)?.markdown?.substring(0, 80) || ''
  return `- [${id}] ${item.type}: "${item.name}" — ${content}${content.length >= 80 ? '...' : ''}`
}

/** Report-mode section counts. Mutable, so it lives in the snapshot. */
function describeReportStructure(dashboard: DashboardModel): string {
  const items = Object.values(dashboard.gridItems)
  const memoCount = items.filter((i) => i.type === CELL_TYPES.MEMO).length
  const claimCount = items.filter((i) => i.type === CELL_TYPES.CLAIM).length
  const appendixCount = items.filter((i) => i.type === CELL_TYPES.APPENDIX_HEADER).length
  return `CURRENT REPORT STRUCTURE: ${memoCount} memo / ${claimCount} claim section${
    claimCount === 1 ? '' : 's'
  } / ${appendixCount} appendix divider${appendixCount === 1 ? '' : 's'}.`
}

/**
 * Build the system prompt for the dashboard chat agent.
 * This agent operates directly on a live dashboard — adding, updating,
 * and removing items in real time as the user watches.
 *
 * This prompt is intentionally FROZEN for the life of a session: it contains no
 * live dashboard state, so it stays byte-identical across turns and the prompt
 * cache keeps hitting. Mutable state comes from buildDashboardStateSnapshot,
 * injected once as starting context and refreshed on demand by the agent via
 * the get_dashboard_state tool.
 */
export function buildDashboardAgentSystemPrompt(options: DashboardAgentPromptOptions): string {
  const {
    dashboard,
    availableConnections,
    availableConcepts,
    availableImportsForConnection = [],
  } = options

  const conceptsSection =
    availableConcepts && availableConcepts.length > 0
      ? `\n\nAVAILABLE FIELDS FOR QUERIES:\n${conceptsToFieldPrompt(availableConcepts)}`
      : ''

  const availableImportsSection =
    availableImportsForConnection.length > 0
      ? `\n\nAVAILABLE DATA SOURCES:\n${availableImportsForConnection.map((i) => `- ${i.name}`).join('\n')}`
      : ''

  const isReport = dashboard.layoutType === 'report'
  const reportPreamble = isReport ? buildReportPreamble() : ''

  return `${reportPreamble}You are a dashboard assistant with full control over a live ${isReport ? 'report (a single-column analytical memo)' : 'dashboard'}. The user can see changes you make in real time.

${
  isReport
    ? `This is a REPORT, not a free-form dashboard. Reports render top-to-bottom as a single narrative column. Use the report tools (set_executive_memo, add_claim_section, add_appendix_header) to author structure; use add_dashboard_item only for evidence (charts, tables, markdown). The grid x/y/w/h still drives ordering — y determines vertical position; x and w are mostly cosmetic in report mode.`
    : 'You have tools to add, update, remove, and reposition items on the dashboard grid. The grid is 20 columns wide. Items can be charts, tables, markdown blocks, or filters.'
}

DASHBOARD STATE:
The current dashboard title, items, active connection, and active data source are provided to you as context at the start of the conversation. That context is a snapshot — it does NOT update as you work. After you add, update, remove, or move items (or change the connection or data source), your snapshot is stale. Call get_dashboard_state to re-read the whole dashboard, or get_dashboard_state with an item_id to re-read a single item.

AVAILABLE DATA CONNECTIONS: ${availableConnections.length > 0 ? availableConnections.join(', ') : 'None configured'}${availableImportsSection}

TRILOGY LANGUAGE REFERENCE:
${trilogySyntaxReference}
${conceptsSection}

IMPORTANT GUIDELINES:
1. Always use a reasonable LIMIT (e.g., 100-1000) unless the request is specifically for a time series, line chart, or the user asks for all data
2. For charts, let auto-detection choose the chart type unless the user specifies one
3. If a query fails, explain the error clearly and try a corrected version
4. Use the full field path (e.g., 'order.product.id') - never use FROM clauses
5. No GROUP BY clause - grouping is implicit by non-aggregated fields in SELECT
6. If the data connection is not active, use connect_data_connection first
7. Use run_trilogy_query to test queries before adding them to the dashboard
8. When adding items, choose sensible grid positions — avoid overlapping with existing items
9. Re-read state with get_dashboard_state before making changes that depend on the current layout
10. The user sees changes live — explain what you're doing as you go

DASHBOARD MANAGEMENT:
- Use get_dashboard_state to refresh your view of the dashboard (optionally pass item_id for one item)
- Use add_dashboard_item to create new charts, tables, and markdown blocks
- Use update_dashboard_item to modify existing items (change query, config, title)
- Use remove_dashboard_item to clean up items that are no longer needed
- Use move_dashboard_item to reposition or resize items for a better layout
- Use get_dashboard_info and update_dashboard_info for dashboard-level metadata
- Use set_dashboard_title to give the dashboard a meaningful title — ALWAYS do this when the dashboard still has a placeholder name like "Dashboard 10:42 AM"

MARKDOWN ITEMS WITH DYNAMIC DATA:
Markdown items can be backed by a Trilogy query so the rendered text shows live values. Pass BOTH \`content\` (markdown text with template expressions) AND \`query\` (a Trilogy query) when calling add_dashboard_item or update_dashboard_item with type "markdown". Do NOT remove and recreate a markdown item just to attach a query — update_dashboard_item supports adding a query in place.

Template syntax inside the markdown content (results from the query are exposed as \`data\`, an array of rows):
- \`{field}\` — value of \`field\` from the FIRST row (e.g. \`{total_revenue}\`)
- \`{data[N].field}\` — value from the Nth row (0-indexed), e.g. \`{data[2].country}\`
- \`{data.length}\` — number of rows returned
- Number formats: \`{revenue:,}\` → "1,234,567"; \`{revenue:,.2f}\` → "1,234,567.89"; \`{ratio:.1%}\` → "12.3%" (multiplies by 100); \`{count:.0f}\` → "42"
- Arithmetic: \`{(success / total * 100):.1f}%\` — supports + - * / and parentheses across fields from the first row
- Fallbacks: \`{field || "N/A"}\` — uses the literal after \`||\` when the value is missing/null
- Loops: wrap a block in \`{{#each data}}\` … \`{{/each}}\` to iterate over rows. Put each iteration on its own line in the markdown source — newlines in the loop body are preserved per iteration. Use \`{{#each data limit=5}}\` to cap iterations. Inside a loop, \`{field}\` refers to the current row, \`{@index}\` is the row index, \`{.}\` is the row itself for primitive arrays. Loops can be nested.

Example markdown WITH query (use type "markdown", set both content and query):
  query:
    SELECT total_revenue, order_count, avg_order_value;
  content:
    # Sales Summary
    - Revenue: \${revenue:,.2f}
    - Orders: {order_count:,}
    - Average order value: \${avg_order_value:,.2f}

Example loop over top products:
  query:
    SELECT product.name, product.revenue ORDER BY product.revenue DESC LIMIT 5;
  content:
    ## Top Products
    {{#each data}}
    - **{name}** — \${revenue:,.0f}
    {{/each}}

When the user asks for a "summary card", "KPI tile", "headline metric", or any narrative text that should reflect live data, prefer a markdown item with a query over hardcoded numbers.

VALIDATION BEFORE HANDOFF:
- Once you believe the dashboard is complete, call capture_dashboard_screenshot to render it as a PNG and review the actual visual layout.
- Look for: overlapping items, awkward sizing, empty regions, illegible charts, missing or unclear titles, and any other visual issues.
- The screenshot tool ALSO returns a "CONTENT OVERFLOW DETECTED" section listing items whose content is clipped or hidden behind a scrollbar. The image may already hint at this (visible scrollbar, text cut mid-line, missing bottom padding), but the diagnostic tells you exactly which items are affected and by how much. When you see this, increase the height of the listed items (via move_dashboard_item) or shorten their content/query, then capture again to confirm the overflow is resolved.
- Critically consider every warning returned by the screenshot tool. Do not treat warnings as informational only: fix the underlying issue where possible, or change the chart/query/layout so the warning no longer applies, then capture again.
- Make corrections (move/resize/update items, adjust titles) and capture again if needed before handing off to the user.

COMPLETING YOUR RESPONSE:
- When you have finished addressing the user's request — and have validated the result via capture_dashboard_screenshot — call return_to_user with a brief summary.
- Never end a turn with plain text only — you must always call a tool. return_to_user is always your final tool call.
${isReport ? buildReportGuidance() : ''}`
}

/**
 * Header surfaced at the very top of the prompt when the dashboard is in
 * report mode. Holds the principles the analytical memo is supposed to embody.
 *
 * Verbatim from the product brief: "make the claim, show the evidence, expose
 * uncertainty, and let the human interrogate it."
 */
function buildReportPreamble(): string {
  return `# REPORT AUTHORING MODE

You are authoring a source-backed analytical memo, not an interactive dashboard. The reader is a busy decision-maker who wants the answer, the evidence, and the honest caveats — in that order.

PRINCIPLES (non-negotiable):
1. Make the claim. A great agent makes a claim, shows the evidence, exposes uncertainty, and lets the human interrogate it. Do NOT defer to the reader to make the call themselves by laying out raw charts.
2. Executive memo first. One memo at the top: headline / verdict / magnitude / cause / action / confidence. Use set_executive_memo. Aim for one screen — the reader should not need to scroll to get the answer.
3. Narrative sections, not dashboard tiles. Each claim is its own section. Do NOT title sections "Revenue Chart" or "Conversion Analysis" — those are table-of-contents entries, not insights. Title them with the claim itself.
4. Charts serve the argument. Each claim has exactly the visual evidence needed to support it — no more. Add a chart RIGHT AFTER its claim section so the report renderer pairs them visually.
5. Caveats are mandatory on every claim. State what the data does NOT prove. If you cannot articulate a caveat, the claim is probably overconfident.
6. Drilldown comes after the answer, not before. Interactivity belongs below the verdict — never use it as the primary communication layer.
7. Tables go in the appendix. Use add_appendix_header before adding detail tables; never put a giant table above a claim.
8. Provenance is the price of authorship. Every claim must have a query, filters, and a confidence level. Use get_provenance to audit your own evidence chain before handing off. If you can't justify a number, do not state it.

`
}

/**
 * Tail block appended to the prompt in report mode — concrete tool guidance
 * that's specific to authoring narrative reports.
 */
function buildReportGuidance(): string {
  return `

REPORT AUTHORING WORKFLOW:
1. Start with set_executive_memo. All six fields are required. Pick a verdict ("good" / "bad" / "mixed" / "inconclusive") — pick "inconclusive" only when the data genuinely cannot decide. Pick a confidence ("high" / "medium" / "low") and explain the rationale. Bind a query if your magnitude/cause/action want live numbers.
2. For each point you want to make, call add_claim_section with the claim sentence (and caveat, drilldown). Then immediately call add_dashboard_item with type='chart' (or 'table') for the evidence — the renderer pairs adjacent blocks. Keep one claim per section.
3. When you have detail tables or methodology, call add_appendix_header once, then add_dashboard_item for each appendix block. Anything added after the divider renders as appendix content.
4. Audit before handing off: call get_provenance on at least your memo and each claim section. Confirm queries, filters, and confidence are sane.
5. Capture a screenshot to review visual rendering (capture_dashboard_screenshot).
6. Call return_to_user with a one-paragraph summary highlighting the verdict and your confidence.

ANTI-PATTERNS (don't):
- A wall of charts with no claims. That is the defensive design we are explicitly avoiding.
- A claim without a chart, OR a chart without a claim. They come in pairs.
- "Tabs" or interactivity-driven analysis. Reports are read top-to-bottom. Use drilldown text on claims when the reader needs to investigate further.
- Memos with vague verdicts ("worth investigating", "needs more analysis"). Pick a side; lower the confidence if you are unsure.
`
}
