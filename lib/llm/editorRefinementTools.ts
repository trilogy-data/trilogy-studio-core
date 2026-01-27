import { rulesInput, aggFunctions, functions, datatypes } from './data/constants'
import { conceptsToFieldPrompt } from './data/prompts'
import type { ModelConceptInput } from './data/models'
import type { ChartConfig } from '../editors/results'
import type { CompletionItem } from '../stores/resolver'
import {
  chartConfigSchema,
  chartConfigGuidance,
  connectDataConnectionTool,
} from './sharedToolSchemas'

/**
 * Convert CompletionItem[] to ModelConceptInput[] for use with conceptsToFieldPrompt.
 * Filters to concepts only (trilogyType === 'concept').
 */
export function completionItemsToConcepts(symbols: CompletionItem[]): ModelConceptInput[] {
  return symbols
    .filter((item) => item.trilogyType === 'concept')
    .map((item) => ({
      name: item.label,
      type: item.datatype || item.type,
      description: item.description || undefined,
      calculation: item.calculation || undefined,
      keys: item.keys || undefined,
    }))
}

/**
 * Format completion items to field prompt, reusing conceptsToFieldPrompt.
 */
export function symbolsToFieldPrompt(symbols: CompletionItem[]): string {
  return conceptsToFieldPrompt(completionItemsToConcepts(symbols))
}

// Tool definitions for editor refinement in JSON Schema format
export const EDITOR_REFINEMENT_TOOLS = [
  {
    name: 'validate_query',
    description:
      'Validate a Trilogy query without executing it. Returns validation errors or confirms the query is valid, along with the list of available symbols/fields that can be used in the query. Use this to check your work before or after writing to the editor. IMPORTANT: Always validate after changing import statements, as this will refresh the available symbols from the imported sources.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The Trilogy query to validate',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'run_query',
    description:
      'Execute a Trilogy query and return results to you. Use this to test queries and see what data they return before writing to the editor.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The Trilogy query to execute',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'format_query',
    description:
      'Format/prettify a Trilogy query. Returns the formatted query string. Use this to clean up query formatting.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The Trilogy query to format',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'edit_chart_config',
    description: `Update the chart configuration for visualizing query results. Use this when the user wants to change how results are displayed.

${chartConfigGuidance}`,
    input_schema: {
      type: 'object',
      properties: {
        chartConfig: chartConfigSchema,
      },
      required: ['chartConfig'],
    },
  },
  {
    name: 'edit_editor',
    description:
      'Write content to the editor and automatically validate it. Returns validation results (errors or success with available fields). Use this to update the query - no need to call validate_query separately after editing.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The new content to write to the editor',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'run_active_editor_query',
    description:
      'Run the current editor query and display results in the main results pane as well as return them to you. Use this when the user asks to "see results", "run it", "show me", or after making changes to the chart configuration. This runs the query that is currently in the editor (not a test query).',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'request_close',
    description:
      'Request to close the refinement session. Call this when you believe you are done making changes. The user will have a chance to reply with follow-up requests before confirming. Include a summary of what was done.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Summary message describing what changes were made',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'close_session',
    description:
      'Immediately close the refinement session. Only call this after the user has confirmed they are satisfied with the changes, or if they explicitly ask to close/finish/done.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  connectDataConnectionTool,
]

export interface EditorRefinementContext {
  connectionName: string
  editorContents: string
  selectedText?: string
  selectionRange?: { start: number; end: number }
  chartConfig?: ChartConfig
  completionSymbols?: CompletionItem[]
}

export function buildEditorRefinementPrompt(context: EditorRefinementContext): string {
  const {
    connectionName,
    editorContents,
    selectedText,
    chartConfig,
    completionSymbols = [],
  } = context

  const selectionSection = selectedText
    ? `
SELECTED TEXT (user wants to modify this specifically):
\`\`\`
${selectedText}
\`\`\`
`
    : ''

  const chartSection = chartConfig
    ? `
CURRENT CHART CONFIG:
${JSON.stringify(chartConfig, null, 2)}
`
    : ''

  // Filter to concepts and format using the shared utility
  const concepts = completionItemsToConcepts(completionSymbols)
  const symbolsSection =
    concepts.length > 0
      ? `
AVAILABLE FIELDS FOR QUERIES (${concepts.length} concepts):
${symbolsToFieldPrompt(completionSymbols)}
`
      : ''

  return `You are a query refinement assistant helping the user edit their Trilogy query.

CURRENT EDITOR CONTENTS:
\`\`\`trilogy
${editorContents}
\`\`\`
${selectionSection}${chartSection}
DATA CONNECTION: ${connectionName}

AVAILABLE TOOLS:
- validate_query: Check if a query is valid without running it (also returns available fields)
- run_query: Execute a query to see results (returns results privately to you)
- run_active_editor_query: Run the current editor query and show results in the main results pane
- format_query: Format/prettify a query
- edit_chart_config: Update chart visualization settings
- edit_editor: Write changes to the editor
- request_close: Request to close the session (user can reply with follow-ups)
- close_session: Immediately close (only after user confirms or says "done")
${symbolsSection}
TRILOGY SYNTAX RULES:
${rulesInput}

AGGREGATE FUNCTIONS: ${aggFunctions.join(', ')}

COMMON FUNCTIONS: ${functions.slice(0, 35).join(', ')}

VALID DATA TYPES: ${datatypes.join(', ')}

WORKFLOW:
1. Understand what the user wants to change
2. Use edit_editor to write your changes (this automatically validates and returns errors/available fields)
3. Optionally use run_query to test and see results privately
4. Use format_query to clean up formatting if needed
5. Call request_close with a summary - user can then reply or confirm

IMPORTANT:
- Always use edit_editor to write your final answer - don't just show the query in text
- edit_editor automatically validates, so you don't need to call validate_query separately after editing
- You can iterate: write → fix based on validation errors → write again
- Use request_close when done - this gives the user a chance to ask for more changes
- Only use close_session after the user explicitly confirms (e.g., says "done", "looks good", "close it")
- If the user selected specific text, use replaceSelection: true to only modify that part
- After updating chart configuration with edit_chart_config, use run_active_editor_query to show the user the updated visualization
- When the user asks to "run it", "see the results", "show me", or similar, use run_active_editor_query to execute and display in the main results pane`
}
