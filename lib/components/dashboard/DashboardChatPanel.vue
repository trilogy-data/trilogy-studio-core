<script lang="ts" setup>
import { ref, computed, inject, nextTick, onMounted, watch } from 'vue'
import LLMChat from '../llm/LLMChat.vue'
import { Chat } from '../../chats/chat'
import { DASHBOARD_TOOLS } from '../../llm/dashboardAgentTools'
import { buildDashboardAgentSystemPrompt } from '../../llm/dashboardAgentPrompt'
import { DashboardToolExecutor } from '../../llm/dashboardToolExecutor'
import type { DashboardModel } from '../../dashboards/base'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import type { ChatStoreType } from '../../stores/chatStore'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { EditorStoreType } from '../../stores/editorStore'
import type QueryExecutionService from '../../stores/queryExecutionService'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import type { ChatImport, ChatMessage, ChatToolCall } from '../../chats/chat'
import type { LLMToolCall, LLMToolResult } from '../../llm/base'
import { formatToolResultText } from '../../llm/toolLoopCore'
import { isTrilogyType } from '../../editors/fileTypes'

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

const dashboardStore = inject<DashboardStoreType>('dashboardStore') as DashboardStoreType
const chatStore = inject<ChatStoreType>('chatStore') as ChatStoreType
const llmConnectionStore = inject<LLMConnectionStoreType>(
  'llmConnectionStore',
) as LLMConnectionStoreType
const connectionStore = inject<ConnectionStoreType>('connectionStore') as ConnectionStoreType
const editorStore = inject<EditorStoreType>('editorStore') as EditorStoreType
const queryExecutionService = inject<QueryExecutionService>(
  'queryExecutionService',
) as QueryExecutionService
const setActiveDashboardNav = inject<(dashboard: string | null) => void>('setActiveDashboard')

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

// Chat ids that have committed to mutating their current dashboard in place.
// Populated the first time we decide to skip a fork, so subsequent mutations
// in the same session stay on the same dashboard even though gridItems is no
// longer empty. Without this, the second mutating tool call in a brand-new
// dashboard flow would see items the agent itself just added and spawn a fork.
const inPlaceChatIds = new Set<string>()

// Ensure this dashboard has a backing chat record, creating one lazily.
// Returns the chat id.
function ensureDashboardChat(): string {
  const existingId = props.dashboard.chatId
  if (existingId) {
    const existing = chatStore.chats[existingId]
    if (existing && !existing.deleted) {
      return existingId
    }
  }
  const chat = new Chat({
    name: `Dashboard: ${props.dashboard.name}`,
    llmConnectionName: llmConnectionStore.activeConnection || '',
    dataConnectionName: props.dashboard.connection || '',
    source: 'dashboard',
    sourceRefId: props.dashboard.id,
  })
  chatStore.addChat(chat)
  props.dashboard.setChatId(chat.id)
  return chat.id
}

const currentChatId = ref<string>('')

// Re-resolve the backing chat whenever the dashboard prop changes (navigating
// between dashboards with the panel open) or the dashboard's chatId pointer
// gets reassigned (e.g. after a fork moves the chat to a new dashboard).
watch(
  () => [props.dashboard.id, props.dashboard.chatId] as const,
  () => {
    currentChatId.value = ensureDashboardChat()
  },
  { immediate: true },
)

const currentChat = computed(() =>
  currentChatId.value ? chatStore.chats[currentChatId.value] || null : null,
)

const activeChatMessages = computed<ChatMessage[]>(() => currentChat.value?.messages || [])

const isChatLoading = computed(() =>
  currentChatId.value ? chatStore.isChatExecuting(currentChatId.value) : false,
)

const activeToolName = computed(() =>
  currentChatId.value ? chatStore.getChatActiveToolName(currentChatId.value) : '',
)

// The dashboard itself is the single source of truth for the "active import".
// Reading the agent's active imports off `dashboard.imports` (rather than a
// separate per-chat field) guarantees the chat panel, the agent prompt, and
// the dashboard query executor all see the same value. Otherwise operations
// like "clear chat" or rebuilding the chat session could leave chat.imports
// and dashboard.imports out of sync and confuse the agent about which import
// is live.
const dashboardChatImports = computed<ChatImport[]>(() =>
  (props.dashboard.imports || []).map((imp) => ({
    id: imp.id,
    name: imp.name,
    alias: imp.alias || '',
  })),
)

