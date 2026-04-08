<script lang="ts" setup>
import { ref, computed, inject } from 'vue'
import LLMChat from '../llm/LLMChat.vue'
import { useChatWithTools } from '../../composables/useChatWithTools'
import { DASHBOARD_TOOLS } from '../../llm/dashboardAgentTools'
import { buildDashboardAgentSystemPrompt } from '../../llm/dashboardAgentPrompt'
import { DashboardToolExecutor, type DashboardToolExecutorDeps } from '../../llm/dashboardToolExecutor'
import type { DashboardModel } from '../../dashboards/base'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { EditorStoreType } from '../../stores/editorStore'
import type QueryExecutionService from '../../stores/queryExecutionService'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import type { ChatImport, ChatMessage } from '../../chats/chat'

const props = defineProps<{
  dashboard: DashboardModel
  getDashboardQueryExecutor: (dashboardId: string) => DashboardQueryExecutor
  refreshItem: (itemId: string) => void
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// Inject stores
const dashboardStore = inject<DashboardStoreType>('dashboardStore') as DashboardStoreType
const llmConnectionStore = inject<LLMConnectionStoreType>('llmConnectionStore') as LLMConnectionStoreType
const connectionStore = inject<ConnectionStoreType>('connectionStore') as ConnectionStoreType
const editorStore = inject<EditorStoreType>('editorStore') as EditorStoreType
const queryExecutionService = inject<QueryExecutionService>('queryExecutionService') as QueryExecutionService

// Local state for dashboard chat imports
const dashboardChatImports = ref<ChatImport[]>([])

// Create the dashboard tool executor
const toolExecutor = computed(() => {
  const deps: DashboardToolExecutorDeps = {
    dashboardStore,
    connectionStore,
    editorStore,
    queryExecutionService,
    dashboardId: props.dashboard.id,
    getActiveImports: () => dashboardChatImports.value,
    setActiveImports: (imports: ChatImport[]) => {
      dashboardChatImports.value = imports
    },
    getDashboardQueryExecutor: () => props.getDashboardQueryExecutor(props.dashboard.id) || null,
    refreshItem: props.refreshItem,
  }
  return new DashboardToolExecutor(deps)
})

// Use the chat composable in standalone mode with custom tools
const {
  isChatLoading,
  activeToolName,
  activeChatMessages,
  handleChatMessageWithTools,
} = useChatWithTools({
  llmConnectionStore,
  connectionStore,
  queryExecutionService,
  editorStore,
  dataConnectionName: props.dashboard.connection,
  initialTitle: `Dashboard: ${props.dashboard.name}`,
  customTools: DASHBOARD_TOOLS,
  onCustomToolCall: async (toolName: string, toolInput: Record<string, unknown>) => {
    const result = await toolExecutor.value.executeToolCall(
      toolName,
      toolInput as Record<string, any>,
    )
    if (result.success) {
      return result.message || 'Success'
    }
    throw new Error(result.error || 'Tool execution failed')
  },
})

// Build system prompt dynamically based on current dashboard state
const systemPrompt = computed(() => {
  const availableConnections = connectionStore ? Object.keys(connectionStore.connections) : []
  const isDataConnectionActive = props.dashboard.connection
    ? (connectionStore?.connections[props.dashboard.connection]?.connected ?? false)
    : false

  // Get available imports for this connection
  const availableImports: ChatImport[] = editorStore
    ? Object.values(editorStore.editors)
        .filter(
          (editor) => editor.connection === props.dashboard.connection && !editor.deleted,
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((editor) => ({
          id: editor.id,
          name: editor.name.replace(/\//g, '.'),
          alias: '',
        }))
    : []

  return buildDashboardAgentSystemPrompt({
    dashboard: props.dashboard,
    dataConnectionName: props.dashboard.connection,
    availableConnections,
    activeImports: dashboardChatImports.value,
    availableImportsForConnection: availableImports,
    isDataConnectionActive,
  })
})

async function handleSend(message: string, messages: ChatMessage[]) {
  await handleChatMessageWithTools(message, messages)
}
</script>

<template>
  <div class="dashboard-chat-panel">
    <div class="chat-panel-header">
      <span class="chat-panel-title">
        <i class="mdi mdi-creation-outline"></i>
        Dashboard Assistant
      </span>
      <button class="chat-panel-close" @click="emit('close')" title="Close chat panel">
        <i class="mdi mdi-close"></i>
      </button>
    </div>

    <LLMChat
      :messages="activeChatMessages"
      :show-header="false"
      :external-loading="isChatLoading"
      :active-tool-name="activeToolName"
      :send-handler="handleSend"
      :system-prompt="systemPrompt"
      :placeholder="[
        'Ask me to add charts, tables, or markdown...',
        'Describe what data you want to visualize...',
        'Ask me to modify or rearrange items...',
      ]"
      send-button-text="Send"
      loading-text="Working on dashboard..."
    />
  </div>
</template>

<style scoped>
.dashboard-chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid var(--border-light);
  background: var(--bg-color);
  min-width: 340px;
  max-width: 480px;
  width: 380px;
}

.chat-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  background: var(--query-window-bg);
  flex-shrink: 0;
}

.chat-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  letter-spacing: var(--ui-label-letter-spacing);
}

.chat-panel-title .mdi {
  font-size: 18px;
  color: var(--special-text);
}

.chat-panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  border-radius: 6px;
  font-size: 16px;
}

.chat-panel-close:hover {
  background: var(--button-hover-bg);
}

.dashboard-chat-panel :deep(.llm-chat-container) {
  flex: 1;
  min-height: 0;
}

.dashboard-chat-panel :deep(.chat-messages) {
  font-size: 13px;
}

.dashboard-chat-panel :deep(.input-container) {
  padding: 8px 12px;
}

.dashboard-chat-panel :deep(textarea) {
  font-size: 13px;
  min-height: 36px;
  max-height: 120px;
}
</style>
