<script lang="ts" setup>
import { ref, computed, inject, nextTick, onMounted, watch } from 'vue'
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
  refreshItem: (itemId: string) => string | undefined
  captureDashboardImage?: () => Promise<{
    base64: string
    mediaType: string
    width: number
    height: number
    overflows: Array<{
      itemId: string
      visiblePx: number
      contentPx: number
      overflowPx: number
      visibleRatio: number
    }>
  }>
  initialPrompt?: string | null
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
const setActiveDashboardNav = inject<(dashboard: string | null) => void>('setActiveDashboard')

// Local state for dashboard chat imports
const dashboardChatImports = ref<ChatImport[]>([])

// Tools that mutate dashboard state — these trigger an auto-fork on first use
// so a chat session never modifies the user's original dashboard in place.
const MUTATING_TOOLS = new Set([
  'add_dashboard_item',
  'update_dashboard_item',
  'remove_dashboard_item',
  'move_dashboard_item',
  'update_dashboard_info',
  'set_dashboard_title',
])

// If this chat session has already forked the dashboard, this is the fork's id.
// All subsequent tool calls operate on this id instead of the original.
const sessionForkId = ref<string | null>(null)

// The dashboard id that the executor should target. Falls back to the bound
// dashboard prop until a fork has been created for this session.
const effectiveDashboardId = computed(
  () => sessionForkId.value ?? props.dashboard.id,
)

async function ensureChatFork(): Promise<void> {
  if (sessionForkId.value) return
  // Don't fork investigations — the user is already on a derived dashboard,
  // so editing in place is the expected behavior.
  if (props.dashboard.parentDashboardId) return

  const baseId = props.dashboard.id
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '')
  const investigationName = `chat-${stamp}`

  try {
    const fork = dashboardStore.forkDashboard(baseId, investigationName)
    sessionForkId.value = fork.id
    if (setActiveDashboardNav) {
      setActiveDashboardNav(fork.id)
    }
    // Wait for prop reactivity to flow through (props.dashboard) so the
    // executor's computed deps reflect the new id before we run the tool.
    await nextTick()
  } catch (err) {
    console.error('Failed to auto-fork dashboard for chat session:', err)
  }
}

// Create the dashboard tool executor
const toolExecutor = computed(() => {
  const deps: DashboardToolExecutorDeps = {
    dashboardStore,
    connectionStore,
    editorStore,
    queryExecutionService,
    dashboardId: effectiveDashboardId.value,
    getActiveImports: () => dashboardChatImports.value,
    setActiveImports: (imports: ChatImport[]) => {
      dashboardChatImports.value = imports
    },
    getDashboardQueryExecutor: () =>
      props.getDashboardQueryExecutor(effectiveDashboardId.value) || null,
    refreshItem: props.refreshItem,
    captureDashboardImage: props.captureDashboardImage,
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
    if (MUTATING_TOOLS.has(toolName)) {
      await ensureChatFork()
    }
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

// Track which initial-prompt strings we've already auto-submitted to avoid
// re-firing if the parent re-passes the same value or the prop is reactive.
const consumedInitialPrompts = new Set<string>()

async function maybeAutoSendInitialPrompt(value: string | null | undefined) {
  if (!value) return
  if (consumedInitialPrompts.has(value)) return
  consumedInitialPrompts.add(value)
  // Wait a tick so the chat panel is fully mounted and LLMChat has registered
  // its system prompt before we kick off the conversation.
  await nextTick()
  await handleSend(value, activeChatMessages.value)
}

onMounted(() => {
  void maybeAutoSendInitialPrompt(props.initialPrompt)
})

watch(
  () => props.initialPrompt,
  (newVal) => {
    void maybeAutoSendInitialPrompt(newVal)
  },
)
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
