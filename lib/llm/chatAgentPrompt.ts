import {
  trilogySyntaxReference,
  rulesInput,
  functions,
  aggFunctions,
  datatypes,
} from './data/constants'
import { conceptsToFieldPrompt } from './data/prompts'
import type { ModelConceptInput } from './data/models'
import type { ChatImport } from '../chats/chat'
import {
  chartConfigSchema,
  chartConfigGuidance,
  connectDataConnectionTool,
} from './sharedToolSchemas'

// Context object passed to custom prompt builders
export interface TrilogyPromptContext {
  /** Complete syntax reference generated from pytrilogy's AI prompt. */
  trilogySyntaxReference: string
  /** Trilogy SELECT rules and syntax reference */
  rulesInput: string
  /** Available aggregate functions (e.g. sum, count, avg) */
  aggFunctions: string[]
  /** Available scalar/common functions */
  functions: string[]
  /** Valid Trilogy data types */
  datatypes: string[]
}

/**
 * Build a fully custom system prompt for a Trilogy-powered agent.
 *
 * The template function receives the Trilogy language constants so you can
 * embed them wherever makes sense for your application. This is useful when
 * you need a domain-specific persona (e.g. a map explorer, a support bot)
 * but still want correct Trilogy syntax guidance injected automatically.
 *
 * @example
 * ```ts
 * const SYSTEM_PROMPT = buildCustomTrilogyPrompt(
 *   ({ trilogySyntaxReference }) => `
 * You are an assistant for the SF Trees map application.
 *
 * TRILOGY LANGUAGE REFERENCE:
 * ${trilogySyntaxReference}
 * `
 * )
 * ```
 */
export function buildCustomTrilogyPrompt(
  templateFn: (ctx: TrilogyPromptContext) => string,
): string {
  return templateFn({
    trilogySyntaxReference,
    rulesInput,
    aggFunctions,
    functions,
    datatypes,
  })
}

// Flow-control tool — exported standalone so embedding apps can include it in their own tool lists
export const RETURN_TO_USER_TOOL = {
  name: 'return_to_user',
  description:
    "Signal that you are done and return control to the user. You MUST call this tool when you have completed all requested tasks and are ready for the user's next input. Provide a brief summary of what was accomplished. Never end a turn with plain text — always call this tool when finished.",
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'A brief summary of what was accomplished or a response to the user.',
      },
    },
    required: ['message'],
  },
} as const

