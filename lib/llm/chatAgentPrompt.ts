import { rulesInput, functions, aggFunctions, datatypes } from './data/constants'
import { conceptsToFieldPrompt } from './data/prompts'
import type { ModelConceptInput } from './data/models'
import type { ChartConfig, chartTypes } from '../editors/results'
import type { ChatImport } from '../chats/chat'

// Example ChartConfig for LLM reference
const CHART_CONFIG_EXAMPLE: ChartConfig = {
  chartType: 'bar' as chartTypes,
  xField: 'category',
  yField: 'revenue',
  colorField: 'region',
  hideLegend: false,
  showTitle: true,
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
    description: `Execute a Trilogy query and display results as a chart. The chart type is auto-detected based on data shape unless you specify a chartConfig. Only provide chartConfig if the user specifically requests a chart type or configuration; otherwise let auto-detection handle it.

Example chartConfig: ${JSON.stringify(CHART_CONFIG_EXAMPLE)}

Available chartTypes: 'line', 'bar', 'barh', 'point', 'area', 'donut', 'heatmap', 'treemap', 'boxplot', 'beeswarm', 'headline', 'usa-map', 'tree'`,
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
          type: 'object',
          description:
            'Optional chart configuration. Only provide if user specifically requests a chart type or configuration.',
          properties: {
            chartType: {
              type: 'string',
              enum: [
                'line',
                'bar',
                'barh',
                'point',
                'usa-map',
                'tree',
                'area',
                'headline',
                'donut',
                'heatmap',
                'boxplot',
                'treemap',
                'beeswarm',
              ],
              description: 'Type of chart to render',
            },
            xField: {
              type: 'string',
              description: 'Field name for x-axis',
            },
            yField: {
              type: 'string',
              description: 'Field name for y-axis',
            },
            yField2: {
              type: 'string',
              description: 'Secondary y-axis field (optional)',
            },
            colorField: {
              type: 'string',
              description: 'Field for color encoding (optional)',
            },
            sizeField: {
              type: 'string',
              description: 'Field for size encoding (optional)',
            },
            groupField: {
              type: 'string',
              description: 'Field for grouping data (optional)',
            },
            trellisField: {
              type: 'string',
              description: 'Field for small multiples/faceting (optional)',
            },
            geoField: {
              type: 'string',
              description: 'Field for geographic data (optional)',
            },
            hideLegend: {
              type: 'boolean',
              description: 'Whether to hide the legend',
            },
            showTitle: {
              type: 'boolean',
              description: 'Whether to show the chart title',
            },
            scaleX: {
              type: 'string',
              enum: ['linear', 'log', 'sqrt'],
              description: 'Scale type for x-axis',
            },
            scaleY: {
              type: 'string',
              enum: ['linear', 'log', 'sqrt'],
              description: 'Scale type for y-axis',
            },
          },
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
  {
    name: 'connect_data_connection',
    description:
      'Connect or reconnect a data connection that is not currently active. Use this when a query fails because the connection is not active, or when you need to establish a connection before running queries.',
    input_schema: {
      type: 'object',
      properties: {
        connection: {
          type: 'string',
          description: 'The name of the data connection to connect',
        },
      },
      required: ['connection'],
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

  const connectionStatusNote = dataConnectionName && !isDataConnectionActive
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

You have access to tools that can execute queries and generate visualizations. When a user asks about data, analyze their request, write a valid Trilogy query, and use the appropriate tool.

${connectionInfo}
AVAILABLE DATA CONNECTIONS: ${availableConnections.length > 0 ? availableConnections.join(', ') : 'None configured - user needs to set up a data connection first'}
${activeImportsSection}${availableImportsSection}

TRILOGY SYNTAX RULES:
${rulesInput}

AGGREGATE FUNCTIONS: ${aggFunctions.join(', ')}

COMMON FUNCTIONS: ${functions.slice(0, 35).join(', ')}

VALID DATA TYPES: ${datatypes.join(', ')}
${conceptsSection}

IMPORTANT GUIDELINES:
1. Always use a reasonable LIMIT (e.g., 100-1000) unless the request is specifically for a time series, line chart, or the user asks for all data
2. For charts, let auto-detection choose the chart type unless the user specifies one (e.g., "show me a bar chart", "as a line graph")
3. If a query fails, explain the error clearly and try a corrected version
4. When showing data, prefer tables for detailed exploration and charts for trends/comparisons
5. Use the full field path (e.g., 'order.product.id') - never use FROM clauses
6. Remember: No GROUP BY clause - grouping is implicit by non-aggregated fields in SELECT
7. If you need fields that aren't available, use select_active_import to switch to a different data source (only one can be active at a time)
8. If the data connection is not active, use connect_data_connection to establish the connection before running queries
`
}

// Type for parsed tool call from LLM response
export interface ParsedToolCall {
  name: string
  input: Record<string, any>
}

// Parse tool use blocks from LLM response
// Supports multiple formats for flexibility
export function parseToolCalls(response: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = []

  // Pattern 1: <tool_use> blocks (Anthropic style in text)
  const toolUseRegex =
    /<tool_use>\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"input"\s*:\s*(\{[\s\S]*?\})\s*\}\s*<\/tool_use>/g
  let match
  while ((match = toolUseRegex.exec(response)) !== null) {
    try {
      const input = JSON.parse(match[2])
      calls.push({ name: match[1], input })
    } catch (e) {
      console.error('Failed to parse tool_use block:', e)
    }
  }

  // Pattern 2: <function_call> blocks (alternative format)
  const functionCallRegex =
    /<function_call>\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}\s*<\/function_call>/g
  while ((match = functionCallRegex.exec(response)) !== null) {
    try {
      const input = JSON.parse(match[2])
      calls.push({ name: match[1], input })
    } catch (e) {
      console.error('Failed to parse function_call block:', e)
    }
  }

  // Pattern 3: JSON code block with tool call structure
  const jsonBlockRegex = /```json\s*(\{[\s\S]*?"(tool|function)"\s*:[\s\S]*?\})\s*```/g
  while ((match = jsonBlockRegex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed.tool && parsed.args) {
        calls.push({ name: parsed.tool, input: parsed.args })
      } else if (parsed.function && parsed.arguments) {
        calls.push({ name: parsed.function, input: parsed.arguments })
      } else if (parsed.name && parsed.input) {
        calls.push({ name: parsed.name, input: parsed.input })
      }
    } catch (e) {
      console.error('Failed to parse JSON block tool call:', e)
    }
  }

  return calls
}

// Helper to format tool result for feeding back to LLM
export function formatToolResult(
  toolName: string,
  success: boolean,
  result?: { rowCount?: number; columnCount?: number; error?: string },
): string {
  if (success) {
    return `Tool "${toolName}" executed successfully. Results: ${result?.rowCount || 0} rows, ${result?.columnCount || 0} columns. The data is now displayed as an artifact.`
  } else {
    return `Tool "${toolName}" failed: ${result?.error || 'Unknown error'}`
  }
}
