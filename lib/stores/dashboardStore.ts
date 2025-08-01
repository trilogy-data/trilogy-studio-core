import { defineStore } from 'pinia'
import type { LayoutItem, CellType, DashboardImport } from '../dashboards/base'
import { CELL_TYPES, DashboardModel } from '../dashboards/base'
import { type PromptDashboard, parseDashboardSpec } from '../dashboards/prompts'
import type { LLMConnectionStoreType } from './llmStore'
import type QueryExecutionService from './queryExecutionService'
import type { QueryInput } from './queryExecutionService'
import type { ModelConceptInput } from '../llm'
import { completionToModelInput } from '../llm/utils'
import type { EditorStoreType } from './editorStore'
import type { Results } from '../editors/results'

interface ContentPlaceholder {
  type: 'markdown' | 'chart' | 'table'
  content: string
}

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

    unsavedDashboards: (state) => {
      return Object.values(state.dashboards).filter((dashboard) => dashboard.changed).length
    },
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
        state: 'editing',
      })

      this.dashboards[id] = dashboard
      return dashboard
    },

    cloneDashboard(id: string) {
      const existingDashboard = this.dashboards[id]
      if (!existingDashboard) {
        throw new Error(`Dashboard with ID "${id}" not found.`)
      }
      // while we don't have a match, add (copy) to the name

      let newId = `${existingDashboard.name} (copy)`
      let counter = 1
      while (Object.values(this.dashboards).some((d) => d.name === newId)) {
        newId = `${existingDashboard.name} (copy ${counter})`
        counter++
      }
      const newDashboard = new DashboardModel({
        id: newId,
        name: newId,
        connection: existingDashboard.connection,
        storage: existingDashboard.storage,
        state: 'editing',
      })
      //iterate over Record<string, GridItem>
      newDashboard.gridItems = Object.fromEntries(
        Object.entries(existingDashboard.gridItems).map(([key, item]) => [
          key,
          {
            ...item,
            chartFilters: [],
            conceptFilters: [],
            filters: [],
          },
        ]),
      )
      // Copy items from the existing dashboard
      // Copy layout from the existing dashboard
      newDashboard.layout = existingDashboard.layout.map((item) => ({
        ...item,
      }))
      // Copy imports from the existing dashboard
      newDashboard.imports = existingDashboard.imports.map((importItem) => ({
        ...importItem,
      }))
      // Copy filter from the existing dashboard
      newDashboard.filter = existingDashboard.filter
      // Copy description from the existing dashboard
      newDashboard.description = existingDashboard.description
      // Copy updatedAt from the existing dashboard
      newDashboard.updatedAt = new Date()
      newDashboard.nextId = existingDashboard.nextId
      // Add the new dashboard to the store
      this.addDashboard(newDashboard)
      // Set the new dashboard as active
      this.activeDashboardId = newId
      return newDashboard
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

    removeAllFilters(dashboardId: string) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].removeAllFilters()
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
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

    setDashboardState(id: string, state: 'editing' | 'published' | 'locked') {
      if (this.dashboards[id]) {
        this.dashboards[id].state = state
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

    updateDashboardImports(id: string, imports: DashboardImport[]) {
      console.log('Updating imports for dashboard:', id)
      console.log('New imports:', imports)

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

    toggleEditMode(dashboardId: string) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].state =
          this.dashboards[dashboardId].state === 'editing' ? 'published' : 'editing'
      }
    },

    // Add item to dashboard
    addItemToDashboard(
      dashboardId: string,
      type: CellType,
      x = 0,
      y = 0,
      w = 5,
      h: number | null = null,
      content: string | null = null,
      name: string | null = null,
    ): string {
      if (this.dashboards[dashboardId]) {
        return this.dashboards[dashboardId].addItem(type, x, y, w, h, content, name)
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

    updateItemCrossFilterEligibility(
      dashboardId: string,
      itemId: string,
      allowCrossFilter: boolean,
    ) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].updateItemCrossFilterEligibility(itemId, allowCrossFilter)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    updateItemResults(
      dashboardId: string,
      itemId: string,
      results: Results, // Assuming results can be of any type, adjust as needed
    ) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].updateItemResults(itemId, results)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    updateItemType(dashboardId: string, itemId: string, type: 'markdown' | 'chart' | 'table') {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].updateItemType(itemId, type)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId} not found`)
      }
    },

    updateItemCrossFilters(
      dashboardId: string,
      itemId: string,
      conceptMap: Record<string, string>,
      chartMap: Record<string, string>,
      operation: 'add' | 'append' | 'remove',
    ) {
      // add/remove the filter to all items in the dashboard who do not match the itemId
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].updateItemCrossFilters(itemId, conceptMap, chartMap, operation)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    removeItemCrossFilter(dashboardId: string, itemId: string, source: string) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].removeItemCrossFilter(itemId, source)
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    removeItemCrossFilterSource(dashboardId: string, itemId: string) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].removeItemCrossFilterSource(itemId)
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

    updateDashboardDescription(dashboardId: string, description: string) {
      if (this.dashboards[dashboardId]) {
        this.dashboards[dashboardId].description = description
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

    copyItemInDashboard(dashboardId: string, itemId: string) {
      if (this.dashboards[dashboardId]) {
        const newItemId = this.dashboards[dashboardId].copyItem(itemId)
        return newItemId
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
    async populateCompletion(
      dashboardId: string,
      queryExecutionService: QueryExecutionService,
      editorStore: EditorStoreType,
    ) {
      const dashboard = this.dashboards[dashboardId]
      if (dashboard) {
        let results = await queryExecutionService?.validateQuery(dashboard.connection, {
          text: 'select 1 as test;',
          editorType: 'trilogy',
          imports: dashboard.imports,
          extraContent: dashboard.imports.map((imp) => ({
            alias: imp.name,
            // legacy handling
            contents:
              editorStore.editors[imp.id]?.contents ||
              editorStore.editors[imp.name]?.contents ||
              '',
          })),
        })
        if (results) {
          console.log('Completion results:', results)
          return results.data.completion_items
        } else {
          throw new Error('No completion items found.')
        }
      } else {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
    },

    async populateAIConcepts(
      dashboardId: string,
      queryExecutionService: QueryExecutionService,
      editorStore: EditorStoreType,
    ): Promise<ModelConceptInput[]> {
      let completions = await this.populateCompletion(
        dashboardId,
        queryExecutionService,
        editorStore,
      )

      if (!completions) {
        throw new Error(`No completion items found for dashboard ID "${dashboardId}".`)
      }
      return completionToModelInput(completions)
    },

    async generatePromptSpec(
      prompt: string,
      llmStore: LLMConnectionStoreType,
      queryExecutionService: QueryExecutionService,
      editorStore: EditorStoreType,
    ) {
      let completion = await this.populateAIConcepts(
        this.activeDashboardId,
        queryExecutionService,
        editorStore,
      )
      let rawResponse = await llmStore.generateDashboardCompletion(
        prompt,
        parseDashboardSpec,
        completion,
        3,
      )
      if (!rawResponse) {
        throw new Error('No response from LLM')
      }
      return parseDashboardSpec(rawResponse)
    },

    async populateFromPromptSpec(
      dashboardId: string,
      promptLayout: PromptDashboard,
      llmStore: LLMConnectionStoreType,
      queryExecutionService: QueryExecutionService,
      editorStore: EditorStoreType,
    ) {
      let current = this.dashboards[dashboardId]
      if (!current) {
        throw new Error(`Dashboard with ID "${dashboardId}" not found.`)
      }
      current.name = promptLayout.name
      current.description = promptLayout.description
      let concepts = await this.populateAIConcepts(dashboardId, queryExecutionService, editorStore)
      if (!concepts) {
        throw new Error(`No completion items found for dashboard ID "${dashboardId}".`)
      }

      const validator = async (text: string): Promise<boolean> => {
        const queryInput: QueryInput = {
          // run an explain here, not the query
          text,
          editorType: 'trilogy',
          imports: current.imports,
          extraContent: current.imports.map((imp) => ({
            alias: imp.name,
            contents:
              editorStore.editors[imp.id]?.contents ||
              editorStore.editors[imp.name]?.contents ||
              '',
          })),
        }

        const onError = (error: any) => {
          throw error
        }

        let results = await queryExecutionService.executeQuery(
          current.connection,
          queryInput,
          // Starter callback (empty for now)
          () => {},
          // Progress callback
          () => {},
          // Failure callback
          onError,
          // Success callback
          () => {
            return true
          },
          true,
        )
        // wait on that promise
        await results.resultPromise
        return true
      }
      // first loop, add everything as markdown
      // TODO: fix typehints here
      let itemMap = new Map<string, ContentPlaceholder>()
      for (const item of promptLayout.layout) {
        let itemData = promptLayout.gridItems[item.id]
        let content = itemData.content
        let itemType = itemData.type.toLowerCase() as CellType
        // @ts-ignore
        if ([CELL_TYPES.CHART, CELL_TYPES.TABLE].includes(itemType)) {
          content = `Placeholder, prompt: ${content}`
        }
        let itemId = this.addItemToDashboard(
          dashboardId,
          'markdown',
          item.x,
          item.y,
          item.w,
          item.h,
          content,
          itemData.name,
        )
        itemMap.set(itemId, { type: itemType, content: content })
      }
      // second loop, add actual items
      // TODO: fix this loop
      for (const item of itemMap) {
        let key = item[0]
        let data = item[1]
        let content = data.content
        // @ts-ignore
        if ([CELL_TYPES.CHART, CELL_TYPES.TABLE].includes(data.type)) {
          let llmcontent = await llmStore.generateQueryCompletion(data.content, concepts, validator)
          content = llmcontent.content || 'No query could be generated'
        }

        await this.updateItemContent(dashboardId, key, content)
        await this.updateItemType(dashboardId, key, data.type)
      }
    },
  },
})

export type DashboardStoreType = ReturnType<typeof useDashboardStore>
export default useDashboardStore
