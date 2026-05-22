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
    description: `Add a new item to the dashboard grid. Supports chart, table, markdown, and filter types. For charts and tables, provide a Trilogy query as content. For markdown items you can ALSO supply a 'query' to drive dynamic data — the query results are then available to the markdown via {field} template substitutions (see system prompt for full templating syntax). ${chartConfigGuidance}`,
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
            'Content for the item. For chart/table: a Trilogy query. For markdown: markdown text (which may contain {field} or {{#each data}}…{{/each}} template expressions). For filter: a filter expression.',
        },
        query: {
          type: 'string',
          description:
            'Optional Trilogy query for MARKDOWN items only. When provided, the query is executed and its result rows are bound to the markdown template — you can reference fields with {field}, {data[N].field}, formats like {revenue:,.2f}, fallbacks like {field || "N/A"}, and loops {{#each data}}...{{/each}}. Ignored for non-markdown types.',
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
      'Update an existing dashboard item. Can change its query/content, chart configuration, title, or type. The item will re-execute its query after update. For MARKDOWN items, supply `content` to change the markdown text and/or `query` to change (or add) the Trilogy query that powers dynamic data templating — you do NOT need to remove and re-add the item to add a query.',
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
        query: {
          type: 'string',
          description:
            'For MARKDOWN items: a Trilogy query whose results power {field} template substitutions inside the markdown. Pass an empty string to remove the existing query. Ignored for non-markdown types.',
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
    description:
      'Update dashboard metadata such as title (name) or description. Use this — or the dedicated set_dashboard_title — whenever you create a new dashboard from a prompt so it has a meaningful title.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'New dashboard title/name',
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
    name: 'set_dashboard_title',
    description:
      'Set the dashboard title. Always call this once you understand what the user wants and the dashboard still has a placeholder name (e.g. "Dashboard 10:42 AM"). The title should be short, descriptive, and human-friendly.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The new dashboard title (short, descriptive)',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'capture_dashboard_screenshot',
    description:
      'Render the current dashboard to a PNG image and return it for visual review. Use this BEFORE returning to the user once you believe the dashboard is complete: review the captured image for layout issues (overlapping items, awkward sizing, empty regions, illegible charts, missing titles) and make corrections before handing off.',
    input_schema: {
      type: 'object',
      properties: {},
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
      'Select a data source import for the ENTIRE dashboard (not just this chat). This replaces any previously selected import and immediately becomes the import all dashboard items use on their next query execution. Any existing items whose queries reference fields from a different data source will break after switching — after calling this, use list_dashboard_items / get_dashboard_item to review existing items and update_dashboard_item (or remove_dashboard_item) to fix or remove stale queries before handing off to the user. Returns the available fields/concepts from the newly selected import. Use list_available_imports first to see what data sources are available.',
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
  RETURN_TO_USER_TOOL,
]

/**
 * Report-mode tool surface. These tools sit alongside DASHBOARD_TOOLS and are
 * used when the dashboard's layoutType is 'report'. They exist as a separate
 * surface (rather than overloading add_dashboard_item) so the agent's choices
 * are obvious in the schema and the prompt guidance stays tight: a memo is a
 * memo, not a markdown cell with a magic shape.
 */
export const REPORT_TOOLS = [
  {
    name: 'set_executive_memo',
    description:
      'Create or update the executive memo at the top of the report. Exactly one memo per report. The six fields ARE the memo — they map to the headline / verdict / magnitude / cause / action / confidence rubric. Pass `query` to bind live values into the prose via {field} templating. Calling this when a memo already exists updates it in place.',
    input_schema: {
      type: 'object',
      properties: {
        headline: {
          type: 'string',
          description:
            'One-sentence answer to "what happened?" — the lede readers should walk away with.',
        },
        verdict: {
          type: 'string',
          enum: ['good', 'bad', 'mixed', 'inconclusive'],
          description:
            'Authored verdict. Pick "inconclusive" only when the data genuinely cannot decide.',
        },
        magnitude: {
          type: 'string',
          description: 'How big is the effect? Concrete numbers, ranges, or percent changes.',
        },
        cause: {
          type: 'string',
          description:
            'Likely cause. Be specific — name segments / channels / timeframes when known.',
        },
        action: {
          type: 'string',
          description: 'What should the reader do? One concrete action or decision.',
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'How confident are you in the verdict? Be honest.',
        },
        confidence_rationale: {
          type: 'string',
          description:
            'Why that confidence level — e.g. "single comparison period, no causal isolation".',
        },
        query: {
          type: 'string',
          description:
            'Optional Trilogy query whose first row binds template values for {field} expansions inside any of the prose fields.',
        },
      },
      required: ['headline', 'verdict', 'magnitude', 'cause', 'action', 'confidence'],
    },
  },
  {
    name: 'add_claim_section',
    description:
      "Add a narrative claim section to the report. Each claim is a single point you're asserting with optional caveat and drilldown pointer. Pair it with an evidence chart or table by adding that chart RIGHT AFTER the claim (use add_dashboard_item with type='chart'); the report renderer treats them as a coupled unit. Multiple claims = multiple sections; do NOT bundle several points into one claim.",
    input_schema: {
      type: 'object',
      properties: {
        heading: {
          type: 'string',
          description:
            'Optional short heading (e.g. "1. Growth slowed because acquisition weakened"). Numbering helps readers walk the narrative.',
        },
        claim: {
          type: 'string',
          description:
            "The single-sentence claim. Make a claim — don't write 'Revenue chart' or 'Conversion analysis'.",
        },
        caveat: {
          type: 'string',
          description:
            'Honest caveat / bound on the claim — what it does NOT prove, segments it ignores, etc.',
        },
        drilldown: {
          type: 'string',
          description: 'Pointer to the next thing to investigate if the reader wants to dig.',
        },
        query: {
          type: 'string',
          description:
            'Optional Trilogy query so the claim/caveat/drilldown prose can reference live values via {field} templating.',
        },
      },
      required: ['claim'],
    },
  },
  {
    name: 'add_appendix_header',
    description:
      'Add an appendix divider. Everything you add to the dashboard AFTER this divider is rendered as appendix content (detail tables, methodology, etc.). Use exactly one per report when there is appendix content; skip when there is none.',
    input_schema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Label shown next to the divider (e.g. "Appendix", "Methodology").',
        },
      },
      required: [],
    },
  },
  {
    name: 'set_report_layout',
    description:
      "Toggle the dashboard's layout between 'grid' (free-form board) and 'report' (single-column narrative flow). Use 'report' when authoring a memo-led analytical document and 'grid' when authoring an interactive dashboard.",
    input_schema: {
      type: 'object',
      properties: {
        layout: {
          type: 'string',
          enum: ['grid', 'report'],
          description: 'Target layout type.',
        },
      },
      required: ['layout'],
    },
  },
  {
    name: 'get_provenance',
    description:
      "Return the computed provenance record for a report block: query, filters, freshness, confidence, caveat, drilldown, and row count. Use to audit a claim's evidence chain before handing off, or when the user asks how a number was derived.",
    input_schema: {
      type: 'object',
      properties: {
        item_id: {
          type: 'string',
          description: 'Block id to audit. Use list_dashboard_items to discover.',
        },
      },
      required: ['item_id'],
    },
  },
]