// Tool definitions in JSON Schema format (Anthropic/OpenAI compatible)
export const CHAT_TOOLS = [
  {
    name: 'run_trilogy_query',
    description:
      'Execute a Trilogy query and return tabular results. Use this for data exploration, aggregations, and when the user wants to see raw data in a table format.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The Trilogy query to execute',
        },
        connection: {
          type: 'string',
          description: 'Data connection name to run the query against',
        },
      },
      required: ['query', 'connection'],
    },
  },
  {
    name: 'chart_trilogy_query',
    description: `Execute a Trilogy query and display results as a chart. ${chartConfigGuidance}`,
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The Trilogy query to execute',
        },
        connection: {
          type: 'string',
          description: 'Data connection name to run the query against',
        },
        chartConfig: {
          ...chartConfigSchema,
          description:
            'Optional chart configuration. Only provide if user specifically requests a chart type or configuration.',
        },
      },
      required: ['query', 'connection'],
    },
  },
  {
    name: 'select_active_import',
    description:
      'Select a single data source import to use for queries. This replaces any previously selected import. Only one import can be active at a time. After selecting an import, the tool will return the full list of available fields/concepts from that data source including their descriptions. Use list_available_imports first to see what data sources are available.',
    input_schema: {
      type: 'object',
      properties: {
        import_name: {
          type: 'string',
          description:
            'The name of the import to select (e.g., "sales.orders" or "finance.revenue"). Use list_available_imports to see available options. Pass an empty string or null to clear the current selection.',
        },
      },
      required: ['import_name'],
    },
  },
  {
    name: 'list_available_imports',
    description:
      'List all available data source imports for the current connection. Use this to discover what data models are available before adding an import.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  connectDataConnectionTool,
  {
    name: 'create_markdown',
    description:
      'Create a rich markdown artifact to display formatted text, summaries, reports, or data-driven content. Supports standard markdown syntax (headers, lists, bold, italic, links, tables, code blocks). When a query is provided, data from the query results can be referenced in the markdown template. Use this for narrative reports, executive summaries, annotated insights, or any rich text content.',
    input_schema: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description: `Markdown content to display. Supports standard markdown syntax.

If a query is also provided, inject query results using these template expressions:

BASIC SUBSTITUTION:
- {field_name} — value from the first result row (e.g. {total_flights})
- {data[N].field_name} — value from row N (e.g. {data[0].airline})
- {data.length} — total number of result rows
- {field_name || "fallback"} — value with a fallback if null/missing
- {{#each data limit=N}} ...{field}... {{/each}} — loop over rows

FORMAT SPECIFIERS (numeric fields only):
- {field_name:,} — thousands separator (e.g. {total_flights:,} → "5,797")
- {field_name:.2f} — fixed decimal places (e.g. {rate:.2f} → "1.43")
- {field_name:,.2f} — both (e.g. {revenue:,.2f} → "1,234.56")
- {field_name:.1%} — multiply by 100 and show as percentage (e.g. {rate:.1%} where rate=0.014 → "1.4%")

ARITHMETIC WITH FORMAT:
- {(expr):format} — evaluate arithmetic then format; only field names and + - * / are allowed
- Example: {(cancelled/total*100):.1f} computes the ratio and shows 1 decimal place

LIMITATIONS — what the template engine cannot do:
- No comparisons or conditional logic: {{#if (avg < 500)}} is NOT supported
- No string functions, date arithmetic, or complex expressions
- No nested loops or grouping logic
If you need conditional output (e.g. "Regional" vs "Major/National" based on a threshold), compute it in SQL/Trilogy using a CASE expression and return it as a field, then reference the field in the template.`,
        },
        title: {
          type: 'string',
          description: 'Optional title for the artifact',
        },
        query: {
          type: 'string',
          description:
            'Optional Trilogy query to execute. Results will be available for template substitution in the markdown.',
        },
        connection: {
          type: 'string',
          description:
            'Data connection name for executing the query (required if query is provided)',
        },
      },
      required: ['markdown'],
    },
  },
  {
    name: 'list_artifacts',
    description:
      'List all artifacts in the current chat session with their IDs, types, and summaries. Use this to see what artifacts exist before updating or removing them.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_artifact',
    description:
      'Get the full contents and metadata of an artifact by ID. Returns the artifact type, configuration, and data. Large result sets are truncated; use get_artifact_rows to fetch specific row ranges.',
    input_schema: {
      type: 'object',
      properties: {
        artifact_id: {
          type: 'string',
          description: 'The ID of the artifact to retrieve',
        },
      },
      required: ['artifact_id'],
    },
  },
  {
    name: 'get_artifact_rows',
    description:
      'Fetch a specific range of rows from a query result or chart artifact. Use this to inspect data in large result sets that were truncated in the initial response. Rows are 0-indexed.',
    input_schema: {
      type: 'object',
      properties: {
        artifact_id: {
          type: 'string',
          description: 'The ID of the results or chart artifact to fetch rows from',
        },
        start_row: {
          type: 'number',
          description: 'First row to return (0-indexed, inclusive)',
        },
        end_row: {
          type: 'number',
          description: 'Last row to return (0-indexed, inclusive)',
        },
      },
      required: ['artifact_id', 'start_row', 'end_row'],
    },
  },
  {
    name: 'update_artifact',
    description:
      'Update an existing artifact by ID. Can update markdown content, title, or chart configuration. Use list_artifacts first to find artifact IDs.',
    input_schema: {
      type: 'object',
      properties: {
        artifact_id: {
          type: 'string',
          description: 'The ID of the artifact to update (from list_artifacts or tool results)',
        },
        markdown: {
          type: 'string',
          description: 'New markdown content (for markdown artifacts)',
        },
        title: {
          type: 'string',
          description: 'New title for the artifact',
        },
        chartConfig: {
          ...chartConfigSchema,
          description: 'New chart configuration (for chart/results artifacts)',
        },
      },
      required: ['artifact_id'],
    },
  },
  {
    name: 'hide_artifact',
    description:
      'Hide one or more artifacts from the main view. Hidden artifacts are soft-deleted: they move to a collapsed "Hidden" section the user can expand, and you can still reference them by ID. Use this to remove stale, intermediate, or superseded artifacts during curation. Use list_artifacts first to find artifact IDs.',
    input_schema: {
      type: 'object',
      properties: {
        artifact_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'One or more artifact IDs to hide.',
        },
      },
      required: ['artifact_ids'],
    },
  },
  {
    name: 'reorder_artifacts',
    description:
      'Reorder artifacts in the chat session by providing the desired order of artifact IDs. The artifacts panel displays artifacts in order, so arrange them for maximum clarity and impact (e.g., summary/overview first, supporting details after). Any artifact IDs not included will be appended at the end in their original order.',
    input_schema: {
      type: 'object',
      properties: {
        artifact_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Ordered list of artifact IDs representing the desired display order. Use list_artifacts to find IDs.',
        },
      },
      required: ['artifact_ids'],
    },
  },
  RETURN_TO_USER_TOOL,
]

