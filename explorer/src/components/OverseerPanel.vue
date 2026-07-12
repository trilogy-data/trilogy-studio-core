<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Chat, ChatMessage } from '@lib/chats/chat'
import useChatStore from '@lib/stores/chatStore'
import useLLMConnectionStore from '@lib/stores/llmStore'
import useConnectionStore from '@lib/stores/connectionStore'
import useEditorStore from '@lib/stores/editorStore'
import useProjectStore from '@lib/stores/projectStore'
import { useDashboardStore } from '@lib/stores/dashboardStore'
import type QueryExecutionService from '@lib/stores/queryExecutionService'
import LLMChat from '@lib/components/llm/LLMChat.vue'

/**
 * Right-column overseer chat. Slim — no artifacts pane (those live in the
 * middle column's ArtifactsView, sourced from subchats). Header carries
 * gear (open provider settings) and clear-context (wipe overseer history)
 * actions.
 *
 * The header dropdown swaps the panel between the overseer and any subchat
 * in the active project (read-only — only the overseer talks to subchats).
 * Jump-to-subagent buttons on dispatch tool-call pills select the same way.
 * This supplements the popup SubchatViewer opened from the project sidebar.
 */
const props = defineProps<{
  overseer: Chat
  queryExecutionService: QueryExecutionService
}>()

const emit = defineEmits<{
  'open-settings': []
}>()

const chatStore = useChatStore()
const llmStore = useLLMConnectionStore()
const connectionStore = useConnectionStore()
const editorStore = useEditorStore()
const projectStore = useProjectStore()
const dashboardStore = useDashboardStore()

// ----- chat navigation (overseer <-> subchats) -----
const viewedChatId = ref(props.overseer.id)

const subchatOptions = computed(() => {
  const project = projectStore.activeProject
  if (!project) return []
  return project.subchatIds
    .map((id) => chatStore.chats[id])
    .filter((c): c is Chat => !!c && !c.deleted)
    .map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      running: chatStore.isChatExecuting(c.id),
    }))
})

const viewedChat = computed(() => {
  if (viewedChatId.value === props.overseer.id) return props.overseer
  return chatStore.chats[viewedChatId.value] || props.overseer
})

const isViewingSubchat = computed(() => viewedChat.value.id !== props.overseer.id)

// Snap back to the overseer when the viewed subchat is deleted or the
// active project switches away from it.
watch([viewedChatId, subchatOptions], () => {
  if (viewedChatId.value === props.overseer.id) return
  if (!subchatOptions.value.some((o) => o.id === viewedChatId.value)) {
    viewedChatId.value = props.overseer.id
  }
})

function onOpenSubchat(id: string) {
  if (chatStore.chats[id]) {
    viewedChatId.value = id
  }
}

const isLoading = computed(() => chatStore.isChatExecuting(viewedChat.value.id))
const activeTool = computed(() => chatStore.getChatActiveToolName(viewedChat.value.id))
const isPaused = computed(() => chatStore.isChatPaused(viewedChat.value.id))

const subchatStatus = computed(() => {
  if (!isLoading.value) return 'idle'
  return isPaused.value ? 'paused' : 'running'
})

const activeSubchatCount = computed(() => {
  const project = projectStore.activeProject
  if (!project) return 0
  return project.subchatIds.filter((id) => chatStore.isChatExecuting(id)).length
})

const activeSubchatTitles = computed(() => {
  const project = projectStore.activeProject
  if (!project) return ''
  return project.subchatIds
    .filter((id) => chatStore.isChatExecuting(id))
    .map((id) => chatStore.chats[id]?.name || id)
    .join('\n')
})

async function handleSend(message: string, _msgs: ChatMessage[]): Promise<void> {
  // Subchat views are read-only; only the overseer accepts user input.
  if (isViewingSubchat.value) return
  if (Object.keys(llmStore.connections).length === 0) {
    chatStore.addMessageToChat(props.overseer.id, {
      role: 'assistant',
      content: 'No LLM provider configured.',
    })
    return
  }
  await chatStore.executeMessage(props.overseer.id, message, {
    llmConnectionStore: llmStore,
    connectionStore,
    queryExecutionService: props.queryExecutionService,
    editorStore,
    projectStore,
    dashboardStore,
  })
}

function clearContext() {
  // Wipes messages + artifacts for the overseer chat. Kept simple; no
  // undo. The chat record stays (same id) so persistence overwrites cleanly.
  if (isLoading.value || isViewingSubchat.value) return
  props.overseer.clearMessages()
}

function interrupt() {
  // Aborts the in-flight LLM call + tool loop via the AbortController in
  // chatExecutions[overseer.id]. Already-spawned subchats keep running —
  // those terminate on their own and inject summaries when done.
  if (!isLoading.value) return
  chatStore.stopExecution(props.overseer.id)
}

function togglePause() {
  // Applies to whichever chat is in view — pausing a running subchat from
  // here matches the popup viewer's pause control.
  if (!isLoading.value) return
  if (isPaused.value) {
    chatStore.resumeExecution(viewedChat.value.id)
  } else {
    chatStore.pauseExecution(viewedChat.value.id)
  }
}

