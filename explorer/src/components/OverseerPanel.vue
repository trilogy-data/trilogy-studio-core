<script setup lang="ts">
import { computed } from 'vue'
import type { Chat, ChatMessage } from '@lib/chats/chat'
import useChatStore from '@lib/stores/chatStore'
import useLLMConnectionStore from '@lib/stores/llmStore'
import useConnectionStore from '@lib/stores/connectionStore'
import useEditorStore from '@lib/stores/editorStore'
import useProjectStore from '@lib/stores/projectStore'
import type QueryExecutionService from '@lib/stores/queryExecutionService'
import LLMChat from '@lib/components/llm/LLMChat.vue'

/**
 * Right-column overseer chat. Slim — no artifacts pane (those live in the
 * middle column's ArtifactsView, sourced from subchats). Header carries
 * gear (open provider settings) and clear-context (wipe overseer history)
 * actions.
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

const isLoading = computed(() => chatStore.isChatExecuting(props.overseer.id))
const activeTool = computed(() => chatStore.getChatActiveToolName(props.overseer.id))
const isPaused = computed(() => chatStore.isChatPaused(props.overseer.id))

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
  })
}

function clearContext() {
  // Wipes messages + artifacts for the overseer chat. Kept simple; no
  // undo. The chat record stays (same id) so persistence overwrites cleanly.
  if (isLoading.value) return
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
  if (!isLoading.value) return
  if (isPaused.value) {
    chatStore.resumeExecution(props.overseer.id)
  } else {
    chatStore.pauseExecution(props.overseer.id)
  }
}

const placeholder = computed(() =>
  projectStore.activeProject
    ? `Talk to the overseer about “${projectStore.activeProject.name}”…`
    : 'Open a project, then ask the overseer to do something.',
)
</script>

<template>
  <section class="overseer">
    <LLMChat
      :messages="overseer.messages"
      :title="'Overseer'"
      :showHeader="true"
      :placeholder="placeholder"
      :externalLoading="isLoading"
      :activeToolName="activeTool"
      :sendHandler="handleSend"
      :stopHandler="interrupt"
      stopButtonText="Stop"
    >
      <template #header-prefix>
        <span
          v-if="activeSubchatCount > 0"
          class="active-badge"
          :title="`Running:\n${activeSubchatTitles}`"
        >
          <span class="badge-dot" />
          {{ activeSubchatCount }}
        </span>
      </template>
      <template #header-actions>
        <button
          v-if="isLoading"
          class="hdr-btn"
          :class="{ 'pause-active': isPaused }"
          @click="togglePause"
          :title="isPaused ? 'Resume overseer loop' : 'Pause after current iteration'"
        >
          <i :class="isPaused ? 'mdi mdi-play' : 'mdi mdi-pause'" />
        </button>
        <button
          class="hdr-btn"
          :disabled="isLoading || overseer.messages.length === 0"
          @click="clearContext"
          title="Clear overseer context"
        >
          <i class="mdi mdi-delete-outline" />
        </button>
        <button
          class="hdr-btn"
          @click="emit('open-settings')"
          title="LLM provider settings"
        >
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
