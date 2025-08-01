// Define types for dashboard layouts
import type { ChartConfig } from '../editors/results'
import type { Results } from '../editors/results'
import { objectToSqlExpression } from './conditions'
import type { ContentInput } from '../stores/resolver'
export interface DimensionClick {
  source: string
  filters: Record<string, string>
  chart: Record<string, string>
  append: boolean
}
export interface DashboardImport {
  id: string
  name: string
  alias: string
}

export interface LayoutItem {
  x: number
  y: number
  w: number
  h: number
  i: string
  static: boolean
}

export interface Filter {
  source: string
  value: string
}

export interface FilterInput {
  source: string
  value: Record<string, string>
}

export interface MarkdownData {
  markdown: string
  query: string
}
export interface GridItemData {
  type: 'chart' | 'markdown' | 'table'
  content: string | MarkdownData
  name: string
  allowCrossFilter: boolean
  width?: number
  height?: number
  chartConfig?: ChartConfig
  conceptFilters?: FilterInput[]
  chartFilters?: FilterInput[]
  filters?: Filter[]
  parameters?: Record<string, unknown>
  results?: Results | null
}

export interface GridItemDataResponse {
  type: 'chart' | 'markdown' | 'table'
  content: string
  structured_content: MarkdownData
  rootContent: ContentInput[]
  name: string
  allowCrossFilter: boolean
  width?: number
  height?: number
  chartConfig?: ChartConfig
  connectionName?: string
  imports?: DashboardImport[]
  conceptFilters?: FilterInput[]
  chartFilters?: FilterInput[]
  filters?: Filter[]
  parameters?: Record<string, unknown>
  onRefresh?: (itemId: string) => void
  results?: Results | null
}

export interface Dashboard {
  id: string
  name: string
  storage: 'local' | 'remote'
  connection: string
  layout: LayoutItem[]
  gridItems: Record<string, GridItemData>
  nextId: number
  createdAt: Date
  updatedAt: Date
  filter: string | null
  imports: DashboardImport[]
  version: number
  description: string
  state: 'editing' | 'published' | 'locked'
}

// Cell types enum
export const CELL_TYPES = {
  CHART: 'chart',
  MARKDOWN: 'markdown',
  TABLE: 'table',
} as const

export type CellType = (typeof CELL_TYPES)[keyof typeof CELL_TYPES]

// Dashboard class implementation
export class DashboardModel implements Dashboard {
  id: string
  name: string
  storage: 'local' | 'remote'
  connection: string
  layout: LayoutItem[] = []
  gridItems: Record<string, GridItemData> = {}
  nextId: number = 0
  createdAt: Date
  updatedAt: Date
  filter: string | null = null
  imports: DashboardImport[] = []
  version: number
  state: 'editing' | 'published' | 'locked' = 'editing'
  description: string = ''
  changed: boolean = false
  deleted: boolean = false

  constructor({
    id,
    name,
    storage = 'local',
    connection,
    layout = [],
    gridItems = {},
    nextId = 0,
    createdAt,
    updatedAt,
    filter = null,
    imports = [],
    version = 1,
    state = 'editing',
    description = '',
  }: Partial<Dashboard> & { id: string; name: string; connection: string }) {
    this.id = id
    this.name = name
    this.storage = storage
    this.connection = connection
    this.layout = layout
    this.gridItems = gridItems
    this.nextId = nextId
    this.createdAt = createdAt || new Date()
    this.updatedAt = updatedAt || new Date()
    this.filter = filter
    this.imports = imports
    this.version = version
    this.state = state
    this.description = description
    this.changed = false
  }

  delete() {
    this.deleted = true
    this.changed = true
  }

  // Add a new item to the dashboard
  addItem(
    type: CellType,
    x = 0,
    y = 0,
    w = 4,
    h: number | null = null,
    content: string | null = null,
    name: string | null,
  ): string {
    const itemId = this.nextId.toString()

    // Create grid item layout with height based on type
    let defaultHeight = 10 // Default height for CHART and TABLE
    if (type === CELL_TYPES.MARKDOWN) {
      defaultHeight = 3 // Smaller height for markdown
    }

    this.layout.push({
      x,
      y,
      w: w,
      h: h || defaultHeight,
      i: itemId,
      static: false,
    })

    // Default name based on type
    let defaultName = `Note ${itemId}`
    if (type === CELL_TYPES.CHART) {
      defaultName = `Chart ${itemId}`
    } else if (type === CELL_TYPES.TABLE) {
      defaultName = `Table ${itemId}`
    }

    let finalName = name || defaultName

    // Default content based on type
    let defaultContent = '# Markdown Cell\nEnter your markdown content here.'
    if (type === CELL_TYPES.CHART) {
      defaultContent = "SELECT unnest([1,2,3,4]) as value, 'example' as dim"
    } else if (type === CELL_TYPES.TABLE) {
      defaultContent = "SELECT [1,2,3,4] as value, 'example' as dim"
    }

    let finalContent = content || defaultContent

    // Initialize with default content
    this.gridItems[itemId] = {
      type,
      content: finalContent,
      name: finalName,
      width: 0,
      height: 0,
      allowCrossFilter: true, // Default to allowing cross-filtering
    }

    this.nextId++
    this.updatedAt = new Date()
    this.changed = true
    return itemId
  }