const placeholder = computed(() => {
  if (isViewingSubchat.value) {
    return 'Read-only subagent view — the overseer drives this chat.'
  }
  return projectStore.activeProject
    ? `Talk to the overseer about “${projectStore.activeProject.name}”…`
    : 'Open a project, then ask the overseer to do something.'
})
</script>

<template>
  <section class="overseer">
    <LLMChat
      :messages="viewedChat.messages"
      :title="''"
      :showHeader="true"
      :placeholder="placeholder"
      :disabled="isViewingSubchat"
      :externalLoading="isLoading"
      :activeToolName="activeTool"
      :sendHandler="handleSend"
      :stopHandler="isViewingSubchat ? null : interrupt"
      stopButtonText="Stop"
      @open-subchat="onOpenSubchat"
    >
      <template #header-prefix>
        <select v-model="viewedChatId" class="chat-nav" title="Switch chat view">
          <option :value="overseer.id">Overseer</option>
          <option v-for="o in subchatOptions" :key="o.id" :value="o.id">
            {{ o.running ? '● ' : '' }}{{ o.kind }} · {{ o.name }}
          </option>
        </select>
        <template v-if="isViewingSubchat">
          <span class="status-tag" :class="`status-${subchatStatus}`">{{ subchatStatus }}</span>
          <span class="readonly-tag">read-only</span>
        </template>
        <span
          v-else-if="activeSubchatCount > 0"
          class="active-badge"
          :title="`Running:\n${activeSubchatTitles}`"
        >
          <span class="badge-dot" />
          {{ activeSubchatCount }}
        </span>
      </template>
      <template #header-actions>
        <button
          v-if="isViewingSubchat"
          class="hdr-btn"
          @click="viewedChatId = overseer.id"
          title="Back to overseer"
        >
          <i class="mdi mdi-arrow-left" />
        </button>
        <button
          v-if="isLoading"
          class="hdr-btn"
          :class="{ 'pause-active': isPaused }"
          @click="togglePause"
          :title="isPaused ? 'Resume loop' : 'Pause after current iteration'"
        >
          <i :class="isPaused ? 'mdi mdi-play' : 'mdi mdi-pause'" />
        </button>
        <button
          v-if="!isViewingSubchat"
          class="hdr-btn"
          :disabled="isLoading || overseer.messages.length === 0"
          @click="clearContext"
          title="Clear overseer context"
        >
          <i class="mdi mdi-delete-outline" />
        </button>
        <button class="hdr-btn" @click="emit('open-settings')" title="LLM provider settings">
          <i class="mdi mdi-cog-outline" />
        </button>
      </template>
    </LLMChat>
  </section>
</template>

<style scoped>
.overseer {
  width: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  border-left: 1px solid var(--border);
  overflow: hidden;
}

.overseer :deep(.llm-chat-container) {
  flex: 1;
}

/* The dropdown is the panel's title — hide LLMChat's empty title div so it
   doesn't reserve its min-width. */
.overseer :deep(.chat-title:empty) {
  display: none;
}

.chat-nav {
  max-width: 100%;
  min-width: 0;
  flex: 0 1 auto;
  border: 1px solid transparent;
  background: transparent;
  color: var(--panel-header-title-color, var(--fg));
  font-size: var(--panel-header-title-font-size, 0.85rem);
  font-weight: var(--panel-header-title-font-weight, 600);
  padding: 0.15rem 0.2rem;
  border-radius: 4px;
  cursor: pointer;
  text-overflow: ellipsis;
}

.chat-nav:hover,
.chat-nav:focus {
  border-color: var(--border);
  background: var(--bg);
  outline: none;
}

.hdr-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 1.05rem;
  cursor: pointer;
  padding: 0.2rem 0.45rem;
  line-height: 1;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hdr-btn:hover:not(:disabled) {
  background: rgba(127, 127, 127, 0.12);
  color: var(--fg);
}

.hdr-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.hdr-btn.pause-active {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
}

.status-tag {
  font-size: 0.66rem;
  text-transform: uppercase;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: rgba(127, 127, 127, 0.12);
  color: var(--muted);
  flex-shrink: 0;
}

.status-tag.status-running {
  background: rgba(245, 158, 11, 0.18);
  color: #d97706;
}

.status-tag.status-paused {
  background: rgba(59, 130, 246, 0.18);
  color: var(--accent);
}

.readonly-tag {
  font-size: 0.62rem;
  color: var(--muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.active-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.1rem 0.5rem;
  background: rgba(245, 158, 11, 0.15);
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #d97706;
  cursor: default;
  user-select: none;
}

.badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f59e0b;
  animation: badge-pulse 1.4s infinite;
}

@keyframes badge-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7);
    opacity: 1;
  }
  70% {
    box-shadow: 0 0 0 6px rgba(245, 158, 11, 0);
    opacity: 0.7;
  }
  100% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
    opacity: 1;
  }
}
</style>