export interface ChatAgentPromptOptions {
  dataConnectionName: string | null
  availableConnections: string[]
  availableConcepts?: ModelConceptInput[]
  activeImports?: ChatImport[] // Currently imported data sources
  availableImportsForConnection?: ChatImport[] // All available imports for current connection
  isDataConnectionActive?: boolean // Whether the current data connection is connected
  /**
   * Names of chat tools the host has withheld from this conversation (see
   * `filterDisabledTools`). Guidance that tells the model to call one of them
   * is dropped so the prompt never asks for a tool the toolset does not carry.
   */
  disabledTools?: readonly string[]
}

/**
 * Remove withheld tools from a toolset. A host whose surface makes a tool
 * meaningless — an artifact panel that is not there to reorder, say — drops it
 * here rather than editing CHAT_TOOLS, so the shared registry's cached
 * toolset stays intact for every other conversation. With nothing disabled
 * the input array is returned as-is, keeping the registry's identity contract.
 */
export function filterDisabledTools<T extends { name: string }>(
  tools: readonly T[],
  disabledTools: readonly string[] | undefined,
): readonly T[] {
  if (!disabledTools || disabledTools.length === 0) return tools
  const disabled = new Set(disabledTools)
  return tools.filter((tool) => !disabled.has(tool.name))
}

/** A line of prompt guidance, tagged with the tool it tells the model to use
 *  so it can be dropped alongside that tool. */
interface ToolGuidance {
  tool?: string
  text: string
}

const ARTIFACT_MANAGEMENT_GUIDANCE: readonly ToolGuidance[] = [
  {
    text: '- Every query and chart tool call returns an artifact ID. Use these IDs to reference, update, or remove artifacts later.',
  },
  {
    tool: 'create_markdown',
    text: `- Use create_markdown to create rich formatted content: reports, summaries, annotated insights, data-driven narratives.
  - Markdown supports template expressions when a query is provided: {field_name}, {data[0].field}, {{#each data limit=5}} {field} {{/each}}`,
  },
  {
    tool: 'list_artifacts',
    text: '- Use list_artifacts to see all artifacts with their IDs, types, and metadata.',
  },
  {
    tool: 'get_artifact',
    text: '- Use get_artifact to inspect the full contents and configuration of a specific artifact.',
  },
  {
    tool: 'update_artifact',
    text: '- Use update_artifact to modify existing artifacts (change markdown content, title, or chart configuration).',
  },
  {
    tool: 'hide_artifact',
    text: '- Use hide_artifact to remove stale or superseded artifacts from the main view. Hidden artifacts are preserved and accessible to both you and the user — they are not deleted.',
  },
  {
    tool: 'create_markdown',
    text: '- When the user asks for a summary, report, or narrative, prefer create_markdown over just text responses - it renders in the artifacts panel.',
  },
]

const DOCUMENTATION_GUIDANCE: readonly ToolGuidance[] = [
  {
    tool: 'search_docs',
    text: '- When you are unsure how to express something in Trilogy — window functions, date handling, filtering on aggregates, an unfamiliar keyword — call search_docs (kind: language or function) and then read_doc, rather than guessing at syntax. The reference above is a summary; the docs carry the full idioms.',
  },
  {
    tool: 'read_doc',
    text: '- read_doc returns the full article for an id from search_docs; quote the relevant part back to the user when they ask how the language works.',
  },
]

/** Numbered on render, so dropping a step keeps the list contiguous. */
const ARTIFACT_CURATION_STEPS: readonly ToolGuidance[] = [
  { tool: 'list_artifacts', text: 'Call list_artifacts to see everything currently in the panel.' },
  {
    tool: 'hide_artifact',
    text: 'Hide stale or superseded artifacts using hide_artifact — failed queries, test runs, intermediate steps, or results from earlier questions that are no longer relevant to the current ask. Hidden artifacts are preserved (the user can restore them) and you can still reference them by ID.',
  },
  {
    tool: 'update_artifact',
    text: 'Update titles: give each remaining artifact a clear, descriptive title that explains what it shows (via update_artifact).',
  },
  {
    tool: 'reorder_artifacts',
    text: 'Reorder artifacts for maximum impact — put the most important artifact first (e.g., a summary markdown or key chart), followed by supporting detail. The artifacts panel is the primary view the user sees.',
  },
  {
    text: "The artifact panel should tell a coherent story that directly answers the user's latest request — not accumulate a growing pile from every prior turn.",
  },
]

