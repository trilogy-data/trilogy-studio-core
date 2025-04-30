// Define types for dashboard layouts
import type { ChartConfig } from '../editors/results'
import { CELL_TYPES, type CellType } from './base'

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
  for (const [id, gridItem] of Object.entries(parsedJson.gridItems)) {
    if (!layoutItemIds.has(id)) {
      throw new Error(`Grid item with id '${id}' does not have a corresponding layout item`);
    }
    
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
    
    if ('height' in gridItem && typeof gridItem.height !== 'number') {
      throw new Error(`Grid item with id '${id}' has an invalid height property (must be a number)`);
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

export const PROMPT = `You are a talented data analyst. Given this typescript template format for a dashboard config, and a list of available fields.,
generate a JSON spec that can be imported into these typescript objects that will appropriately visualize data for the provided business case.

Lean on the principles of Edward Tufte in your design. The dashboard tool will automatically support filtering/cross filtering,
so just focus on laying out content.
Appropriately mix in description and markdown to explain the data and the visualizations.

The horizontal grid components are on a 0-20 scale, which will respond to width. Rows are 30 pixels high. Markdown components should be at least 3 rows high. 

For the chart and table types, in the content, write a a prompt for a SQL query that will pull appropriate data. Another analyst
will fill in the SQL query. The prompt should be descriptive and precise to ensure they understand your intent. For markdown,
you can directly fill in the appropriate markdown syntax. Markdown cells are static and will not run/fetch data. The other
two cells will be populaed by queries. 

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

export function generateDashboardPrompt(prompt:string, fields:string = EXAMPLE_FIELDS): string {
  return `
  ${PROMPT}
  The business case is: ${prompt}
  The available fields are:
  ${fields}

  Return your answer as a JSON object surrounded by triple backticks. Include your reasoning before the object.
  `
}

export const EXAMPLE_FIELDS = `[name:order.customer.nation.region.id type:DataType.INTEGER ], 
[name:order.customer.nation.region.id.count type:DataType.INTEGER description:Auto-derived integer. The count of local.id, a int],
[name:order.customer.nation.region.name type:DataType.STRING description:capitalized; eg ASIA or EUROPE or MIDDLE EAST etc], [name:order.customer.nation.region.comment type:DataType.STRING ],
[name:order.customer.nation.id type:DataType.INTEGER ], [name:order.customer.nation.id.count type:DataType.INTEGER description:Auto-derived integer. The count of local.id, a int], 
[name:order.customer.nation.name type:Trait<DataType.STRING, ['country']> description:capitalized; eg UNITED STATES or FRANCE or CANADA], 
[name:order.customer.nation.comment type:DataType.STRING ], [name:order.customer.id type:DataType.INTEGER ],
[name:order.customer.id.count type:DataType.INTEGER description:Auto-derived integer. The count of local.id, a int], [name:order.customer.name type:DataType.STRING ], 
[name:order.customer.address type:DataType.STRING ], [name:order.customer.phone type:DataType.STRING ], [name:order.customer.account_balance type:Trait<DataType.FLOAT, ['usd']> ], 
[name:order.customer.market_segment type:DataType.STRING description:Capitalized; one of BUILDING | FURNITURE | MACHINERY | AUTOMOBILE | HOUSEHOLD], [name:order.customer.comment type:DataType.STRING ],
[name:order.id type:DataType.INTEGER description:order key], [name:order.id.count type:DataType.INTEGER description:Auto-derived integer. The count of local.id, a int], 
[name:order.status type:DataType.STRING ], [name:order.total_price type:Trait<DataType.FLOAT, ['usd']> ], [name:order.date type:DataType.DATE ],
[name:order.date.month type:Trait<DataType.INTEGER, ['month']> description:Auto-derived from a local.date. The month part of a timestamp/date. Integer, 1-12.],
[name:order.date.year type:Trait<DataType.INTEGER, ['year']> description:Auto-derived from a local.date. The year part of a timestamp/date. Integer.],
[name:order.date.quarter type:Trait<DataType.INTEGER, ['quarter']> description:Auto-derived from a local.date. The quarter part of a timestamp/date. Integer, 1-4.], 
[name:order.date.day type:Trait<DataType.INTEGER, ['day']> description:Auto-derived from a local.date. day], 
[name:order.date.day_of_week type:Trait<DataType.INTEGER, ['day_of_week']> description:Auto-derived from a local.date. The day of the week part of a timestamp/date. Integer, 0-6.],
[name:order.date.month_start type:DataType.DATE description:Auto-derived from a local.date. The date truncated to the month.],
[name:order.date.year_start type:DataType.DATE description:Auto-derived from a local.date. The date truncated to the year.], 
[name:order.priority type:DataType.STRING description:enum, one of: 1-URGENT, 2-HIGH, 3-MEDIUM, 4-NOT SPECIFIED],
[name:order.clerk type:DataType.STRING ],
[name:order.ship_priority type:DataType.STRING description:enum, one of: 1-URGENT, 2-HIGH, 3-MEDIUM, 4-NOT SPECIFIED], [name:order.comment type:DataType.STRING ],
[name:supplier.nation.region.id type:DataType.INTEGER ], [name:supplier.nation.region.id.count type:DataType.INTEGER description:Auto-derived integer. The count of local.id, a int],
[name:supplier.nation.region.name type:DataType.STRING description:capitalized; eg ASIA or EUROPE or MIDDLE EAST etc], [name:supplier.nation.region.comment type:DataType.STRING ],
[name:supplier.nation.id type:DataType.INTEGER ], [name:supplier.nation.id.count type:DataType.INTEGER description:Auto-derived integer. The count of local.id, a int],
[name:supplier.nation.name type:Trait<DataType.STRING, ['country']> description:capitalized; eg UNITED STATES or FRANCE or CANADA], [name:supplier.nation.comment type:DataType.STRING ], 
[name:supplier.id type:DataType.INTEGER ], [name:supplier.id.count type:DataType.INTEGER description:Auto-derived integer. The count of local.id, a int], [name:supplier.name type:DataType.STRING ],
[name:supplier.address type:DataType.STRING ], [name:supplier.phone type:DataType.STRING ], [name:supplier.account_balance type:DataType.STRING ], [name:supplier.comment type:DataType.STRING ],
[name:part.supplier.nation.region.id type:DataType.INTEGER ], [name:part.supplier.nation.region.id.count type:DataType.INTEGER description:Auto-derived integer. The count of local.id, a int], 
[name:part.supplier.nation.region.name type:DataType.STRING description:capitalized; eg ASIA or EUROPE or MIDDLE EAST etc], [name:part.supplier.nation.region.comment type:DataType.STRING ], 
[name:part.supplier.nation.id type:DataType.INTEGER ], [name:part.supplier.nation.id.count type:DataType.INTEGER description:Auto-derived integer. The count of local.id, a int], 
[name:part.supplier.nation.name type:Trait<DataType.STRING, ['country']> description:capitalized; eg UNITED STATES or FRANCE or CANADA], [name:part.supplier.nation.comment type:DataType.STRING ],
[name:part.supplier.id type:DataType.INTEGER ], [name:part.supplier.id.count type:DataType.INTEGER description:Auto-derived integer. The count of local.id, a int], 
[name:part.supplier.name type:DataType.STRING ], [name:part.supplier.address type:DataType.STRING ], [name:part.supplier.phone type:DataType.STRING ],
[name:part.supplier.account_balance type:DataType.STRING ], [name:part.supplier.comment type:DataType.STRING ], [name:part.id type:DataType.INTEGER ],
[name:part.id.count type:DataType.INTEGER description:Auto-derived integer. The count of local.id, a int], [name:part.name type:DataType.STRING ], 
[name:part.manufacturer type:DataType.STRING ], [name:part.brand type:DataType.STRING ], [name:part.type type:DataType.STRING description:Capitalized; large number of values], 
[name:part.size type:DataType.INTEGER description:number; 1-50], [name:part.container type:DataType.STRING description:Capitalized; large number of values, ex LG DRUM | WRAP BAG],
[name:part.retail_price type:Trait<DataType.FLOAT, ['usd']> ], [name:part.comment type:DataType.STRING ], [name:part.available_quantity type:DataType.FLOAT ], 
[name:part.supply_cost type:Trait<DataType.FLOAT, ['usd']> ], [name:part.supplier_comment type:DataType.STRING ],
[name:id type:DataType.INTEGER description:unique key identifying a lineitem within an order],
[name:id.count type:DataType.INTEGER description:Auto-derived integer. The count of local.id, a int], 
[name:quantity type:DataType.FLOAT description:quantity of an part within an order], [name:extended_price type:Trait<DataType.FLOAT, ['usd']> ],
[name:discount type:Trait<DataType.FLOAT, ['percent']> description:percent discount],
[name:tax type:Trait<DataType.FLOAT, ['percent']> description:tax, as percentage], 
[name:return_flag type:DataType.STRING description:Capital flag, one of A | N | R], [name:line_status type:DataType.STRING description:Capital flag, one of O | F], 
[name:ship_date type:DataType.DATE ], [name:ship_date.month type:Trait<DataType.INTEGER, ['month']> description:Auto-derived from a local.ship_date. The month part of a timestamp/date. Integer, 1-12.], 
[name:ship_date.year type:Trait<DataType.INTEGER, ['year']> description:Auto-derived from a local.ship_date. The year part of a timestamp/date. Integer.], 
[name:ship_date.quarter type:Trait<DataType.INTEGER, ['quarter']> description:Auto-derived from a local.ship_date. The quarter part of a timestamp/date. Integer, 1-4.], 
[name:ship_date.day type:Trait<DataType.INTEGER, ['day']> description:Auto-derived from a local.ship_date. day],
[name:ship_date.day_of_week type:Trait<DataType.INTEGER, ['day_of_week']> description:Auto-derived from a local.ship_date. The day of the week part of a timestamp/date. Integer, 0-6.], 
[name:ship_date.month_start type:DataType.DATE description:Auto-derived from a local.ship_date. The date truncated to the month.],
[name:ship_date.year_start type:DataType.DATE description:Auto-derived from a local.ship_date. The date truncated to the year.],
[name:commit_date type:DataType.DATE ], [name:commit_date.month type:Trait<DataType.INTEGER, ['month']> description:Auto-derived from a local.commit_date. The month part of a timestamp/date. Integer, 1-12.], 
[name:commit_date.year type:Trait<DataType.INTEGER, ['year']> description:Auto-derived from a local.commit_date. The year part of a timestamp/date. Integer.], 
[name:commit_date.quarter type:Trait<DataType.INTEGER, ['quarter']> description:Auto-derived from a local.commit_date. The quarter part of a timestamp/date. Integer, 1-4.],
[name:commit_date.day type:Trait<DataType.INTEGER, ['day']> description:Auto-derived from a local.commit_date. day], 
[name:commit_date.day_of_week type:Trait<DataType.INTEGER, ['day_of_week']> description:Auto-derived from a local.commit_date. The day of the week part of a timestamp/date. Integer, 0-6.], 
[name:commit_date.month_start type:DataType.DATE description:Auto-derived from a local.commit_date. The date truncated to the month.], 
[name:commit_date.year_start type:DataType.DATE description:Auto-derived from a local.commit_date. The date truncated to the year.], [name:receipt_date type:DataType.DATE ], 
[name:receipt_date.month type:Trait<DataType.INTEGER, ['month']> description:Auto-derived from a local.receipt_date. The month part of a timestamp/date. Integer, 1-12.], 
[name:receipt_date.year type:Trait<DataType.INTEGER, ['year']> description:Auto-derived from a local.receipt_date. The year part of a timestamp/date. Integer.], 
[name:receipt_date.quarter type:Trait<DataType.INTEGER, ['quarter']> description:Auto-derived from a local.receipt_date. The quarter part of a timestamp/date. Integer, 1-4.],
[name:receipt_date.day type:Trait<DataType.INTEGER, ['day']> description:Auto-derived from a local.receipt_date. day],
[name:receipt_date.day_of_week type:Trait<DataType.INTEGER, ['day_of_week']> description:Auto-derived from a local.receipt_date. The day of the week part of a timestamp/date. Integer, 0-6.],
[name:receipt_date.month_start type:DataType.DATE description:Auto-derived from a local.receipt_date. The date truncated to the month.],
[name:receipt_date.year_start type:DataType.DATE description:Auto-derived from a local.receipt_date. The date truncated to the year.],
[name:ship_instruct type:DataType.STRING description:one of DELIVER IN PERSON | COLLECT COD | NONE | TAKE BACK RETURN],
[name:ship_mode type:DataType.STRING description:capitalized; one of TRUCK | MAIL | AIR | REG AIR | FOB | RAIL | SHIP],
[name:comment type:DataType.STRING ], [name:revenue type:Trait<DataType.FLOAT, ['usd']> description:revenue is our price, with discount applied],
[name:customer_charged type:Trait<DataType.FLOAT, ['usd']> description:the customer is charged a total that includes tax based on the revenue],
[name:total_revenue type:Trait<DataType.FLOAT, ['usd']> description:total revenue is an aggregated revenue suitable for use in a report], 
[name:test type:DataType.INTEGER ],`