  copyItem(itemId: string): string {
    if (!this.gridItems[itemId]) {
      throw new Error(`Item with ID "${itemId}" does not exist in the dashboard.`)
    }
    let layoutItem = this.layout.find((item) => item.i === itemId)
    if (!layoutItem) {
      throw new Error(`Layout item with ID "${itemId}" does not exist in the dashboard
.`)
    }
    const newItemId = this.nextId.toString()
    this.gridItems[newItemId] = { ...this.gridItems[itemId] }
    this.layout.push({ ...layoutItem, i: newItemId })
    this.updatedAt = new Date()
    this.changed = true
    this.nextId++
    return newItemId
  }

  // Update an item's content
  updateItemContent(itemId: string, content: string): void {
    if (this.gridItems[itemId]) {
      this.gridItems[itemId] = {
        ...this.gridItems[itemId],
        content,
      }
      this.updatedAt = new Date()
      this.changed = true
    }
  }

  updateItemCrossFilterEligibility(itemId: string, allowCrossFilter: boolean): void {
    if (this.gridItems[itemId]) {
      this.gridItems[itemId] = {
        ...this.gridItems[itemId],
        allowCrossFilter,
      }
      this.updatedAt = new Date()
      this.changed = true
    } else {
      console.warn(
        `Item with ID "${itemId}" does not exist in dashboard "${this.id}". Cannot update cross-filter eligibility.`,
      )
    }
  }

  updateItemResults(itemId: string, results: Results | null): void {
    if (this.gridItems[itemId]) {
      this.gridItems[itemId] = {
        ...this.gridItems[itemId],
        results,
      }
      this.updatedAt = new Date()
    }
  }

  updateItemType(itemId: string, type: 'chart' | 'markdown' | 'table'): void {
    if (this.gridItems[itemId]) {
      this.gridItems[itemId] = {
        ...this.gridItems[itemId],
        type,
      }
      this.updatedAt = new Date()
      this.changed = true
    }
  }

  updateItemFilters(itemID: string) {
    const gridItem = this.gridItems[itemID]
    if (gridItem) {
      gridItem.filters = gridItem.filters || []
      gridItem.filters = gridItem.filters.filter((f) => f.source !== 'cross')
      if (gridItem.conceptFilters && gridItem.conceptFilters.length > 0) {
        let build = objectToSqlExpression(gridItem.conceptFilters.map((f) => f.value))
        gridItem.filters.push({
          source: 'cross',
          value: build,
        })
        // gridItem.parameters = build.parameters
      }
      this.updatedAt = new Date()
      this.changed = true
    }
  }

  removeItemCrossFilter(itemId: string, source: string) {
    // remove the filter from all items in the dashboard who DOmatch the itemId
    for (const id in this.gridItems) {
      if (id === itemId) {
        const gridItem = this.gridItems[id]
        gridItem.conceptFilters = gridItem.conceptFilters || []
        gridItem.conceptFilters = gridItem.conceptFilters.filter((f) => f.source !== source)
        gridItem.filters = gridItem.filters || []
        gridItem.filters = gridItem.filters.filter((f) => f.source !== source)
      }
    }
  }

  removeItemCrossFilterSource(itemId: string) {
    // remove the filter from all items in the dashboard who DOmatch the itemId
    for (const id in this.gridItems) {
      if (id === itemId) {
        const gridItem = this.gridItems[id]
        gridItem.filters = gridItem.filters || []
        gridItem.chartFilters = []
      }
      if (id !== itemId) {
        const gridItem = this.gridItems[id]
        gridItem.conceptFilters = gridItem.conceptFilters || []
        gridItem.conceptFilters = gridItem.conceptFilters.filter((f) => f.source !== itemId)
        this.updateItemFilters(id)
      }
    }
  }

  removeAllFilters() {
    // remove the filter from all items in the dashboard
    for (const id in this.gridItems) {
      const gridItem = this.gridItems[id]
      gridItem.conceptFilters = []
      gridItem.chartFilters = []
      gridItem.filters = []
      gridItem.parameters = {}
    }
    this.updatedAt = new Date()
    this.changed = true
  }

