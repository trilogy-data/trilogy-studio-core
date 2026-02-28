import { rulesInput, functions, aggFunctions, datatypes } from './data/constants'
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
 *   ({ rulesInput, aggFunctions, functions, datatypes }) => `
 * You are an assistant for the SF Trees map application.
 *
 * TRILOGY SYNTAX RULES:
 * ${rulesInput}
 *
 * AGGREGATE FUNCTIONS: ${aggFunctions.join(', ')}
 * COMMON FUNCTIONS: ${functions.join(', ')}
 * VALID DATA TYPES: ${datatypes.join(', ')}
 * `
 * )
 * ```
 */
export function buildCustomTrilogyPrompt(
  templateFn: (ctx: TrilogyPromptContext) => string,
): string {
  return templateFn({ rulesInput, aggFunctions, functions, datatypes })
}

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
      'Create a rich markdown artifact to display formatted text, summaries, reports, or data-driven content. Supports standard markdown syntax (headers, lists, bold, italic, links, tables, code blocks). When a query is provided, data from the query results can be referenced in the markdown template using {field_name} for simple substitutions, {data[0].field} for indexed access, and {{#each data limit=N}} {field} {{/each}} for loops. Use this for narrative reports, executive summaries, annotated insights, or any rich text content.',
    input_schema: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description:
            'Markdown content to display. Supports standard markdown syntax. If a query is also provided, you can use template expressions like {field_name}, {data.length}, or {{#each data limit=5}} - {field}: {value} {{/each}} to inject query results.',
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
      'Get the full contents and metadata of an artifact by ID. Returns the artifact type, configuration, and data. Use this to inspect artifact details before updating or when you need to reference artifact data.',
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
    name: 'remove_artifact',
    description:
      'Remove an artifact from the chat session by ID. Use list_artifacts first to find artifact IDs.',
    input_schema: {
      type: 'object',
      properties: {
        artifact_id: {
          type: 'string',
          description: 'The ID of the artifact to remove',
        },
      },
      required: ['artifact_id'],
    },
  },
]

export interface ChatAgentPromptOptions {
  dataConnectionName: string | null
  availableConnections: string[]
  availableConcepts?: ModelConceptInput[]
  activeImports?: ChatImport[] // Currently imported data sources
  availableImportsForConnection?: ChatImport[] // All available imports for current connection
  isDataConnectionActive?: boolean // Whether the current data connection is connected
}

export function buildChatAgentSystemPrompt(options: ChatAgentPromptOptions): string {
  const {
    dataConnectionName,
    availableConnections,
    availableConcepts,
    activeImports = [],
    availableImportsForConnection = [],
    isDataConnectionActive = true,
  } = options

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

TRILOGY SYNTAX RULES:
${rulesInput}

AGGREGATE FUNCTIONS: ${aggFunctions.join(', ')}

COMMON FUNCTIONS: ${functions.join(', ')}

VALID DATA TYPES: ${datatypes.join(', ')}
${conceptsSection}

IMPORTANT GUIDELINES:
1. Always use a reasonable LIMIT (e.g., 100-1000) unless the request is specifically for a time series, line chart, or the user asks for all data
2. For charts, let auto-detection choose the chart type unless the user specifies one (e.g., "show me a bar chart", "as a line graph")
3. If a query fails, explain the error clearly and try a corrected version
4. When showing data, prefer tables for detailed exploration and charts for trends/comparisons
5. Use the full field path (e.g., 'order.product.id') - never use FROM clauses
6. Remember: No GROUP BY clause - grouping is implicit by non-aggregated fields in SELECT
7. If the user question needs fields that are not in the same source, use select_active_import to switch to a different data source (only one can be active at a time). Always consider this when they change topics.
8. If the data connection is not active, use connect_data_connection to establish the connection before running queries

ARTIFACT MANAGEMENT:
- Every query and chart tool call returns an artifact ID. Use these IDs to reference, update, or remove artifacts later.
- Use create_markdown to create rich formatted content: reports, summaries, annotated insights, data-driven narratives.
  - Markdown supports template expressions when a query is provided: {field_name}, {data[0].field}, {{#each data limit=5}} {field} {{/each}}
- Use list_artifacts to see all artifacts with their IDs, types, and metadata.
- Use get_artifact to inspect the full contents and configuration of a specific artifact.
- Use update_artifact to modify existing artifacts (change markdown content, title, or chart configuration).
- Use remove_artifact to clean up artifacts that are no longer needed.
- When the user asks for a summary, report, or narrative, prefer create_markdown over just text responses - it renders in the artifacts panel.

ARTIFACT CURATION:
Before you finish responding to a multi-step request, review and curate your artifacts:
1. Use list_artifacts to see what artifacts currently exist.
2. Remove any intermediate/exploratory artifacts that are not part of the final answer (e.g., failed queries, test runs, superseded results).
3. Give remaining artifacts clear, descriptive titles via update_artifact.
4. The user can publish the artifact list as a dashboard, so ensure the final set is clean and presentable.
`
}
