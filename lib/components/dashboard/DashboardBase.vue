// DashboardBase.vue - Shared logic for both mobile and desktop dashboards
<script lang="ts" setup>
import { ref, computed, onMounted, nextTick, onBeforeUnmount, inject, watch } from 'vue'
import { useDashboardStore } from '../../stores/dashboardStore'
import {
  type LayoutItem,
  type GridItemDataResponse,
  type CellType,
  CELL_TYPES,
  type DimensionClick,
  type MarkdownData,
} from '../../dashboards/base'
import type { CompletionItem } from '../../stores/resolver'
import type { DashboardImport } from '../../dashboards/base'
import QueryExecutionService from '../../stores/queryExecutionService'
import useScreenNavigation from '../../stores/useScreenNavigation'
import useEditorStore from '../../stores/editorStore'

// Props definition
const props = defineProps<{
  name: string
  connectionId?: string
  maxWidth?: number
  viewMode?: boolean
  isMobile?: boolean
}>()

// Emits for layout-specific functionality
const emit = defineEmits<{
  layoutUpdated: [layout: LayoutItem[]]
  dimensionsUpdate: [itemId: string]
  triggerResize: []
  fullScreen: [boolean]
}>()

// Initialize services and stores
const dashboardStore = useDashboardStore()
const editorStore = useEditorStore()
const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')
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
const dashboardMaxWidth = computed(() => props.maxWidth || '100vw')

const dashboard = computed(() => {
  const dashboard = Object.values(dashboardStore.dashboards).find((d) => d.id === props.name)

  // If dashboard doesn't exist and we have a connectionId, try to create it
  if (!dashboard && props.connectionId) {
    try {
      return dashboardStore.newDashboard(props.name, props.connectionId)
    } catch (error) {
      console.error('Failed to create dashboard:', error)
      return null
    }
  }

  return dashboard
})

const layout = computed(() => {
  if (!dashboard.value) return []
  return dashboard.value.layout
})

const sortedLayout = computed(() => {
  if (!dashboard.value) return []
  // Sort layout items by y coordinate for mobile vertical order
  return [...dashboard.value.layout].sort((a, b) => a.y - b.y)
})

const selectedConnection = computed(() => {
  if (!dashboard.value) return ''
  return dashboard.value.connection
})

