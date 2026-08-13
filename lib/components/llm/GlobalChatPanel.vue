<script lang="ts" setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import LLMChat from './LLMChat.vue'
import ChatArtifact from './ChatArtifact.vue'
import GlobalChatConversationList from './GlobalChatConversationList.vue'
import EditableTitle from '../EditableTitle.vue'
import useGlobalChatPanel, {
  GLOBAL_CHAT_MIN_WIDTH,
  GLOBAL_CHAT_MAX_WIDTH,
} from '../../stores/useGlobalChatPanel'
import { sendGlobalChatMessage, clearFrozenPrompt } from '../../llm/globalChatRuntime'
import {
  startNavigationContextInjection,
  resetNavigationNoteDedupe,
} from '../../llm/navigationContextInjector'
import type { ChatStoreType } from '../../stores/chatStore'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { EditorStoreType } from '../../stores/editorStore'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import type { ProjectStoreType } from '../../stores/projectStore'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import type QueryExecutionService from '../../stores/queryExecutionService'
import type { ChatMessage } from '../../chats/chat'

const chatStore = inject<ChatStoreType>('chatStore') as ChatStoreType
const llmConnectionStore = inject<LLMConnectionStoreType>(
  'llmConnectionStore',
) as LLMConnectionStoreType
const connectionStore = inject<ConnectionStoreType>('connectionStore') as ConnectionStoreType
const editorStore = inject<EditorStoreType>('editorStore') as EditorStoreType
const queryExecutionService = inject<QueryExecutionService>(
  'queryExecutionService',
) as QueryExecutionService
const dashboardStore = inject<DashboardStoreType | null>('dashboardStore', null)
const projectStore = inject<ProjectStoreType | null>('projectStore', null)
const modelStore = inject<ModelConfigStoreType | null>('modelStore', null)
const saveEditors = inject<(() => Promise<unknown> | unknown) | null>('saveEditors', null)
const saveModels = inject<(() => Promise<unknown> | unknown) | null>('saveModels', null)

const panel = useGlobalChatPanel()
// Persisted chats hydrate asynchronously; falling back before they load would
// bounce a valid #chatPanel=<id> restore to the list view.
const storesLoaded = inject<Ref<boolean>>('storesLoaded', ref(true))

const activeChat = computed(() => {
  const id = panel.activePanelChatId.value
  if (!id) return null
  const chat = chatStore.chats[id]
  if (!chat || chat.deleted) return null
  return chat
})

// Restore path: the URL hash may reference a chat that no longer exists, and
// closing/deleting the active conversation should land somewhere sensible.
// Fall back to the most recent visible conversation, else the list view.
watch(
  [() => panel.isOpen.value, activeChat, storesLoaded],
  ([open, chat, loaded]) => {
    if (!open || chat || !loaded) return
    const fallback = chatStore.chatList
      .filter((c) => c.kind === 'user' && c.source === 'user')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
    if (fallback) {
      panel.setActivePanelChat(fallback.id)
    } else {
      panel.setView('list')
    }
  },
  { immediate: true },
)

const activeChatMessages = computed<ChatMessage[]>(() => activeChat.value?.messages || [])

// Only the newest artifact renders expanded — older ones collapse to a header
// so long conversations don't mount a wall of tables and charts.
const lastArtifactMessage = computed<ChatMessage | null>(() => {
  const messages = activeChatMessages.value
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg && msg.artifact && !msg.hidden) return msg
  }
  return null
})

const isChatLoading = computed(() =>
  activeChat.value ? chatStore.isChatExecuting(activeChat.value.id) : false,
)

const activeToolName = computed(() =>
  activeChat.value ? chatStore.getChatActiveToolName(activeChat.value.id) : '',
)

const rateLimitBackoff = computed(() =>
  activeChat.value ? chatStore.getChatRateLimitBackoff(activeChat.value.id) : null,
)

// Conversations executing somewhere other than the panel's current one — the
// loop lives in chatStore, so runs continue across navigation and panel state.
const otherRunningCount = computed(
  () =>
    Object.entries(chatStore.chatExecutions).filter(([chatId, execution]) => {
      if (!execution?.isLoading) return false
      if (chatId === panel.activePanelChatId.value) return false
      const chat = chatStore.chats[chatId]
      // User conversations and dashboard sessions surface here; editor
      // refinement chats have their own inline UI.
      return !!chat && !chat.deleted && chat.kind === 'user' && chat.source !== 'editor'
    }).length,
)

const llmConnectionNames = computed(() => Object.keys(llmConnectionStore.connections))

const selectedLLMConnection = computed({
  get: () => activeChat.value?.llmConnectionName || '',
  set: (name: string) => {
    if (activeChat.value) {
      chatStore.updateChatLLMConnection(activeChat.value.id, name)
    }
  },
})

