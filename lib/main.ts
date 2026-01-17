export { default as DataTable } from './components/DataTable.vue'
export { default as Editor } from './components/editor/Editor.vue'
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

// Trilogy composables - simplified entry points
export { useTrilogyCore } from './composables/useTrilogyCore'
export type { TrilogyCoreOptions, TrilogyCoreReturn } from './composables/useTrilogyCore'
export { useTrilogyChat } from './composables/useTrilogyChat'
export type { TrilogyChatOptions } from './composables/useTrilogyChat'