const editMode = computed(() => {
  if (props.viewMode) return false
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

// Lifecycle hooks
watch(
  () => props.name,
  (newId) => {
    if (newId) {
      populateCompletion()
    }
  },
)

onMounted(() => {
  if (dashboard.value && dashboard.value.id) {
    dashboardStore.setActiveDashboard(dashboard.value.id)

    // Initialize the filter from the dashboard if it exists
    if (dashboard.value.filter) {
      filter.value = dashboard.value.filter
      filterInput.value = dashboard.value.filter
    }

    populateCompletion()
  }

  // Set up resize observer
  const resizeObserver = new ResizeObserver(() => {
    emit('triggerResize')
  })

  // Observe the appropriate container
  const containerSelector = props.isMobile ? '.mobile-container' : '.grid-container'
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

// Utility functions
const stripAllWhitespace = (str: string): string => {
  return str.replace(/\s+/g, '')
}

// Filter management
async function handleFilterClear() {
  if (dashboard.value && dashboard.value.id) {
    filter.value = ''
    filterInput.value = ''
    filterError.value = ''
    dashboardStore.removeAllFilters(dashboard.value.id)
  }
}

async function handleFilterChange(newFilter: string) {
  if (!newFilter || stripAllWhitespace(newFilter) === '') {
    filterError.value = ''
    if (dashboard.value && dashboard.value.id) {
      dashboardStore.updateDashboardFilter(dashboard.value.id, newFilter)
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
          dashboardStore.updateDashboardFilter(dashboard.value.id, newFilter)
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
      () => {},
      () => {},
      () => {},
      () => {},
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
  if (dashboard.value) {
    if (dashboard.value && dashboard.value.state !== 'editing') {
      emit('fullScreen', true)
    }
  }
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
const toggleEditMode = () => {
  if (!dashboard.value) return
  dashboardStore.toggleEditMode(dashboard.value.id)

  // Trigger resize on mode toggle to ensure charts update
  nextTick(() => {
    emit('triggerResize')
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
    emit('dimensionsUpdate', itemId)
  })
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
    }
  }
}

function saveContent(content: string): void {
  if (!dashboard.value || !dashboard.value.id || !editingItem.value) return

  const itemId = editingItem.value.i
  console.log('Saving content for item:', itemId, content)
  dashboardStore.updateItemContent(dashboard.value.id, itemId, content)
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

  return {
    type: item.type,
    // check if it's MarkdownData, and if so, extract markdown
    //
    content: isMarkdownData(item.content) ? item.content.markdown : item.content || '',
    structured_content: isMarkdownData(item.content)
      ? item.content
      : { markdown: '', query: item.content || '' },
    name: item.name,
    allowCrossFilter: item.allowCrossFilter !== false, // Default to true if not explicitly false
    width: item.width || 0,
    height: item.height || 0,
    imports: dashboard.value.imports,
    chartConfig: item.chartConfig,
    filters: finalFilters,
    connectionName: dashboard.value.connection,
    chartFilters: item.chartFilters || [],
    conceptFilters: item.conceptFilters || [],
    parameters: item.parameters || {},
    onRefresh: handleRefresh,
    rootContent: rootContent.value,
    results: item.results || null,
  }
}

function setItemData(itemId: string, dashboardId: string, data: any): void {
  if (!dashboard.value || !dashboard.value.id) return

  if (!dashboardId || dashboard.value.id !== dashboardId) {
    console.warn('Dashboard ID mismatch. Cannot set item data.')
    return
  }

  // Update specific properties through store actions
  if (data.name) {
    dashboardStore.updateItemName(dashboard.value.id, itemId, data.name)
  }

  if (data.chartConfig) {
    dashboardStore.updateItemChartConfig(dashboard.value.id, itemId, data.chartConfig)
  }

  if (data.content) {
    dashboardStore.updateItemContent(dashboard.value.id, itemId, data.content)
  }

  if (data.width && data.height) {
    dashboardStore.updateItemDimensions(dashboard.value.id, itemId, data.width, data.height)
  }
  if (data.results) {
    dashboardStore.updateItemResults(dashboard.value.id, itemId, data.results)
  }

  if (data.allowCrossFilter !== undefined) {
    dashboardStore.updateItemCrossFilterEligibility(
      dashboard.value.id,
      itemId,
      data.allowCrossFilter,
    )
  }
}

// Connection management
function onConnectionChange(event: Event): void {
  const target = event.target as HTMLSelectElement
  const connectionId = target.value

  if (dashboard.value && dashboard.value.id) {
    dashboardStore.updateDashboardConnection(dashboard.value.id, connectionId)
  }
}

// Refresh management
function handleRefresh(itemId?: string): void {
  if (!dashboard.value) return

  if (itemId) {
    const refreshEvent = new CustomEvent('chart-refresh', { detail: { itemId } })
    window.dispatchEvent(refreshEvent)
    emit('dimensionsUpdate', itemId)
    return
  }

  const refreshEvent = new CustomEvent('dashboard-refresh')
  window.dispatchEvent(refreshEvent)

  emit('triggerResize')
}

// Filter management
function setCrossFilter(info: DimensionClick): void {
  if (!dashboard.value || !dashboard.value.id) return

  let globalFields = globalCompletion.value.map((f) => f.label)
  const finalFilters = Object.entries(info.filters).reduce(
    (acc, [key, value]) => {
      let lookup = key
      if (globalFields.includes(lookup)) {
        acc[key] = value
      }
      return acc
    },
    {} as Record<string, string>,
  )

  if (!finalFilters || Object.keys(finalFilters).length === 0) return

  dashboardStore.updateItemCrossFilters(
    dashboard.value.id,
    info.source,
    finalFilters,
    info.chart,
    info.append ? 'append' : 'add',
  )
}

function removeFilter(itemId: string, filterSource: string): void {
  if (!dashboard.value || !dashboard.value.id) return
  dashboardStore.removeItemCrossFilter(dashboard.value.id, itemId, filterSource)
}

function unSelect(itemId: string): void {
  if (!dashboard.value || !dashboard.value.id) return
  dashboardStore.removeItemCrossFilterSource(dashboard.value.id, itemId)
}

function dashboardCreated(id: string): void {
  console.log('Dashboard created event received:', id)
  setActiveDashboard(id)
}

// Expose all necessary data and methods
defineExpose({
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
  toggleEditMode,
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
  getItemData,
  setItemData,
  handleRefresh,
  setCrossFilter,
  removeFilter,
  unSelect,
  dashboardCreated,
})
</script>

<template>
  <!-- This component only provides logic, no template -->
  <!-- Layout-specific components will use this via composition -->
</template>
