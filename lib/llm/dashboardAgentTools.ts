import {
  chartConfigSchema,
  chartConfigGuidance,
  connectDataConnectionTool,
} from './sharedToolSchemas'
import { RETURN_TO_USER_TOOL } from './chatAgentPrompt'

/**
 * Tool definitions for the dashboard chat agent.
 * These tools let the LLM read and modify a live dashboard.
 */
export const DASHBOARD_TOOLS = [
  {
    name: 'list_dashboard_items',
    description:
      'List all items currently on the dashboard grid with their IDs, types, names, queries, and positions. Use this to understand the current state of the dashboard before making changes.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_dashboard_item',
    description:
      'Get full details of a specific dashboard grid item including its content, chart configuration, results, and position.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: {
          type: 'string',
          description: 'The ID of the grid item to retrieve',
        },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'add_dashboard_item',
    description: `Add a new item to the dashboard grid. Supports chart, table, markdown, and filter types. For charts and tables, provide a Trilogy query as content. ${chartConfigGuidance}`,
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['chart', 'table', 'markdown', 'filter'],
          description: 'The type of item to add',
        },
        name: {
          type: 'string',
          description: 'Display name/title for the item',
        },
        content: {
          type: 'string',
          description:
            'Content for the item. For chart/table: a Trilogy query. For markdown: markdown text. For filter: a filter expression.',
        },
        chartConfig: {
          ...chartConfigSchema,
          description:
            'Chart configuration (only for chart type). If omitted, chart type is auto-detected from the data.',
        },
        width: {
          type: 'number',
          description: 'Grid width (1-20, default 10). Full width is 20.',
        },
        height: {
          type: 'number',
          description: 'Grid height (default 8 for charts/tables, 4 for markdown)',
        },
      },
      required: ['type', 'content'],
    },
  },
  {
    name: 'update_dashboard_item',
    description:
      'Update an existing dashboard item. Can change its query/content, chart configuration, title, or type. The item will re-execute its query after update.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: {
          type: 'string',
          description: 'The ID of the item to update',
        },
        content: {
          type: 'string',
          description: 'New content (query for chart/table, markdown text for markdown)',
        },
        name: {
          type: 'string',
          description: 'New display name/title',
        },
        type: {
          type: 'string',
          enum: ['chart', 'table', 'markdown', 'filter'],
          description: 'Change the item type',
        },
        chartConfig: {
          ...chartConfigSchema,
          description: 'New chart configuration (for chart items)',
        },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'remove_dashboard_item',
    description: 'Remove an item from the dashboard grid.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: {
          type: 'string',
          description: 'The ID of the item to remove',
        },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'move_dashboard_item',
    description:
      'Reposition and/or resize an item on the dashboard grid. The grid is 20 columns wide.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: {
          type: 'string',
          description: 'The ID of the item to move',
        },
        x: {
          type: 'number',
          description: 'New x position (0-19)',
        },
        y: {
          type: 'number',
          description: 'New y position (row)',
        },
        w: {
          type: 'number',
          description: 'New width (1-20)',
        },
        h: {
          type: 'number',
          description: 'New height',
        },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'get_dashboard_info',
    description:
      'Get dashboard metadata: name, description, connection, imports, filter state, and item count.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'update_dashboard_info',
    description: 'Update dashboard metadata such as name or description.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'New dashboard name',
        },
        description: {
          type: 'string',
          description: 'New dashboard description',
        },
      },
      required: [],
    },
  },
  {
    name: 'run_trilogy_query',
    description:
      'Execute a Trilogy query for data exploration without adding it to the dashboard. Use this to test queries or explore data before adding items.',
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
    name: 'select_active_import',
    description:
      'Select a data source import to use for queries. After selecting, available fields are returned.',
    input_schema: {
      type: 'object',
      properties: {
        import_name: {
          type: 'string',
          description: 'The name of the import to select',
        },
      },
      required: ['import_name'],
    },
  },
  {
    name: 'list_available_imports',
    description: 'List all available data source imports for the current connection.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  connectDataConnectionTool,
  {
    name: 'fork_investigation',
    description:
      'Create a new investigation from the current dashboard state. An investigation is a versioned fork that appears nested under the parent dashboard in the sidebar. Use this when the user wants to explore a different angle without modifying the original dashboard.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'A descriptive name for the investigation (e.g. "Q1 revenue deep dive", "outlier analysis")',
        },
      },
      required: ['name'],
    },
  },
  RETURN_TO_USER_TOOL,
]