async function ensureChatFork(): Promise<void> {
  // Don't fork investigations — the user is already on a derived dashboard,
  // so editing in place is the expected behavior.
  if (props.dashboard.parentDashboardId) return

  const chatId = currentChatId.value

  // If this chat already decided to edit in place (e.g. the dashboard started
  // empty), keep doing so — items the agent itself added shouldn't trigger a
  // fork on the next tool call.
  if (chatId && inPlaceChatIds.has(chatId)) return

  // Reconstruct the decision after a panel close/reopen: if this chat has
  // already successfully mutated this dashboard in prior turns, it owns the
  // dashboard and should keep editing in place.
  const chat = chatId ? chatStore.chats[chatId] : null
  const hasPriorMutation = chat?.messages.some((m) =>
    m.executedToolCalls?.some((c) => MUTATING_TOOLS.has(c.name) && c.result?.success),
  )
  if (hasPriorMutation) {
    if (chatId) inPlaceChatIds.add(chatId)
    return
  }

  // Nothing to preserve on an empty dashboard (e.g. a dashboard created from
  // the chat-first creator flow), so edit in place instead of forking.
  if (Object.keys(props.dashboard.gridItems).length === 0) {
    if (chatId) inPlaceChatIds.add(chatId)
    return
  }

  const baseId = props.dashboard.id
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '')
  const investigationName = `chat-${stamp}`

  try {
    const fork = dashboardStore.forkDashboard(baseId, investigationName)
    // Move the chat pointer from the original dashboard to the fork so
    // reopening the panel on the fork resumes this conversation. The original
    // dashboard goes back to having no chat.
    const chatId = currentChatId.value
    props.dashboard.setChatId(null)
    fork.setChatId(chatId)
    const chat = chatStore.chats[chatId]
    if (chat) {
      chat.sourceRefId = fork.id
      chat.changed = true
    }
    if (setActiveDashboardNav) {
      setActiveDashboardNav(fork.id)
    }
    // Wait for prop reactivity to flow through so the executor's dashboardId
    // reflects the new id before the tool actually runs.
    await nextTick()
  } catch (err) {
    console.error('Failed to auto-fork dashboard for chat session:', err)
  }
}

// Tool executor is recomputed when the dashboard prop id changes (including
// post-fork, since the parent swaps which dashboard is rendered).
const toolExecutor = computed(() => {
  return new DashboardToolExecutor({
    dashboardStore,
    connectionStore,
    editorStore,
    queryExecutionService,
    dashboardId: props.dashboard.id,
    getActiveImports: () => dashboardChatImports.value,
    setActiveImports: (imports: ChatImport[]) => {
      // Write only to the dashboard. `dashboardChatImports` reads back from
      // the same store, so the agent, prompt, and query executor stay in sync
      // automatically — there is no separate chat-level import state to drift.
      dashboardStore.updateDashboardImports(
        props.dashboard.id,
        imports.map((imp) => ({ id: imp.id, name: imp.name, alias: imp.alias })),
      )
    },
    getDashboardQueryExecutor: () => props.getDashboardQueryExecutor(props.dashboard.id) || null,
    refreshItem: props.refreshItem,
    captureDashboardImage: props.captureDashboardImage,
  })
})

