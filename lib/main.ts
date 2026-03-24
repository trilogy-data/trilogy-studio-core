export { default as DataTable } from './components/DataTable.vue'
export { default as MarkdownRenderer } from './components/MarkdownRenderer.vue'
export { default as Editor } from './components/editor/Editor.vue'
export { default as Dashboard } from './components/dashboard/Dashboard.vue'
export { default as DashboardChart } from './components/dashboard/DashboardChart.vue'
export { default as SidebarLayout } from './components/layout/SidebarLayout.vue'
export { default as VerticalSplitLayout } from './components/layout/VerticalSplitLayout.vue'
export { default as EditorModel } from './editors/editor'
export { default as EditorList } from './components/sidebar/EditorList.vue'
export { default as ResponsiveIDE } from './views/ResponsiveIDE.vue'
export { default as IDE } from './views/IDE.vue'
export { default as MobileIDE } from './views/MobileIDE.vue'
export { default as Manager } from './stores/Manager.vue'

// LLM Chat Components
export { LLMChat, LLMChatSplitView, ChatArtifact } from './components/llm'
export type { ChatArtifactType, ChatMessage } from './components/llm'

// LLM Store
export { default as useLLMConnectionStore } from './stores/llmStore'
export type { LLMConnectionStoreType } from './stores/llmStore'

// Settings Store
export { default as useUserSettingsStore } from './stores/userSettingsStore'
export type { UserSettingsStoreType } from './stores/userSettingsStore'

// Chat composables
export { useChatWithTools } from './composables/useChatWithTools'
export type {
  UseChatWithToolsOptions,
  UseChatWithToolsReturn,
} from './composables/useChatWithTools'

// LLM prompt builders
export {
  buildCustomTrilogyPrompt,
  buildChatAgentSystemPrompt,
  CHAT_TOOLS,
  RETURN_TO_USER_TOOL,
} from './llm/chatAgentPrompt'
export type { TrilogyPromptContext, ChatAgentPromptOptions } from './llm/chatAgentPrompt'

// Provider UI constants — import these instead of maintaining your own copy
export { PROVIDERS, PROVIDER_LABELS, KEY_PLACEHOLDERS } from './llm/consts'
export type { ProviderValue } from './llm/consts'

// Tool loop core — for embedding agentic loops in external apps
export { runToolLoop } from './llm/toolLoopCore'
export type {
  LLMAdapter,
  MessagePersistence,
  ToolExecutorFactory,
  ExecutionStateUpdater,
  ToolLoopConfig,
  ToolLoopResult,
} from './llm/toolLoopCore'

// Trilogy composables - simplified entry points
export { useTrilogyCore } from './composables/useTrilogyCore'
export type { TrilogyCoreOptions, TrilogyCoreReturn } from './composables/useTrilogyCore'
export { useTrilogyChat } from './composables/useTrilogyChat'
export type { TrilogyChatOptions } from './composables/useTrilogyChat'

// Dashboard primitives for embedded usage
export { DashboardQueryExecutor } from './dashboards/dashboardQueryExecutor'
export { DashboardModel, CELL_TYPES } from './dashboards/base'
export type {
  Dashboard as DashboardDefinition,
  DashboardImport,
  DashboardState,
  GridItemData,
  GridItemDataResponse,
  LayoutItem,
  DimensionClick,
} from './dashboards/base'

// Query execution primitives for dependency injection
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

// Results primitives for external chart configuration
export { Results, ColumnType } from './editors/results'
export type { ChartConfig, ResultColumn, Row, chartTypes } from './editors/results'
