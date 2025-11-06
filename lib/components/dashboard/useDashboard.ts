import {
  ref,
  type ComputedRef,
  computed,
  onMounted,
  nextTick,
  onBeforeUnmount,
  inject,
  watch,
} from 'vue'
import { useDashboardStore, stripAllWhitespace } from '../../stores/dashboardStore'
import {
  type LayoutItem,
  type GridItemDataResponse,
  type CellType,
  CELL_TYPES,
  type DimensionClick,
  type MarkdownData,
} from '../../dashboards/base'
import type { CompletionItem } from '../../stores/resolver'
import type { DashboardImport, DashboardState } from '../../dashboards/base'
import QueryExecutionService from '../../stores/queryExecutionService'
import useScreenNavigation from '../../stores/useScreenNavigation'
import useEditorStore from '../../stores/editorStore'
import { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { DashboardModel } from '../../dashboards/base'

export interface UseDashboardOptions {
  connectionId?: string
  maxWidth?: number
  viewMode?: boolean
  isMobile?: boolean
}

export interface UseDashboardEmits {
  layoutUpdated: (layout: LayoutItem[]) => void
  dimensionsUpdate: (itemId: string) => void
  triggerResize: () => void
  fullScreen: (enabled: boolean) => void
}

export function useDashboard(
  dashboard: ComputedRef<DashboardModel | null | undefined>,
  options: UseDashboardOptions,
  emit: UseDashboardEmits,
) {
  if (!dashboard.value) {
    throw new Error('Dashboard computed reference is required')
  }
  // Initialize services and stores
  const dashboardStore = useDashboardStore()
  const editorStore = useEditorStore()
  const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')
  const connectionStore = inject<ConnectionStoreType>('connectionStore')
  const { setActiveDashboard } = useScreenNavigation()

  if (!queryExecutionService || !editorStore) {
    throw new Error('QueryExecutionService not provided')
  }

  // Reactive state
  const filter = ref('')
  const filterInput = ref('')
  const filterError = ref('')
  const debounceTimeout = ref<number | null>(null)
  const editingItem = ref<LayoutItem | null>(null)
  const showQueryEditor = ref(false)
  const showMarkdownEditor = ref(false)
  const showAddItemModal = ref(false)
  const globalCompletion = ref<CompletionItem[]>([])

  // Computed properties
  const dashboardMaxWidth = computed(() => options.maxWidth || '100vw')

  const layout = computed(() => {
    if (!dashboard.value) return []
    return dashboard.value.layout
  })

  const sortedLayout = computed(() => {
    if (!dashboard.value) return []
    // Sort layout items by y coordinate for mobile vertical order
    return [...dashboard.value.layout].sort((a, b) => (a.y + a.y + a.h) / 2 - (b.y + b.y + b.h) / 2)
  })

  const selectedConnection = computed(() => {
    if (!dashboard.value) return ''
    return dashboard.value.connection
  })

  const editMode = computed(() => {
    if (options.viewMode) return false
    return dashboard.value ? dashboard.value.state === 'editing' : false
  })

  const rootContent = computed(() => {
    if (!dashboard.value) return []
    return dashboard.value.imports.map((imp) => ({
      alias: imp.name,
      // legacy handling
      contents:
        editorStore.editors[imp.id]?.contents || editorStore.editors[imp.name]?.contents || '',
    }))
  })

  // Centralized dashboard initialization function
  function initializeDashboard(dashboardData: DashboardModel) {
    if (!dashboardData?.id) return
    // Handle fullscreen mode
    if (dashboardData.state === 'fullscreen') {
      emit.fullScreen(true)
    }
    // Set the active dashboard
    dashboardStore.setActiveDashboard(dashboardData.id)

    // Reset filter state
    filterError.value = ''
    filter.value = ''
    filterInput.value = ''
    globalCompletion.value = []

    // Initialize filter from dashboard if it exists
    if (dashboardData.filter) {
      filter.value = dashboardData.filter
      filterInput.value = dashboardData.filter
    }

    // Run any unrun items in the dashboard
    const executor = getDashboardQueryExecutor(dashboardData.id)
    const unRun = Object.keys(dashboardData.gridItems).filter(
      (itemId) => !dashboardData.gridItems[itemId].results,
    )
    executor?.runBatch(unRun)

    // Populate completion for dashboard
    populateCompletion()
  }

  // Lifecycle hooks
  watch(
    () => dashboard.value?.id,
    (newId, oldId) => {
      // Only initialize if the dashboard ID actually changed
      if (newId && newId !== oldId && dashboard.value) {
        initializeDashboard(dashboard.value)
      }
    },
  )

  onMounted(() => {
    if (dashboard.value) {
      initializeDashboard(dashboard.value)
    }

    // Set up resize observer
    const resizeObserver = new ResizeObserver(() => {
      emit.triggerResize()
    })

    // Observe the appropriate container
    const containerSelector = options.isMobile ? '.mobile-container' : '.grid-container'
    const container = document.querySelector(containerSelector)
    if (container) {
      resizeObserver.observe(container)
    }
  })

  onBeforeUnmount(() => {
    if (debounceTimeout.value !== null) {
      clearTimeout(debounceTimeout.value)
    }
  })

  // Filter management
  async function handleFilterClear() {
    if (dashboard.value && dashboard.value.id) {
      filter.value = ''
      filterInput.value = ''
      filterError.value = ''
      let updated = dashboardStore.removeAllFilters(dashboard.value.id)
      await dashboardStore.getQueryExecutor(dashboard.value.id)?.runBatch(updated)
    }
  }

  async function handleFilterChange(newFilter: string) {
    if (!newFilter || stripAllWhitespace(newFilter) === '') {
      filterError.value = ''
      if (dashboard.value && dashboard.value.id) {
        let updated = dashboardStore.updateDashboardFilter(
          dashboard.value.id,
          stripAllWhitespace(newFilter),
        )
        await dashboardStore.getQueryExecutor(dashboard.value.id)?.runBatch(updated)
      }
      return
    }

    if (dashboard.value && dashboard.value.id) {
      filter.value = newFilter
      await queryExecutionService
        ?.generateQuery(dashboard.value.connection, {
          text: 'select 1 as test;',
          editorType: 'trilogy',
          extraFilters: [newFilter],
          imports: dashboard.value.imports,
          extraContent: rootContent.value,
        })
        .then(() => {
          filterError.value = ''
          if (dashboard.value && dashboard.value.id) {
            let updated = dashboardStore.updateDashboardFilter(dashboard.value.id, newFilter)
            dashboardStore.getQueryExecutor(dashboard.value.id)?.runBatch(updated)
          }
        })
        .catch((error) => {
          filterError.value = error.message
          return false
        })
    }
  }

  const validateFilter = async (filter: string) => {
    // Strip a leading WHERE off the filter
    let filterWithoutWhere = filter.replace(/^\s*where\s+/i, '')

    if (dashboard.value && dashboard.value.id) {
      let promises = await queryExecutionService?.executeQuery(
        dashboard.value.connection,
        {
          text: 'select 1 as test;',
          editorType: 'trilogy',
          imports: dashboard.value.imports,
          extraFilters: [filterWithoutWhere],
          extraContent: rootContent.value,
        },
        () => { },
        () => { },
        () => { },
        () => { },
        true,
      )

      if (!promises) {
        throw new Error('No promises returned from query execution service')
      }

      let resultPromise = await promises.resultPromise
      if (!resultPromise.success) {
        throw new Error(
          `Validation of "select 1 as test ${filterWithoutWhere}" resulted in ${resultPromise.error}`,
        )
      }
    } else {
      throw new Error('Dashboard not found')
    }
  }

  async function populateCompletion() {
    if (dashboard.value && dashboard.value.id && queryExecutionService) {
      let completion = await dashboardStore.populateCompletion(
        dashboard.value.id,
        queryExecutionService,
        editorStore,
      )
      if (completion) {
        globalCompletion.value = completion
      }
      filterError.value = ''
    }
  }

  async function handleImportChange(newImports: DashboardImport[]) {
    if (dashboard.value && dashboard.value.id) {
      dashboardStore.updateDashboardImports(dashboard.value.id, newImports)
      await populateCompletion()
    }
  }

  // Edit mode management
  const toggleMode = (state: DashboardState) => {
    if (!dashboard.value) return
    dashboardStore.setState(dashboard.value.id, state)

    // Trigger resize on mode toggle to ensure charts update
    nextTick(() => {
      emit.triggerResize()
    })
  }

  // Layout management
  const onLayoutUpdated = (newLayout: any) => {
    if (dashboard.value && dashboard.value.id) {
      dashboardStore.updateDashboardLayout(dashboard.value.id, newLayout as LayoutItem[])
    }
  }

  // Item management
  function openAddItemModal(): void {
    showAddItemModal.value = true
  }

  function addItem(type: CellType = CELL_TYPES.CHART): void {
    if (!dashboard.value || !dashboard.value.id) return

    const itemId = dashboardStore.addItemToDashboard(dashboard.value.id, type)
    showAddItemModal.value = false

    // Update dimensions after add
    nextTick(() => {
      emit.dimensionsUpdate(itemId)
    })
  }

  function updateTitle(newTitle: string): void {
    if (!dashboard.value || !dashboard.value.id) return
    dashboardStore.updateDashboardTitle(dashboard.value.id, newTitle)
  }

  function clearItems(): void {
    if (!dashboard.value || !dashboard.value.id) return
    dashboardStore.clearDashboardItems(dashboard.value.id)
  }

  function removeItem(itemId: string): void {
    if (!dashboard.value || !dashboard.value.id) return
    dashboardStore.removeItemFromDashboard(dashboard.value.id, itemId)
  }

  function copyItem(itemId: string): void {
    if (!dashboard.value || !dashboard.value.id) return
    dashboardStore.copyItemInDashboard(dashboard.value.id, itemId)
  }

  function closeAddModal(): void {
    showAddItemModal.value = false
  }

  // Editor management
  function openEditor(item: LayoutItem): void {
    editingItem.value = item

    if (!dashboard.value || !dashboard.value.id) return

    const dashboardItems = dashboard.value.gridItems
    const itemData = dashboardItems[item.i]

    if (itemData) {
      if (itemData.type === CELL_TYPES.CHART) {
        showQueryEditor.value = true
      } else if (itemData.type === CELL_TYPES.MARKDOWN) {
        showMarkdownEditor.value = true
      } else if (itemData.type === CELL_TYPES.TABLE) {
        showQueryEditor.value = true
      } else if (itemData.type === CELL_TYPES.FILTER) {
        showQueryEditor.value = true
      }
    }
  }

  function saveContent(content: string): void {
    if (!dashboard.value || !dashboard.value.id || !editingItem.value) return
    const itemId = editingItem.value.i
    setItemData(itemId, dashboard.value.id, { content })
    closeEditors()
  }

  function closeEditors(): void {
    showQueryEditor.value = false
    showMarkdownEditor.value = false
    editingItem.value = null
  }

  // Data management
  function getItemData(itemId: string, dashboardId: string): GridItemDataResponse {
    if (dashboardId && dashboard.value && dashboard.value.id !== dashboardId) {
      return {
        type: CELL_TYPES.CHART,
        content: '',
        structured_content: { markdown: '', query: '' },
        name: `Item ${itemId}`,
        allowCrossFilter: true,
        width: 0,
        height: 0,
        imports: [],
        filters: [],
        rootContent: [],
        hasDrilldown: false,
      }
    }

    if (!dashboard.value) {
      return {
        type: CELL_TYPES.CHART,
        content: '',
        structured_content: { markdown: '', query: '' },
        name: `Item ${itemId}`,
        allowCrossFilter: true,
        width: 0,
        height: 0,
        imports: [],
        filters: [],
        rootContent: [],
        hasDrilldown: false,
      }
    }

    const item = dashboard.value.gridItems[itemId]

    if (!item) {
      return {
        type: CELL_TYPES.CHART,
        content: '',
        structured_content: { markdown: '', query: '' },
        name: `Item ${itemId}`,
        allowCrossFilter: true,
        width: 0,
        height: 0,
        imports: dashboard.value.imports,
        filters: [],
        rootContent: [],
        connectionName: dashboard.value.connection || '',
        hasDrilldown: false,
      }
    }

    const itemFilters = item.filters || []
    let finalFilters = itemFilters

    if (dashboard.value.filter) {
      const hasGlobalFilter = itemFilters.some(
        (f) => f.source === 'global' && f.value === dashboard.value?.filter,
      )

      if (!hasGlobalFilter) {
        finalFilters = [{ value: dashboard.value.filter, source: 'global' }, ...itemFilters]
      }
    }

    function isMarkdownData(obj: any): obj is MarkdownData {
      return (
        obj &&
        typeof obj === 'object' &&
        typeof obj.markdown === 'string' &&
        typeof obj.query === 'string'
      )
    }
    let hasDrilldown = false
    let content = isMarkdownData(item.content)
      ? item.content
      : {
        markdown: item.type === 'markdown' ? item.content : '',
        query: item.type !== 'markdown' ? item.content : '',
      }
    if (item.drilldown) {
      hasDrilldown = true
      content = isMarkdownData(item.drilldown)
        ? item.drilldown
        : {
          markdown: item.type === 'markdown' ? item.drilldown : '',
          query: item.type !== 'markdown' ? item.drilldown : '',
        }
    }
    let config = item.chartConfig
    if (hasDrilldown) {
      config = item.drilldownChartConfig || undefined
    }
    return {
      type: item.type,
      // check if it's MarkdownData, and if so, extract markdown
      //
      content: isMarkdownData(item.content) ? item.content.markdown : item.content || '',
      // display the drilldown of set
      structured_content: content,
      name: item.name,
      allowCrossFilter: item.allowCrossFilter !== false, // Default to true if not explicitly false
      width: item.width || 0,
      height: item.height || 0,
      chartConfig: config,
      filters: finalFilters,
      chartFilters: item.chartFilters || [],
      conceptFilters: item.conceptFilters || [],
      parameters: item.parameters || {},
      onRefresh: handleRefresh,
      rootContent: rootContent.value,
      results: item.results || null,
      connectionName: dashboard.value.connection || '',
      imports: dashboard.value.imports,
      error: item.error || '',
      loading: item.loading || false,
      loadStartTime: item.loadStartTime || null, // Include load start time if available
      hasDrilldown,
    }
  }

  function setItemData(itemId: string, dashboardId: string, data: any): void {
    if (!dashboard.value || !dashboard.value.id) return
    if (!dashboardId || dashboard.value.id !== dashboardId) {
      console.warn(
        'Dashboard ID mismatch. Cannot set item data. Given:',
        dashboardId,
        'Expected:',
        dashboard.value.id,
      )
      return
    }

    // Aggregate all updates into a batch
    const updates: Parameters<typeof dashboardStore.updateMultipleItemProperties>[2] = {}

    // Collect all the updates
    if (data.name) {
      updates.name = data.name
    }
    if (data.chartConfig) {
      updates.chartConfig = data.chartConfig
    }
    if (data.content) {
      updates.content = data.content
    }
    if (data.dimensions) {
      updates.layoutDimensions = {
        w: data.dimensions.width,
        h: data.dimensions.height,
      }
    }
    if (data.width && data.height) {
      updates.width = data.width
      updates.height = data.height
    }
    if (data.loading !== undefined) {
      updates.loading = data.loading
    }
    if (data.results !== undefined) {
      updates.results = data.results
    }
    if (data.error !== undefined) {
      updates.error = data.error
    }
    if (data.drilldown !== undefined) {
      updates.drilldown = data.drilldown
    }
    if (data.drilldownChartConfig !== undefined) {
      updates.drilldownChartConfig = data.drilldownChartConfig
    }
    if (data.allowCrossFilter !== undefined) {
      updates.allowCrossFilter = data.allowCrossFilter
    }

    // Apply all updates in a single batch transaction
    if (Object.keys(updates).length > 0) {
      dashboardStore.updateMultipleItemProperties(dashboard.value.id, itemId, updates)
    }

    // Handle side effects after the batch update
    if (data.content) {
      let executor = getDashboardQueryExecutor(dashboard.value.id)
      executor?.runSingle(itemId)
    }
  }

  function getDashboardQueryExecutor(dashboardId: string): DashboardQueryExecutor {
    if (!dashboard.value || !dashboard.value.id)
      throw new Error('Dashboard not found or not initialized')
    if (!queryExecutionService) throw new Error('Query execution service not found')
    if (!connectionStore) throw new Error('Connection store not found')
    let dashboardData = dashboardStore.dashboards[dashboardId]
    const executor = dashboardStore.getOrCreateQueryExecutor(dashboardId, {
      queryExecutionService,
      connectionStore,
      editorStore,
      connectionName: dashboardData.connection,
      dashboardId: dashboardId,
      getDashboardData: (id: string) => dashboardStore.dashboards[id],
      getItemData,
      setItemData,
    })
    if (!executor) {
      console.warn('No query executor found for dashboard:', dashboard.value.id)
    }
    return executor
  }

  // Connection management
  function onConnectionChange(event: Event): void {
    const target = event.target as HTMLSelectElement
    const connectionId = target.value

    if (dashboard.value && dashboard.value.id) {
      dashboardStore.updateDashboardConnection(dashboard.value.id, connectionId)
      dashboardStore.getQueryExecutor(dashboard.value.id)?.setConnection(connectionId)
    }
  }

  // Refresh management
  function handleRefresh(itemId?: string): void {
    if (!dashboard.value) return

    if (itemId) {
      dashboardStore.getQueryExecutor(dashboard.value.id)?.runSingle(itemId)
      emit.dimensionsUpdate(itemId)
      return
    }

    // refresh them all
    dashboardStore
      .getQueryExecutor(dashboard.value.id)
      ?.runBatch(Object.keys(dashboard.value.gridItems))
  }

  // Filter management
  function setCrossFilter(info: DimensionClick): void {
    if (!dashboard.value || !dashboard.value.id) return

    let globalFields = globalCompletion.value.map((f) => f.label)
    const finalFilters = Object.entries(info.filters).reduce(
      (acc, [key, value]) => {
        let lookup = key
        let altLookup = null
        if (lookup.startsWith('local.')) {
          altLookup = lookup.replace('local.', '')
        }
        if (globalFields.includes(lookup) || (altLookup && globalFields.includes(altLookup))) {
          acc[key] = value
        }
        return acc
      },
      {} as Record<string, string>,
    )

    if (!finalFilters || Object.keys(finalFilters).length === 0) {
      console.log('No valid filters to apply from cross-filter event, given ', info.filters)
      return
    }

    let updated = dashboardStore.updateItemCrossFilters(
      dashboard.value.id,
      info.source,
      finalFilters,
      info.chart,
      info.append ? 'append' : 'add',
    )
    dashboardStore.getQueryExecutor(dashboard.value.id)?.runBatch(updated)
  }

  function removeFilter(itemId: string, filterSource: string): void {
    if (!dashboard.value || !dashboard.value.id) return
    dashboardStore.removeItemCrossFilter(dashboard.value.id, itemId, filterSource)
    dashboardStore.getQueryExecutor(dashboard.value.id)?.runSingle(itemId)
  }

  function unSelect(itemId: string): void {
    if (!dashboard.value || !dashboard.value.id) return
    let updated = dashboardStore.removeItemCrossFilterSource(dashboard.value.id, itemId)
    dashboardStore.getQueryExecutor(dashboard.value.id)?.runBatch(updated)
  }

  function dashboardCreated(id: string): void {
    setActiveDashboard(id)
  }

  // Return all reactive state and methods
  return {
    // State
    dashboard,
    layout,
    sortedLayout,
    editMode,
    selectedConnection,
    filter,
    filterError,
    globalCompletion,
    showAddItemModal,
    showQueryEditor,
    showMarkdownEditor,
    editingItem,
    dashboardMaxWidth,
    rootContent,

    // Methods
    handleFilterChange,
    handleFilterClear,
    handleImportChange,
    validateFilter,
    onConnectionChange,
    toggleMode,
    onLayoutUpdated,
    openAddItemModal,
    addItem,
    clearItems,
    removeItem,
    copyItem,
    closeAddModal,
    openEditor,
    saveContent,
    closeEditors,
    getDashboardQueryExecutor,
    getItemData,
    setItemData,
    handleRefresh,
    setCrossFilter,
    removeFilter,
    unSelect,
    dashboardCreated,
    updateTitle,
  }
}