function handleTitleUpdate(name: string) {
  if (activeChat.value) {
    chatStore.updateChatName(activeChat.value.id, name)
  }
}

function handleNewChat() {
  const chat = chatStore.newChat(llmConnectionStore.activeConnection || '', '', undefined, '', {
    activate: false,
  })
  panel.setActivePanelChat(chat.id)
}

function handleSelectChat(chatId: string) {
  panel.setActivePanelChat(chatId)
}

async function handleSend(message: string, _messages: ChatMessage[]) {
  let chat = activeChat.value
  if (!chat) {
    chat = chatStore.newChat(llmConnectionStore.activeConnection || '', '', undefined, '', {
      activate: false,
    })
    panel.setActivePanelChat(chat.id)
    // Let the injector's target watcher queue the location note for the new
    // conversation before the send consumes pendingContextNote.
    await nextTick()
  }
  await sendGlobalChatMessage({
    chatId: chat.id,
    message,
    chatStore,
    deps: {
      llmConnectionStore,
      connectionStore,
      queryExecutionService,
      editorStore,
      ...(projectStore ? { projectStore } : {}),
      ...(dashboardStore ? { dashboardStore } : {}),
      ...(modelStore ? { modelStore } : {}),
      ...(saveEditors ? { saveEditors } : {}),
      ...(saveModels ? { saveModels } : {}),
    },
  })
}

// Queue latest-wins navigation notes on the active conversation while the
// panel is open; they deliver lazily on the next send.
let stopNavInjection: (() => void) | null = null
onMounted(() => {
  stopNavInjection = startNavigationContextInjection({
    chatStore,
    getTargetChatId: () => panel.activePanelChatId.value,
    dashboardNameLookup: (id) => dashboardStore?.dashboards[id]?.name ?? null,
    editorNameLookup: (id) => editorStore.editors[id]?.name ?? null,
  })
})
onBeforeUnmount(() => {
  if (stopNavInjection) {
    stopNavInjection()
    stopNavInjection = null
  }
})

function handleStop() {
  const chat = activeChat.value
  if (!chat) return
  if (!chatStore.isChatExecuting(chat.id)) return
  chatStore.stopExecution(chat.id)
}

function handleClearChat() {
  const chat = activeChat.value
  if (!chat) return
  if (!window.confirm(`Clear all messages in "${chat.name}"?`)) return
  if (chatStore.isChatExecuting(chat.id)) {
    chatStore.stopExecution(chat.id)
  }
  chatStore.clearChatMessages(chat.id)
  // Let the next send re-snapshot the system prompt — nothing cached remains.
  clearFrozenPrompt(chat.id)
  // The delivered location note died with the history; forget the dedupe so
  // the next send carries a fresh context note.
  resetNavigationNoteDedupe(chat.id)
}

// ---- resize (manual drag handle; split.js does not manage this column) ----
let resizeCleanup: (() => void) | null = null