const systemPrompt = computed(() => {
  const availableConnections = connectionStore
    ? Object.values(connectionStore.connections).map((c) => c.name)
    : []
  const dashboardConnection =
    (props.dashboard.connectionId && connectionStore?.connections[props.dashboard.connectionId]) ||
    (props.dashboard.connection
      ? connectionStore?.connectionByName(props.dashboard.connection)
      : undefined)
  const isDataConnectionActive = dashboardConnection?.connected ?? false
  const availableImports: ChatImport[] =
    editorStore && dashboardConnection
      ? Object.values(editorStore.editors)
          .filter(
            (editor) =>
              !editor.deleted &&
              isTrilogyType(editor.type) &&
              editor.connectionId === dashboardConnection.id,
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

function handleClear() {
  const chatId = currentChatId.value
  if (!chatId) return
  const chat = chatStore.chats[chatId]
  if (!chat || chat.messages.length === 0) return
  if (!window.confirm('Clear this dashboard conversation? Messages cannot be recovered.')) return
  // Stop any in-flight tool loop before wiping the history out from under it.
  if (chatStore.isChatExecuting(chatId)) {
    chatStore.stopExecution(chatId)
  }
  chatStore.clearChatMessages(chatId)
}

async function handleSend(message: string, _messages: ChatMessage[]) {
  const chatId = currentChatId.value
  if (!chatId) return

  // Keep the chat's data connection aligned with the dashboard's, in case
  // the dashboard's connection changed since the chat was created.
  const chat = chatStore.chats[chatId]
  if (chat && chat.dataConnectionName !== (props.dashboard.connection || '')) {
    chat.setDataConnection(props.dashboard.connection || '', props.dashboard.connectionId || '')
  }

  await chatStore.executeMessage(
    chatId,
    message,
    {
      llmConnectionStore,
      connectionStore,
      queryExecutionService,
      editorStore,
    },
    {
      overrides: {
        tools: DASHBOARD_TOOLS,
        executeToolCall: async (toolName, toolInput) => {
          if (MUTATING_TOOLS.has(toolName)) {
            await ensureChatFork()
          }
          const result = await toolExecutor.value.executeToolCall(
            toolName,
            toolInput as Record<string, any>,
          )
          return result
        },
        buildSystemPrompt: () => systemPrompt.value,
      },
    },
  )
}

// Track which initial-prompt strings we've already auto-submitted to avoid
// re-firing if the parent re-passes the same value or the prop is reactive.
const consumedInitialPrompts = new Set<string>()

// Seed a brand-new dashboard chat with a synthetic select_active_import tool
// call + result so the agent starts with the chosen import's field list in
// context. Without this, the agent guesses field names (e.g. `tree.city`)
// before it gets around to calling select_active_import itself.
async function seedInitialImportContext(): Promise<void> {
  const chatId = currentChatId.value
  if (!chatId) return
  const chat = chatStore.chats[chatId]
  if (!chat) return
  // Only seed on a fresh conversation — otherwise we'd stack duplicates on
  // every dashboard reopen.
  if (chat.messages.length > 0) return

  const activeImports = dashboardChatImports.value
  if (activeImports.length === 0) return
  const imp = activeImports[0]

  let result
  try {
    result = await toolExecutor.value.executeToolCall('select_active_import', {
      import_name: imp.name,
    })
  } catch (err) {
    console.error('Failed to seed initial import context:', err)
    return
  }
  if (!result.success) return

  const toolCallId = `seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const toolCall: LLMToolCall = {
    id: toolCallId,
    name: 'select_active_import',
    input: { import_name: imp.name },
  }
  const executedToolCall: ChatToolCall = {
    id: toolCallId,
    name: 'select_active_import',
    input: { import_name: imp.name },
    result: { success: true, message: result.message },
  }
  const toolResult: LLMToolResult = {
    toolCallId,
    toolName: 'select_active_import',
    result: formatToolResultText(result),
  }

  chatStore.addMessageToChat(chatId, {
    role: 'assistant',
    content: `Inspecting the selected data source "${imp.name}" so I know what fields are available.`,
    toolCalls: [toolCall],
    executedToolCalls: [executedToolCall],
  })
  chatStore.addMessageToChat(chatId, {
    role: 'user',
    content: '',
    toolResults: [toolResult],
    hidden: true,
  })
}

async function maybeAutoSendInitialPrompt(value: string | null | undefined) {
  if (!value) return
  if (consumedInitialPrompts.has(value)) return
  consumedInitialPrompts.add(value)
  // Wait a tick so the chat panel is fully mounted and LLMChat has registered
  // its system prompt before we kick off the conversation.
  await nextTick()
  await seedInitialImportContext()
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
      <div class="chat-panel-actions">
        <button
          class="chat-panel-action"
          :disabled="activeChatMessages.length === 0"
          @click="handleClear"
          title="Clear conversation"
        >
          <i class="mdi mdi-broom"></i>
          Clear
        </button>
        <button class="chat-panel-close" @click="emit('close')" title="Close chat panel">
          <i class="mdi mdi-close"></i>
        </button>
      </div>
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

.chat-panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.chat-panel-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}

.chat-panel-action .mdi {
  font-size: 14px;
}

.chat-panel-action:hover:not(:disabled) {
  background: var(--button-hover-bg);
  color: var(--text-color);
}

.chat-panel-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
