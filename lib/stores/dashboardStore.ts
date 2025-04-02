import { defineStore } from 'pinia'
import type { LayoutItem, CellType } from '../dashboards/base'
import { DashboardModel } from '../dashboards/base'
import type { Import } from './resolver'

export const useDashboardStore = defineStore('dashboards', {
  state: () => ({
    dashboards: {} as Record<string, DashboardModel>,
    activeDashboardId: '',
  }),

  getters: {
    dashboardList: (state) => Object.values(state.dashboards),

    activeDashboard: (state) =>
      state.activeDashboardId ? state.dashboards[state.activeDashboardId] : null,

    getConnectionDashboards: (state) => (connection: string) =>
      Object.values(state.dashboards).filter((dashboard) => dashboard.connection === connection),
  },

  actions: {
    // Create a new dashboard
    newDashboard(name: string, connection: string) {
      const id = name

      if (Object.values(this.dashboards).some((d) => d.name === name)) {
        throw new Error(`A dashboard with name ${name} already exists.`)
      }

      const dashboard = new DashboardModel({
        id,
        name,
        connection,
        storage: 'local',
      })

      this.dashboards[id] = dashboard
      return dashboard
    },

    // Add an existing dashboard
    addDashboard(dashboard: DashboardModel) {
      this.dashboards[dashboard.id] = dashboard
    },

    // Load dashboards from serialized data
    loadDashboards(serializedDashboards: Record<string, any>) {
      Object.entries(serializedDashboards).forEach(([id, data]) => {
        this.dashboards[id] = DashboardModel.fromSerialized(data)
      })
    },

    // Get dashboards by connection
    getConnectionDashboardsSync(connection: string) {
      return Object.values(this.dashboards).filter(
        (dashboard) => dashboard.connection === connection,
      )
    },

    // Set active dashboard
    setActiveDashboard(id: string) {
      if (this.dashboards[id]) {
        this.activeDashboardId = id
      } else {
        throw new Error(`Dashboard with ID "${id}" not found.`)
      }
    },

    // Update dashboard name
    updateDashboardName(id: string, newName: string) {
      if (this.dashboards[id]) {
        this.dashboards[id].name = newName
        this.dashboards[id].updatedAt = new Date()
      } else {
        throw new Error(`Dashboard with ID "${id}" not found.`)
      }
    },

    updateDashboardFilter(id: string, filter: string) {
      if (this.dashboards[id]) {
        this.dashboards[id].filter = filter
      } else {
        throw new Error(`Dashboard with ID "${id}" not found.`)
      }
    },

    updateDashboardImports(id: string, imports: Import[]) {
      if (this.dashboards[id]) {
        this.dashboards[id].imports = imports
      } else {
        throw new Error(`Dashboard with ID "${id}" not found.`)
      }
    },

    // Remove dashboard
    removeDashboard(id: string) {
      if (this.dashboards[id]) {
        delete this.dashboards[id]
        if (this.activeDashboardId === id) {
          this.activeDashboardId = ''
        }
      } else {
        throw new Error(`Dashboard with ID "${id}" not found.`)
      }
    },

    // Add item to dashboard
    addItemToDashboard(dashboardId: string, type: CellType, x = 0, y = 0) {
      if (this.dashboards[dashboardId]) {
        return this.dashboards[dashboardId].addItem(type, x, y)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    // Update item content
    updateItemContent(dashboardId: string, itemId: string, content: string) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].updateItemContent(itemId, content)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    updateItemCrossFilters(
      dashboardId: string,
      itemId: string,
      filter: string,
      operation: 'add' | 'remove',
    ) {
      // add/remove the filter to all items in the dashboard who do not match the itemId
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].updateItemCrossFilters(itemId, filter, operation)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    removeItemCrossFilter(
      dashboardId: string,
      itemId: string,
      source: string,
    ) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].removeItemCrossFilter(itemId, source)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },
    

    // Update item name
    updateItemName(dashboardId: string, itemId: string, name: string) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].updateItemName(itemId, name)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    updateItemChartConfig(dashboardId: string, itemId: string, config: any) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].updateItemChartConfig(itemId, config)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },
    // Update dashboard connection

    updateDashboardConnection(dashboardId: string, connection: string) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].connection = connection
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    // Update dashboard layout
    updateDashboardLayout(dashboardId: string, newLayout: LayoutItem[]) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].updateLayout(newLayout)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    // Update item dimensions
    updateItemDimensions(dashboardId: string, itemId: string, width: number, height: number) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].updateItemDimensions(itemId, width, height)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    // Remove item from dashboard
    removeItemFromDashboard(dashboardId: string, itemId: string) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].removeItem(itemId)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    // Clear all items from dashboard
    clearDashboardItems(dashboardId: string) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].clearItems()
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    // Get serializable dashboard data for storage
    serializeDashboards() {
      const serialized: Record<string, any> = {}

      Object.entries(this.dashboards).forEach(([id, dashboard]) => {
        if (dashboard.storage === 'local') {
          serialized[id] = dashboard.serialize()
        }
      })

      return serialized
    },
  },
})

export type DashboardStoreType = ReturnType<typeof useDashboardStore>
export default useDashboardStore
