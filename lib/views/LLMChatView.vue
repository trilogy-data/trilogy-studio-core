<template>
  <div class="llm-chat-view">
    <l-l-m-chat-demo
      ref="chatDemo"
      :title="title"
      :placeholder="placeholder"
      :systemPrompt="systemPrompt"
      :provider="provider"
      :providerApiKey="providerApiKey"
      :model="model"
      :showProviderSelector="showProviderSelector"
      :customMessageHandler="customMessageHandler"
      :enableDataAnalysis="enableDataAnalysis"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, type PropType } from 'vue'
import LLMChatDemo from '../components/llm/LLMChatDemo.vue'
import type { ChatArtifact, ChatMessage } from '../components/llm/LLMChat.vue'

export default defineComponent({
  name: 'LLMChatViewComponent',
  components: {
    LLMChatDemo,
  },
  props: {
    title: {
      type: String,
      default: 'AI Chat',
    },
    placeholder: {
      type: String,
      default: 'Ask me anything...',
    },
    systemPrompt: {
      type: String,
      default: '',
    },
    provider: {
      type: String,
      default: '',
    },
    providerApiKey: {
      type: String,
      default: '',
    },
    model: {
      type: String,
      default: '',
    },
    showProviderSelector: {
      type: Boolean,
      default: true,
    },
    customMessageHandler: {
      type: [Function, null] as PropType<
        ((message: string, messages: ChatMessage[]) => Promise<{ response?: string; artifact?: ChatArtifact } | void>) | null
      >,
      default: undefined,
    },
    enableDataAnalysis: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    const chatDemo = ref<InstanceType<typeof LLMChatDemo> | null>(null)

    // Expose methods for external control
    const addArtifact = (artifact: ChatArtifact, message?: string) => {
      chatDemo.value?.addArtifact(artifact, message)
    }

    const addMessage = (message: ChatMessage) => {
      chatDemo.value?.addMessage(message)
    }

    const clearChat = () => {
      chatDemo.value?.clearChat()
    }

    return {
      chatDemo,
      addArtifact,
      addMessage,
      clearChat,
    }
  },
})
</script>

<style scoped>
.llm-chat-view {
  height: 100%;
  width: 100%;
  overflow: hidden;
}
</style>
