import { type CellType } from "./base";
/**
 * Parses a JSON string into a PromptDashboard object
 * @param jsonString The JSON string to parse
 * @returns A PromptDashboard object
 * @throws Error if the JSON is invalid or doesn't match the expected structure
 */
export function parseDashboardSpec(jsonString: string): PromptDashboard {
  // First, try to parse the JSON
  let parsedJson: any;
  try {
    parsedJson = JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Invalid JSON format: ${(error as Error).message}`);
  }

  // Validate required top-level fields
  if (!parsedJson.name || typeof parsedJson.name !== 'string') {
    throw new Error('Dashboard must have a name property of type string');
  }

  if (!parsedJson.description || typeof parsedJson.description !== 'string') {
    throw new Error('Dashboard must have a description property of type string');
  }

  if (!Array.isArray(parsedJson.layout)) {
    throw new Error('Dashboard must have a layout property of type array');
  }

  if (!parsedJson.gridItems || typeof parsedJson.gridItems !== 'object') {
    throw new Error('Dashboard must have a gridItems property of type object');
  }

  // Validate layout items
  const layoutItemIds = new Set<string>();
  for (let i = 0; i < parsedJson.layout.length; i++) {
    const item = parsedJson.layout[i];
    if (!item.id || typeof item.id !== 'string') {
      throw new Error(`Layout item at index ${i} must have an id property of type string`);
    }

    if (typeof item.x !== 'number') {
      throw new Error(`Layout item with id '${item.id}' must have an x property of type number`);
    }

    if (typeof item.y !== 'number') {
      throw new Error(`Layout item with id '${item.id}' must have a y property of type number`);
    }

    if (typeof item.w !== 'number') {
      throw new Error(`Layout item with id '${item.id}' must have a w property of type number`);
    }

    if (typeof item.h !== 'number') {
      throw new Error(`Layout item with id '${item.id}' must have an h property of type number`);
    }

    layoutItemIds.add(item.id);
  }

  // Validate gridItems
  // Validate gridItems
  for (const [id, gridItem] of Object.entries<PromptGridItemData>(parsedJson.gridItems)) {
    if (!layoutItemIds.has(id)) {
      throw new Error(`Grid item with id '${id}' does not have a corresponding layout item`);
    }

    // Fixed type error by properly typing gridItem as PromptGridItemData
    if (!gridItem.type || typeof gridItem.type !== 'string') {
      throw new Error(`Grid item with id '${id}' must have a type property of type string`);
    }

    if (!gridItem.content || typeof gridItem.content !== 'string') {
      throw new Error(`Grid item with id '${id}' must have a content property of type string`);
    }

    if (!gridItem.name || typeof gridItem.name !== 'string') {
      throw new Error(`Grid item with id '${id}' must have a name property of type string`);
    }

    // Check optional properties if they exist
    if ('width' in gridItem && typeof gridItem.width !== 'number') {
      throw new Error(`Grid item with id '${id}' has an invalid width property (must be a number)`);
    }

  }

  // Check that all layout items have corresponding grid items
  for (const id of layoutItemIds) {
    if (!(id in parsedJson.gridItems)) {
      throw new Error(`Layout item with id '${id}' does not have a corresponding grid item`);
    }
  }

  // If all validations pass, return the typed object
  return parsedJson as PromptDashboard;
}

export interface PromptLayoutItem {
  x: number
  y: number
  w: number
  h: number
  id: string
}

// This contains details about the layout
// the 
export interface PromptGridItemData {
  type: CellType
  content: string
  name: string
  width?: number
  height?: number
}

export interface PromptDashboard {
  name: string
  layout: PromptLayoutItem[]
  // the key here will associate a grid item with a layout item (in the id field)
  gridItems: Record<string, PromptGridItemData>
  description: string
}

export const PROMPT = `You are a talented dashboard designer. Given this typescript template format for a dashboard config, and a list of available fields,
generate a JSON spec that can be imported into these typescript objects that will appropriately visualize data for the provided prompt.

Lean on the principles of Edward Tufte in your design. Just focus on laying out content for an interactive, click based exploration; do not 
mention filtering.

Appropriately mix in description and markdown to explain the data and the visualizations.

The horizontal grid components are on a 0-20 scale, which will respond to width. Rows are 30 pixels high. Markdown components should be at least 3 rows high. 

Make the dashboard comprehensive. If the user asks for something detailed, it should typically be 5-8 rows (5-10 cells); otherwise 3-6 is appropriate (4-6 cells). 

For the chart and table types, in the content, write a a prompt for the data you want to visualize. Another analyst
will transform this into a real SQL query.
The prompt should be descriptive and precise to ensure they understand your intent, but should avoid SQL syntax.  
They only have access to the same fields as you will be given below, so plan appropriately
and do not ask them for something they will be unable to answer with that data.

For markdown, you can directly fill in the appropriate markdown syntax. Markdown cells are static and will not run/fetch data. The other
two cells will be populated by queries. 

Typescript format "
export const CELL_TYPES = {
    CHART: 'chart',
    MARKDOWN: 'markdown',
    TABLE: 'table',
  } as const
  
export type CellType = (typeof CELL_TYPES)[keyof typeof CELL_TYPES]

export interface PromptLayoutItem {
  x: number
  y: number
  w: number
  h: number
  id: string
}

// This contains details about the layout
// the 
export interface PromptGridItemData {
  type: CellType
  content: string
  name: string
  width?: number
  height?: number
}

export interface PromptDashboard {
  name: string
  layout: PromptLayoutItem[]
  // the key here will associate a grid item with a layout item (in the id field)
  gridItems: Record<string, PromptGridItemData>
  description: string
}

"

`

export function generateDashboardPrompt(prompt: string, fields: string): string {
  return `
  ${PROMPT}
  The prompt is: "${prompt}"
  The available fields are:
  ${fields}

  Return your answer as a JSON object surrounded by triple backticks. Include your reasoning before the object.
  `
}
