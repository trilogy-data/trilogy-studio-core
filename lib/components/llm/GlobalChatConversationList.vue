<script lang="ts" setup>
import { computed, inject } from 'vue'
import type { ChatStoreType } from '../../stores/chatStore'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import type { Chat } from '../../chats/chat'
import { clearFrozenPrompt } from '../../llm/globalChatRuntime'

const props = defineProps<{
  activeChatId: string
}>()

const emit = defineEmits<{
  (e: 'select', chatId: string): void
  (e: 'new-chat'): void
}>()

const chatStore = inject<ChatStoreType>('chatStore') as ChatStoreType
const dashboardStore = inject<DashboardStoreType | null>('dashboardStore', null)

const byRecency = (a: Chat, b: Chat) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()

// Editor refinement chats are excluded permanently — the inline refinement
// surface is their only UI. Everything else user-facing lists here.
const conversations = computed<Chat[]>(() =>
  chatStore.chatList.filter((c) => c.kind === 'user' && c.source === 'user').sort(byRecency),
)

const dashboardSessions = computed<Chat[]>(() =>
  chatStore.chatList.filter((c) => c.kind === 'user' && c.source === 'dashboard').sort(byRecency),
)

function dashboardLabel(chat: Chat): string {
  const dashboard = chat.sourceRefId ? dashboardStore?.dashboards[chat.sourceRefId] : null
  return dashboard?.name || chat.name
}

function relativeTime(date: Date | string): string {
  const then = new Date(date).getTime()
  const deltaSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (deltaSec < 60) return 'just now'
  const minutes = Math.floor(deltaSec / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

function lastVisibleContent(chat: Chat): string {
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const m = chat.messages[i]
    if (!m.hidden && m.content?.trim()) {
      return m.content.trim()
    }
  }
  return ''
}

function handleDelete(chat: Chat) {
  if (!window.confirm(`Delete conversation "${chat.name}"?`)) return
  if (chatStore.isChatExecuting(chat.id)) {
    chatStore.stopExecution(chat.id)
  }
  chatStore.removeChat(chat.id)
  clearFrozenPrompt(chat.id)
}
</script>

<template>
  <div class="conversation-list" data-testid="global-chat-conversations">
    <button
      class="new-conversation-btn"
      @click="emit('new-chat')"
      data-testid="global-chat-new-conversation"
    >
      <i class="mdi mdi-plus"></i>
      New conversation
    </button>
    <div v-if="conversations.length === 0" class="empty-state">
      No conversations yet. Start one to ask about your data, dashboards, or the app itself.
    </div>
    <div
      v-for="chat in conversations"
      :key="chat.id"
      class="conversation-row"
      :class="{ active: chat.id === props.activeChatId }"
      @click="emit('select', chat.id)"
      :data-testid="`global-chat-conversation-${chat.id}`"
    >
      <div class="conversation-main">
        <div class="conversation-title-line">
          <span
            v-if="chatStore.isChatExecuting(chat.id)"
            class="running-spinner"
            title="Running"
          ></span>
          <span class="conversation-name">{{ chat.name }}</span>
        </div>
        <div class="conversation-preview" v-if="lastVisibleContent(chat)">
          {{ lastVisibleContent(chat) }}
        </div>
        <div class="conversation-meta">
          <span v-if="chat.llmConnectionName" class="connection-badge">
            {{ chat.llmConnectionName }}
          </span>
          <span class="conversation-time">{{ relativeTime(chat.updatedAt) }}</span>
        </div>
      </div>
      <button
        class="conversation-delete"
        @click.stop="handleDelete(chat)"
        title="Delete conversation"
        :data-testid="`global-chat-delete-${chat.id}`"
      >
        <i class="mdi mdi-trash-can-outline"></i>
      </button>
    </div>

    <template v-if="dashboardSessions.length > 0">
      <div class="section-header">Dashboard sessions</div>
      <div
        v-for="chat in dashboardSessions"
        :key="chat.id"
        class="conversation-row"
        :class="{ active: chat.id === props.activeChatId }"
        @click="emit('select', chat.id)"
        :data-testid="`global-chat-conversation-${chat.id}`"
      >
        <div class="conversation-main">
          <div class="conversation-title-line">
            <span
              v-if="chatStore.isChatExecuting(chat.id)"
              class="running-spinner"
              title="Running"
            ></span>
            <i class="mdi mdi-chart-multiple dashboard-chat-icon" aria-hidden="true"></i>
            <span class="conversation-name">{{ dashboardLabel(chat) }}</span>
          </div>
          <div class="conversation-preview" v-if="lastVisibleContent(chat)">
            {{ lastVisibleContent(chat) }}
          </div>
          <div class="conversation-meta">
            <span v-if="chat.llmConnectionName" class="connection-badge">
              {{ chat.llmConnectionName }}
            </span>
            <span class="conversation-time">{{ relativeTime(chat.updatedAt) }}</span>
          </div>
        </div>
        <button
          class="conversation-delete"
          @click.stop="handleDelete(chat)"
          title="Delete conversation"
          :data-testid="`global-chat-delete-${chat.id}`"
        >
          <i class="mdi mdi-trash-can-outline"></i>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.new-conversation-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  margin-bottom: 4px;
  border: 1px dashed var(--border-light);
  border-radius: 6px;
  background: transparent;
  color: var(--special-text);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}

.new-conversation-btn:hover {
  background: var(--button-hover-bg);
}

.empty-state {
  padding: 16px 8px;
  font-size: 12px;
  color: var(--text-faint);
  text-align: center;
}

.section-header {
  margin-top: 8px;
  padding: 4px 10px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
}

.dashboard-chat-icon {
  font-size: 13px;
  color: var(--text-faint);
  flex-shrink: 0;
}

.conversation-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
}

.conversation-row:hover {
  background: var(--button-hover-bg);
}

.conversation-row.active {
  border-color: var(--special-text);
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.06);
}

.conversation-main {
  flex: 1;
  min-width: 0;
}

.conversation-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.conversation-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-preview {
  font-size: 11px;
  color: var(--text-faint);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.connection-badge {
  font-size: 10px;
  color: var(--text-faint);
  background: var(--bg-color);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  padding: 1px 6px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-time {
  font-size: 10px;
  color: var(--text-faint);
}

.running-spinner {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--special-text);
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.conversation-delete {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  opacity: 0;
}

.conversation-row:hover .conversation-delete {
  opacity: 1;
}

.conversation-delete:hover {
  color: var(--error-color, #c0392b);
  background: var(--button-hover-bg);
}
</style>
