<script setup lang="ts">
import { computed } from 'vue'
import useChatStore from '@lib/stores/chatStore'
import LLMChat from '@lib/components/llm/LLMChat.vue'

/**
 * Read-only modal viewer for subchat transcripts. The user can't type into
 * subchats — only the overseer can, via send_to_subchat. The modal closes
 * via emit('close').
 */
const props = defineProps<{ chatId: string }>()
const emit = defineEmits<{ close: [] }>()

const chatStore = useChatStore()
const chat = computed(() => chatStore.chats[props.chatId] || null)
const isExecuting = computed(() => chatStore.isChatExecuting(props.chatId))
const isPaused = computed(() => chatStore.isChatPaused(props.chatId))
const status = computed(() => {
  if (!isExecuting.value) return 'idle'
  return isPaused.value ? 'paused' : 'running'
})
const activeTool = computed(() => chatStore.getChatActiveToolName(props.chatId))

const noopSendHandler = async (): Promise<void> => {}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}

function togglePause() {
  if (!isExecuting.value) return
  if (isPaused.value) {
    chatStore.resumeExecution(props.chatId)
  } else {
    chatStore.pauseExecution(props.chatId)
  }
}
</script>

<template>
  <div v-if="chat" class="backdrop" @click="onBackdropClick">
    <div class="modal" role="dialog">
      <header class="modal-head">
        <span class="kind-tag" :class="`kind-${chat.kind}`">{{ chat.kind }}</span>
        <span class="modal-title" :title="chat.name">{{ chat.name }}</span>
        <span class="modal-status" :class="`status-${status}`">{{ status }}</span>
        <span class="modal-readonly">read-only</span>
        <button
          v-if="isExecuting"
          class="pause-btn"
          :class="{ paused: isPaused }"
          @click="togglePause"
          :title="isPaused ? 'Resume loop' : 'Pause after current iteration'"
        >
          <i :class="isPaused ? 'mdi mdi-play' : 'mdi mdi-pause'" />
          {{ isPaused ? 'Resume' : 'Pause' }}
        </button>
        <button class="close-btn" @click="emit('close')" title="Close">×</button>
      </header>
      <div class="modal-body">
        <LLMChat
          :messages="chat.messages"
          :title="''"
          :showHeader="false"
          :disabled="true"
          :sendHandler="noopSendHandler"
          :externalLoading="status === 'running'"
          :activeToolName="activeTool"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: min(900px, 92vw);
  height: min(720px, 88vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
}

.modal-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border);
}

.modal-title {
  flex: 1;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.kind-tag {
  font-size: 0.62rem;
  text-transform: uppercase;
  font-weight: 700;
  padding: 0.05rem 0.35rem;
  border-radius: 3px;
  letter-spacing: 0.04em;
  background: rgba(127, 127, 127, 0.12);
}

.kind-tag.kind-architect {
  background: rgba(168, 85, 247, 0.18);
  color: #9333ea;
}

.kind-tag.kind-analyst {
  background: rgba(16, 185, 129, 0.18);
  color: #059669;
}

.modal-status {
  font-size: 0.7rem;
  text-transform: uppercase;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: rgba(127, 127, 127, 0.12);
  color: var(--muted);
}

.modal-status.status-running {
  background: rgba(245, 158, 11, 0.18);
  color: #d97706;
}

.modal-status.status-paused {
  background: rgba(59, 130, 246, 0.18);
  color: var(--accent);
}

.pause-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.18rem 0.55rem;
  border-radius: 4px;
  cursor: pointer;
  line-height: 1;
}

.pause-btn:hover {
  background: rgba(127, 127, 127, 0.12);
}

.pause-btn.paused {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
  border-color: rgba(59, 130, 246, 0.4);
}

.modal-readonly {
  font-size: 0.66rem;
  color: var(--muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.close-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 1.4rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 0.3rem;
}

.close-btn:hover {
  color: var(--fg);
}

.modal-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
</style>
