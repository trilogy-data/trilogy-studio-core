import { rulesInput, aggFunctions, functions, datatypes } from './data/constants'
import { conceptsToFieldPrompt } from './data/prompts'
import type { ModelConceptInput } from './data/models'
import type { ChartConfig, chartTypes } from '../editors/results'
import type { CompletionItem } from '../stores/resolver'

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
      'Execute a Trilogy query and return results. Use this to test queries and see what data they return before writing to the editor.',
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
    description:
      'Update the chart configuration for visualizing query results. Use this when the user wants to change how results are displayed.',
    input_schema: {
      type: 'object',
      properties: {
        chartConfig: {
          type: 'object',
          description: 'Chart configuration object',
          properties: {
            chartType: {
              type: 'string',
              enum: [
                'line',
                'bar',
                'barh',
                'point',
                'geo-map',
                'tree',
                'area',
                'headline',
                'donut',
                'heatmap',
                'boxplot',
                'treemap',
                'beeswarm',
              ] as chartTypes[],
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
              description: 'Field for small multiples/faceting columns (optional)',
            },
            trellisRowField: {
              type: 'string',
              description: 'Field for small multiples/faceting rows (optional)',
            },
            geoField: {
              type: 'string',
              description: 'Field for geographic data (optional)',
            },
            annotationField: {
              type: 'string',
              description: 'Field for data point annotations/labels (optional)',
            },
            hideLegend: {
              type: 'boolean',
              description: 'Whether to hide the legend (optional)',
            },
            showTitle: {
              type: 'boolean',
              description: 'Whether to show the chart title (optional)',
            },
            scaleX: {
              type: 'string',
              enum: ['linear', 'log', 'sqrt'],
              description: 'Scale type for x-axis (optional)',
            },
            scaleY: {
              type: 'string',
              enum: ['linear', 'log', 'sqrt'],
              description: 'Scale type for y-axis (optional)',
            },
            linkY2: {
              type: 'boolean',
              description: 'Whether to link the secondary y-axis scale to the primary (optional)',
            },
          },
        },
      },
      required: ['chartConfig'],
    },
  },
  {
    name: 'edit_editor',
    description:
      'Write content to the editor. Use this to update the query the user is working on. You can continue to validate/format/run after writing.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The new content to write to the editor',
        },
        replaceSelection: {
          type: 'boolean',
          description:
            'If true, only replace the selected text. If false, replace entire editor contents. Defaults to false.',
        },
      },
      required: ['content'],
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
- run_query: Execute a query to see results
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
2. Use validate_query to check your changes
3. Optionally use run_query to test and see results
4. Use format_query to clean up formatting if needed
5. Use edit_editor to write the final result
6. Call request_close with a summary - user can then reply or confirm

IMPORTANT:
- Always use edit_editor to write your final answer - don't just show the query in text
- You can iterate: write → validate → fix → write again
- Use request_close when done - this gives the user a chance to ask for more changes
- Only use close_session after the user explicitly confirms (e.g., says "done", "looks good", "close it")
- If the user selected specific text, use replaceSelection: true to only modify that part`
}
