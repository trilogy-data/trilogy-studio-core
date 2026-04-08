import { rulesInput, functions, aggFunctions, datatypes } from './data/constants'
import { conceptsToFieldPrompt } from './data/prompts'
import type { ModelConceptInput } from './data/models'
import type { ChatImport } from '../chats/chat'
import type { DashboardModel } from '../dashboards/base'

export interface DashboardAgentPromptOptions {
  dashboard: DashboardModel
  dataConnectionName: string | null
  availableConnections: string[]
  availableConcepts?: ModelConceptInput[]
  activeImports?: ChatImport[]
  availableImportsForConnection?: ChatImport[]
  isDataConnectionActive?: boolean
}

/**
 * Build the system prompt for the dashboard chat agent.
 * This agent operates directly on a live dashboard — adding, updating,
 * and removing items in real time as the user watches.
 */
export function buildDashboardAgentSystemPrompt(options: DashboardAgentPromptOptions): string {
  const {
    dashboard,
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

  const activeImportsSection =
    activeImports.length > 0
      ? `\nACTIVE DATA SOURCE: ${activeImports[0].name}`
      : '\nNo data source currently selected. Use select_active_import to select a data source, or use list_available_imports to see what is available.'

  const availableImportsSection =
    availableImportsForConnection.length > 0
      ? `\n\nAVAILABLE DATA SOURCES:\n${availableImportsForConnection.map((i) => `- ${i.name}${activeImports.some((a) => a.id === i.id) ? ' (active)' : ''}`).join('\n')}`
      : ''

  // Summarize current dashboard state
  const itemCount = Object.keys(dashboard.gridItems).length
  const itemsSummary =
    itemCount > 0
      ? `\nCURRENT DASHBOARD ITEMS (${itemCount}):\n${Object.entries(dashboard.gridItems)
          .map(([id, item]) => {
            const content =
              typeof item.content === 'string'
                ? item.content.substring(0, 80)
                : (item.content as any)?.markdown?.substring(0, 80) || ''
            return `- [${id}] ${item.type}: "${item.name}" — ${content}${content.length >= 80 ? '...' : ''}`
          })
          .join('\n')}`
      : '\nThe dashboard is currently empty.'

  return `You are a dashboard assistant with full control over a live dashboard. The user can see changes you make in real time.

You have tools to add, update, remove, and reposition items on the dashboard grid. The grid is 20 columns wide. Items can be charts, tables, markdown blocks, or filters.

DASHBOARD: "${dashboard.name}"
${dashboard.description ? `DESCRIPTION: ${dashboard.description}` : ''}
${itemsSummary}

${connectionInfo}
AVAILABLE DATA CONNECTIONS: ${availableConnections.length > 0 ? availableConnections.join(', ') : 'None configured'}
${activeImportsSection}${availableImportsSection}

TRILOGY SYNTAX RULES:
${rulesInput}

AGGREGATE FUNCTIONS: ${aggFunctions.join(', ')}

COMMON FUNCTIONS: ${functions.join(', ')}

VALID DATA TYPES: ${datatypes.join(', ')}
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
9. Use list_dashboard_items before making changes to understand the current layout
10. The user sees changes live — explain what you're doing as you go

DASHBOARD MANAGEMENT:
- Use add_dashboard_item to create new charts, tables, and markdown blocks
- Use update_dashboard_item to modify existing items (change query, config, title)
- Use remove_dashboard_item to clean up items that are no longer needed
- Use move_dashboard_item to reposition or resize items for a better layout
- Use get_dashboard_info and update_dashboard_info for dashboard-level metadata
- Use fork_investigation to create a versioned fork of the current dashboard for deeper exploration without modifying the original

COMPLETING YOUR RESPONSE:
- When you have finished addressing the user's request, call return_to_user with a brief summary.
- Never end a turn with plain text only — you must always call a tool. return_to_user is always your final tool call.
`
}
