import './icons/registerMdiIcons'
import './embedTheme.css'

export { default as TrilogyEmbedProvider } from './components/TrilogyEmbedProvider.vue'
export { default as Dashboard } from './components/dashboard/Dashboard.vue'
export { default as DashboardChart } from './components/dashboard/DashboardChart.vue'
export { default as DashboardTable } from './components/dashboard/DashboardTable.vue'
export { default as DashboardFilter } from './components/dashboard/DashboardFilter.vue'
export { default as DashboardMarkdown } from './components/dashboard/DashboardMarkdown.vue'
export { default as DashboardDataSelector } from './components/dashboard/DashboardDataSelector.vue'
export { default as DataTable } from './components/DataTable.vue'
export { default as MarkdownRenderer } from './components/MarkdownRenderer.vue'
export { default as VegaLiteChart } from './components/VegaLiteChart.vue'
export { useTrilogyCore } from './composables/useTrilogyCore'
export { useTrilogyChat } from './composables/useTrilogyChat'

export {
  TRILOGY_EMBED_CONFIG_KEY,
  normalizeEmbedTheme,
  provideTrilogyEmbedConfig,
  resolveThemeMode,
  resolveThemeVariables,
  useResolvedThemeMode,
  useTrilogyEmbedConfig,
} from './embed/config'
export type {
  TrilogyEmbedConfig,
  TrilogyEmbedTheme,
  TrilogyEmbedThemeObject,
  TrilogyThemeMode,
} from './embed/config'
export type { TrilogyCoreOptions, TrilogyCoreReturn } from './composables/useTrilogyCore'
export type { TrilogyChatOptions } from './composables/useTrilogyChat'

export { DashboardQueryExecutor } from './dashboards/dashboardQueryExecutor'
export { DashboardModel, CELL_TYPES } from './dashboards/base'
export {
  applyCrossFilterOperationToGridItems,
  buildCrossFilterExpression,
  clearAllCrossFiltersFromGridItems,
  createCrossFilterController,
  filterAllowedDimensionFilters,
  removeCrossFilterFromItem,
  removeCrossFilterSourceFromGridItems,
  syncCrossFilterSqlForItem,
  useCrossFilterController,
} from './dashboards/crossFilters'
export type {
  Dashboard as DashboardDefinition,
  DashboardImport,
  DashboardState,
  GridItemData,
  GridItemDataResponse,
  LayoutItem,
  DimensionClick,
} from './dashboards/base'
export type {
  CrossFilterController,
  CrossFilterInputLike,
  CrossFilterItemLike,
  CrossFilterOperation,
  CrossFilterSelection,
  CrossFilterValueMap,
  CreateCrossFilterControllerOptions,
  SqlFilterLike,
} from './dashboards/crossFilters'

export { default as QueryExecutionService } from './stores/queryExecutionService'
export type {
  QueryInput,
  QueryUpdate,
  QueryResult,
  BatchQueryResult,
  ExecutionConnection,
  ExecutionConnectionProvider,
  DashboardExecutionService,
} from './stores/queryExecutionService'

export { Results, ColumnType } from './editors/results'
export type { ChartConfig, ResultColumn, Row, chartTypes } from './editors/results'