  updateItemCrossFilters(
    itemId: string,
    conceptMap: Record<string, string>,
    chartMap: Record<string, string>,
    operation: 'add' | 'append' | 'remove',
  ): void {
    // add/remove the filter to all items in the dashboard who do NOT match the itemId
    for (const id in this.gridItems) {
      if (id === itemId) {
        const gridItem = this.gridItems[id]
        gridItem.chartFilters = gridItem.chartFilters || []
        if (operation !== 'append') {
          gridItem.chartFilters = gridItem.chartFilters.filter((f) => f.source !== itemId)
        }
        if (['add', 'append'].includes(operation)) {
          gridItem.chartFilters.push({ source: itemId, value: chartMap })
        }
      }
      if (id !== itemId) {
        const gridItem = this.gridItems[id]
        if (!gridItem.allowCrossFilter) {
          continue // Skip items that do not allow cross-filtering
        }
        gridItem.conceptFilters = gridItem.conceptFilters || []
        let shouldAppend = true
        if (operation !== 'append') {
          gridItem.conceptFilters = gridItem.conceptFilters.filter((f) => f.source !== itemId)
        } else if (operation === 'append') {
          // The issue is here - we need to properly compare objects
          // Check if there's an exact match with both source and value
          const hasExactMatch = gridItem.conceptFilters.some(
            (f) => f.source === itemId && JSON.stringify(f.value) === JSON.stringify(conceptMap),
          )
          if (hasExactMatch) {
            shouldAppend = false
            // If there's an exact match, remove it
            gridItem.conceptFilters = gridItem.conceptFilters.filter(
              (f) =>
                !(f.source === itemId && JSON.stringify(f.value) === JSON.stringify(conceptMap)),
            )
          } else {
          }
        }

        // Only push if we're adding or (appending and no exact match exists)
        if (operation === 'add' || (operation === 'append' && shouldAppend)) {
          gridItem.conceptFilters.push({ source: itemId, value: conceptMap })
        }

        this.updateItemFilters(id)
      }
    }
    this.updatedAt = new Date()
    this.changed = true
  }

  // Update an item's name
  updateItemName(itemId: string, name: string): void {
    if (this.gridItems[itemId]) {
      this.gridItems[itemId] = {
        ...this.gridItems[itemId],
        name,
      }
      this.updatedAt = new Date()
      this.changed = true
    }
  }

  updateItemChartConfig(itemId: string, config: ChartConfig): void {
    if (this.gridItems[itemId]) {
      this.gridItems[itemId] = {
        ...this.gridItems[itemId],
        chartConfig: config,
      }
      this.updatedAt = new Date()
      this.changed = true
    }
  }

  // Update layout
  updateLayout(newLayout: LayoutItem[]): void {
    this.layout = newLayout
    this.updatedAt = new Date()

    this.changed = true
  }

  // Update item dimensions
  updateItemDimensions(itemId: string, width: number, height: number): void {
    if (this.gridItems[itemId]) {
      // check if values have changed
      if (this.gridItems[itemId].width === width && this.gridItems[itemId].height === height) {
        return // No change needed
      }
      // Update width
      this.gridItems[itemId] = {
        ...this.gridItems[itemId],
        width,
        height,
      }
      this.updatedAt = new Date()
    }
  }

  // Remove an item
  removeItem(itemId: string): void {
    // Remove from layout
    this.layout = this.layout.filter((item) => item.i !== itemId)

    // Remove from grid items
    if (this.gridItems[itemId]) {
      delete this.gridItems[itemId]
    }

    this.updatedAt = new Date()
    this.changed = true
  }

  // Clear all items
  clearItems(): void {
    this.layout = []
    this.gridItems = {}
    this.nextId = 0
    this.updatedAt = new Date()
    this.changed = true
  }

  // Get a serializable object for storage
  serialize(): Dashboard {
    // Create a copy of gridItems without the results property
    const serializedGridItems: Record<string, GridItemData> = {}

    for (const [itemId, gridItem] of Object.entries(this.gridItems)) {
      // Destructure to separate results from other properties
      const { results, ...itemWithoutResults } = gridItem
      serializedGridItems[itemId] = itemWithoutResults
    }

    return {
      id: this.id,
      name: this.name,
      storage: this.storage,
      connection: this.connection,
      layout: this.layout,
      gridItems: serializedGridItems,
      nextId: this.nextId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      filter: this.filter,
      imports: this.imports,
      version: this.version,
      state: this.state,
      description: this.description,
    }
  }

  // Create a dashboard from stored data
  static fromSerialized(data: Dashboard): DashboardModel {
    // set all gridItems to have allowCrossFilter as true if not explicit false
    const gridItems: Record<string, GridItemData> = {}
    for (const [itemId, itemData] of Object.entries(data.gridItems)) {
      gridItems[itemId] = {
        ...itemData,
        allowCrossFilter: itemData.allowCrossFilter !== false, // Default to true if not explicitly false
      }
    }
    return new DashboardModel({
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      gridItems,
    })
  }
}