function enabledGuidance(
  lines: readonly ToolGuidance[],
  disabledTools: readonly string[],
): ToolGuidance[] {
  return lines.filter((line) => !line.tool || !disabledTools.includes(line.tool))
}

export function buildChatAgentSystemPrompt(options: ChatAgentPromptOptions): string {
  const {
    dataConnectionName,
    availableConnections,
    availableConcepts,
    activeImports = [],
    availableImportsForConnection = [],
    isDataConnectionActive = true,
    disabledTools = [],
  } = options

  const artifactManagementSection = enabledGuidance(ARTIFACT_MANAGEMENT_GUIDANCE, disabledTools)
    .map((line) => line.text)
    .join('\n')
  const artifactCurationSection = enabledGuidance(ARTIFACT_CURATION_STEPS, disabledTools)
    .map((line, index) => `${index + 1}. ${line.text}`)
    .join('\n')
  const documentationLines = enabledGuidance(DOCUMENTATION_GUIDANCE, disabledTools)
  const documentationSection =
    documentationLines.length > 0
      ? `\n\nDOCUMENTATION:\n${documentationLines.map((line) => line.text).join('\n')}`
      : ''

  const conceptsSection =
    availableConcepts && availableConcepts.length > 0
      ? `\n\nAVAILABLE FIELDS FOR QUERIES:\n${conceptsToFieldPrompt(availableConcepts)}`
      : ''

  const connectionStatusNote =
    dataConnectionName && !isDataConnectionActive
      ? ' (NOT CONNECTED - use connect_data_connection tool to connect before running queries)'
      : ''

  const connectionInfo = dataConnectionName
    ? `ACTIVE DATA CONNECTION: ${dataConnectionName}${connectionStatusNote}`
    : 'No data connection currently selected. Ask the user which connection to use.'

  // Build imports section (single import model)
  const activeImportsSection =
    activeImports.length > 0
      ? `\nACTIVE DATA SOURCE: ${activeImports[0].name}`
      : '\nNo data source currently selected. Use select_active_import to select a data source, or use list_available_imports to see what is available.'

  const availableImportsSection =
    availableImportsForConnection.length > 0
      ? `\n\nAVAILABLE DATA SOURCES:\n${availableImportsForConnection.map((i) => `- ${i.name}${activeImports.some((a) => a.id === i.id) ? ' (active)' : ''}`).join('\n')}`
      : ''

  return `You are a data analysis assistant with access to Trilogy query capabilities.

You have access to tools that can select datasources, execute queries and generate visualizations. When a user asks about data, analyze their request, make sure you are looking at the right source, write a valid Trilogy query, and use the appropriate tool.

${connectionInfo}
AVAILABLE DATA CONNECTIONS: ${availableConnections.length > 0 ? availableConnections.join(', ') : 'None configured - user needs to set up a data connection first'}
${activeImportsSection}${availableImportsSection}

TRILOGY LANGUAGE REFERENCE:
${trilogySyntaxReference}
${conceptsSection}

IMPORTANT GUIDELINES:
1. Always use a reasonable LIMIT (e.g., 100-1000) unless the request is specifically for a time series, line chart, or the user asks for all data
2. For charts, let auto-detection choose the chart type unless the user specifies one (e.g., "show me a bar chart", "as a line graph")
3. If a query fails, explain the error clearly and try a corrected version
4. When showing data, prefer tables for detailed exploration and charts for trends/comparisons
5. Use the full field path (e.g., 'order.product.id') - never use FROM clauses
6. Remember: No GROUP BY clause - grouping is implicit by non-aggregated fields in SELECT
7. If the user question needs fields that are not in the same source, use select_active_import to switch to a different data source (only one can be active at a time). Always consider this when they change topics.
8. If the data connection is not active, use connect_data_connection to establish the connection before running queries${documentationSection}

ARTIFACT MANAGEMENT:
${artifactManagementSection}

ARTIFACT CURATION (required before every return_to_user call):
Before calling return_to_user, you MUST curate the artifact panel so it reflects a clean, coherent answer to the user's current request:
${artifactCurationSection}

COMPLETING YOUR RESPONSE:
- When you have finished addressing the user's request AND curated the artifact panel, call return_to_user with a brief summary.
- Never end a turn with plain text only — you must always call a tool. return_to_user is always your final tool call.
- The return_to_user message should be concise — the artifacts panel carries the detail.
`
}