function startResize(event: MouseEvent) {
  event.preventDefault()
  // A drag released outside the window never gets its mouseup — clean up any
  // orphaned listeners from the previous drag before starting a new one.
  if (resizeCleanup) {
    resizeCleanup()
    resizeCleanup = null
  }
  const startX = event.clientX
  const startWidth = panel.panelWidth.value

  const onMove = (e: MouseEvent) => {
    // Handle sits on the panel's left edge: dragging left widens the panel.
    panel.setPanelWidth(startWidth + (startX - e.clientX))
  }
  const onUp = () => {
    if (resizeCleanup) {
      resizeCleanup()
      resizeCleanup = null
    }
    // Charts (vega) size to their container only on window resize events.
    window.dispatchEvent(new Event('resize'))
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  resizeCleanup = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
}

onBeforeUnmount(() => {
  if (resizeCleanup) {
    resizeCleanup()
    resizeCleanup = null
  }
})
</script>

<template>
  <div
    class="global-chat-panel"
    :style="{
      width: panel.panelWidth.value + 'px',
      minWidth: GLOBAL_CHAT_MIN_WIDTH + 'px',
      maxWidth: GLOBAL_CHAT_MAX_WIDTH + 'px',
    }"
    data-testid="global-chat-panel"
  >
    <div class="panel-resize-handle" @mousedown="startResize"></div>
    <div class="panel-body">
      <div class="panel-header">
        <button
          class="panel-header-btn"
          :class="{ 'is-active': panel.view.value === 'list' }"
          @click="panel.setView(panel.view.value === 'list' ? 'conversation' : 'list')"
          title="Conversations"
          data-testid="global-chat-list-toggle"
        >
          <i class="mdi mdi-forum-outline"></i>
          <span v-if="otherRunningCount > 0" class="running-badge">{{ otherRunningCount }}</span>
        </button>
        <div class="panel-title" v-if="panel.view.value === 'conversation' && activeChat">
          <EditableTitle
            :model-value="activeChat.name"
            test-id="global-chat-title"
            @update:model-value="handleTitleUpdate"
          />
        </div>
        <div class="panel-title panel-title-static" v-else>
          <i class="mdi mdi-creation"></i>
          AI Assistant
        </div>
        <div class="panel-actions">
          <select
            v-if="panel.view.value === 'conversation' && activeChat && llmConnectionNames.length"
            class="llm-connection-select"
            v-model="selectedLLMConnection"
            title="LLM connection for this conversation"
            data-testid="global-chat-llm-select"
          >
            <option value="" disabled>LLM…</option>
            <option v-for="name in llmConnectionNames" :key="name" :value="name">
              {{ name }}
            </option>
          </select>
          <button
            v-if="isChatLoading"
            class="panel-header-btn panel-header-btn-stop"
            @click="handleStop"
            title="Stop the assistant"
            data-testid="global-chat-stop"
          >
            <i class="mdi mdi-stop-circle-outline"></i>
          </button>
          <button
            v-if="panel.view.value === 'conversation' && activeChat && activeChatMessages.length"
            class="panel-header-btn"
            @click="handleClearChat"
            title="Clear conversation"
            data-testid="global-chat-clear"
          >
            <i class="mdi mdi-broom"></i>
          </button>
          <button
            class="panel-header-btn"
            @click="handleNewChat"
            title="New conversation"
            data-testid="global-chat-new"
          >
            <i class="mdi mdi-plus"></i>
          </button>
          <button
            class="panel-header-btn"
            @click="panel.closePanel()"
            title="Close (Ctrl+Shift+.)"
            data-testid="global-chat-close"
          >
            <i class="mdi mdi-close"></i>
          </button>
        </div>
      </div>

      <div v-if="rateLimitBackoff?.isWaiting" class="backoff-banner">
        Rate limited — retrying (attempt {{ rateLimitBackoff.attempt }},
        {{ Math.round(rateLimitBackoff.delayMs / 1000) }}s)
      </div>

      <GlobalChatConversationList
        v-if="panel.view.value === 'list'"
        :active-chat-id="panel.activePanelChatId.value"
        @select="handleSelectChat"
        @new-chat="handleNewChat"
      />
      <LLMChat
        v-else
        :messages="activeChatMessages"
        :show-header="false"
        :external-loading="isChatLoading"
        :active-tool-name="activeToolName"
        :send-handler="handleSend"
        :stop-handler="handleStop"
        :placeholder="[
          'Ask about your data...',
          'Ask how the app works...',
          'Describe what you want to build...',
        ]"
        send-button-text="Send"
        loading-text="Working..."
      >
        <template #artifact="{ artifact, message }">
          <ChatArtifact
            :artifact="artifact"
            :height="320"
            :can-expand="false"
            :default-expanded="message === lastArtifactMessage"
          />
        </template>
      </LLMChat>
    </div>
  </div>
</template>

<style scoped>
.global-chat-panel {
  position: relative;
  display: flex;
  height: 100%;
  border-left: 1px solid var(--border-light);
  background: var(--bg-color);
}

.panel-resize-handle {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 60;
}

.panel-resize-handle:hover {
  background: var(--special-text);
  opacity: 0.4;
}

.panel-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-light);
  background: var(--query-window-bg);
  flex-shrink: 0;
}

.panel-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  overflow: hidden;
  white-space: nowrap;
}

.panel-title-static {
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel-title-static .mdi {
  font-size: 16px;
  color: var(--special-text);
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.llm-connection-select {
  max-width: 110px;
  height: 26px;
  font-size: 11px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  padding: 0 4px;
}

.panel-header-btn {
  position: relative;
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

.panel-header-btn:hover {
  background: var(--button-hover-bg);
}

.panel-header-btn.is-active {
  color: var(--special-text);
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.08);
}

.panel-header-btn-stop {
  color: var(--error-color, #c0392b);
}

.running-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  background: var(--special-text);
  color: white;
  font-size: 9px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  animation: badge-pulse 1.5s ease-in-out infinite;
}

@keyframes badge-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.backoff-banner {
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-faint);
  background: rgba(230, 160, 30, 0.12);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.global-chat-panel :deep(.llm-chat-container) {
  flex: 1;
  min-height: 0;
}

.global-chat-panel :deep(.chat-messages) {
  font-size: 13px;
}

.global-chat-panel :deep(.input-container) {
  padding: 8px 12px;
}

.global-chat-panel :deep(textarea) {
  font-size: 13px;
  min-height: 36px;
  max-height: 120px;
}
</style>
