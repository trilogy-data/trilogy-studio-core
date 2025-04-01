// Define types for dashboard layouts
import type { ChartConfig } from '../editors/results'
import type { Import } from '../stores/resolver'
export interface LayoutItem {
  x: number
  y: number
  w: number
  h: number
  i: string
  static: boolean
}

export interface GridItemData {
  type: string
  content: string
  name: string
  width?: number
  height?: number
  chartConfig?: ChartConfig
  connectionName?: string
  imports?: Import[]
  filters?: string[]
  onRefresh?: () => void
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
  imports: Import[]
}

// Cell types enum
export const CELL_TYPES = {
  CHART: 'chart',
  MARKDOWN: 'markdown',
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
  imports: Import[] = []

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
  }

  // Add a new item to the dashboard
  addItem(type: CellType, x = 0, y = 0): string {
    const itemId = this.nextId.toString()

    // Create grid item layout
    this.layout.push({
      x,
      y,
      w: 4,
      h: type === CELL_TYPES.MARKDOWN ? 3 : 10,
      i: itemId,
      static: false,
    })

    // Default content and name based on type
    const defaultName = type === CELL_TYPES.CHART ? `Chart ${itemId}` : `Note ${itemId}`
    const defaultContent =
      type === CELL_TYPES.CHART
        ? "SELECT unnest([1,2,3,4]) as value, 'example' as dim"
        : '# Markdown Cell\nEnter your markdown content here.'

    // Initialize with default content
    this.gridItems[itemId] = {
      type,
      content: defaultContent,
      name: defaultName,
      width: 0,
      height: 0,
    }

    this.nextId++
    this.updatedAt = new Date()

    return itemId
  }

  // Update an item's content
  updateItemContent(itemId: string, content: string): void {
    if (this.gridItems[itemId]) {
      this.gridItems[itemId] = {
        ...this.gridItems[itemId],
        content,
      }
      this.updatedAt = new Date()
    }
  }

  updateItemCrossFilters(itemId: string, filter: string, operation: 'add' | 'remove'): void {
    // add/remove the filter to all items in the dashboard who do NOTmatch the itemId
    for (const id in this.gridItems) {
      if (id !== itemId) {
        const gridItem = this.gridItems[id]
        if (operation === 'add') {
          gridItem.filters = gridItem.filters || []
          gridItem.filters.push(filter)
        } else {
          gridItem.filters = gridItem.filters?.filter((f) => f !== filter) || []
        }
      }
    }
  }

  // Update an item's name
  updateItemName(itemId: string, name: string): void {
    if (this.gridItems[itemId]) {
      this.gridItems[itemId] = {
        ...this.gridItems[itemId],
        name,
      }
      this.updatedAt = new Date()
    }
  }

  updateItemChartConfig(itemId: string, config: ChartConfig): void {
    if (this.gridItems[itemId]) {
      this.gridItems[itemId] = {
        ...this.gridItems[itemId],
        chartConfig: config,
      }
      this.updatedAt = new Date()
    }
  }

  // Update layout
  updateLayout(newLayout: LayoutItem[]): void {
    this.layout = newLayout
    this.updatedAt = new Date()
  }

  // Update item dimensions
  updateItemDimensions(itemId: string, width: number, height: number): void {
    if (this.gridItems[itemId]) {
      this.gridItems[itemId] = {
        ...this.gridItems[itemId],
        width,
        height,
      }
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
  }

  // Clear all items
  clearItems(): void {
    this.layout = []
    this.gridItems = {}
    this.nextId = 0
    this.updatedAt = new Date()
  }

  // Get a serializable object for storage
  serialize(): Dashboard {
    return {
      id: this.id,
      name: this.name,
      storage: this.storage,
      connection: this.connection,
      layout: this.layout,
      gridItems: this.gridItems,
      nextId: this.nextId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      filter: this.filter,
      imports: this.imports,
    }
  }

  // Create a dashboard from stored data
  static fromSerialized(data: Dashboard): DashboardModel {
    return new DashboardModel({
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    })
  }
}
