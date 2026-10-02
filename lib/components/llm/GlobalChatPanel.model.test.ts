import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { OpenAIProvider } from '../../llm/openai'
import useChatStore from '../../stores/chatStore'
import useLLMConnectionStore from '../../stores/llmStore'
import useGlobalChatPanel, { resetGlobalChatPanelForTests } from '../../stores/useGlobalChatPanel'
import GlobalChatPanel from './GlobalChatPanel.vue'

vi.mock('../../llm/navigationContextInjector', () => ({
  startNavigationContextInjection: () => () => {},
  resetNavigationNoteDedupe: vi.fn(),
}))

function setup() {
  const llmConnectionStore = useLLMConnectionStore()
  llmConnectionStore.addConnection(new OpenAIProvider('openai', '', 'gpt-5.3'))
  const provider = llmConnectionStore.connections.openai
  provider.models = ['gpt-5.3', 'gpt-6-luna']
  provider.connected = true
  const chatStore = useChatStore()
  const chat = chatStore.newChat('openai', '')
  const otherChat = chatStore.newChat('openai', '')
  useGlobalChatPanel().openPanel(chat.id)
  const save = vi.fn().mockResolvedValue(undefined)
  const wrapper = mount(GlobalChatPanel, {
    global: {
      provide: {
        llmConnectionStore,
        chatStore,
        connectionStore: { connections: {} },
        editorStore: { editors: {} },
        queryExecutionService: {},
        saveLLMConnections: save,
      },
      stubs: {
        LLMChat: true,
        ChatArtifact: true,
        GlobalChatConversationList: true,
        EditableTitle: true,
      },
    },
  })
  return { wrapper, provider, llmConnectionStore, chatStore, chat, otherChat, save }
}

describe('chat panel model selection', () => {
  beforeEach(() => {
    window.location.hash = ''
    localStorage.clear()
    setActivePinia(createPinia())
    resetGlobalChatPanelForTests()
  })

  it('updates and persists the model for the connection shared by chats', async () => {
    const { wrapper, provider, llmConnectionStore, otherChat, save } = setup()
    expect(wrapper.text()).toContain('affects all chats using it')
    await wrapper.get('[data-testid="chat-model-select"]').setValue('gpt-6-luna')
    await flushPromises()
    expect(provider.model).toBe('gpt-6-luna')
    expect(llmConnectionStore.connections[otherChat.llmConnectionName].model).toBe('gpt-6-luna')
    expect(save).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('blocks changes during a background agent, including while paused', async () => {
    const { wrapper, provider, chatStore, otherChat, save } = setup()
    chatStore.startExecution(otherChat.id)
    chatStore.pauseExecution(otherChat.id)
    await flushPromises()
    expect(provider.running).toBe(false)
    expect(wrapper.get('[data-testid="chat-model-select"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Wait for chats')
    // The handler must guard too, even if a stale UI emits a change.
    wrapper.getComponent({ name: 'ChatModelSelect' }).vm.$emit('update:modelValue', 'gpt-6-luna')
    await flushPromises()
    expect(provider.model).toBe('gpt-5.3')
    expect(save).not.toHaveBeenCalled()
    chatStore.chatExecutions[otherChat.id].isLoading = false
    await flushPromises()
    expect(wrapper.get('[data-testid="chat-model-select"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('includes running chats that use the active connection as a fallback', async () => {
    const { wrapper, chatStore, otherChat } = setup()
    chatStore.updateChatLLMConnection(otherChat.id, '')
    chatStore.startExecution(otherChat.id)
    await flushPromises()
    expect(wrapper.get('[data-testid="chat-model-select"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('omits deleted connections from the connection picker', async () => {
    const { wrapper, llmConnectionStore } = setup()
    const deleted = new OpenAIProvider('deleted', '', 'gpt-6-luna')
    deleted.delete()
    llmConnectionStore.addConnection(deleted)
    await flushPromises()
    expect(wrapper.get('[data-testid="global-chat-llm-select"]').text()).not.toContain('deleted')
    wrapper.unmount()
  })

  it('restores the previous model and shows an error when saving fails', async () => {
    const { wrapper, provider, save } = setup()
    save.mockRejectedValue(new Error('storage unavailable'))
    await wrapper.get('[data-testid="chat-model-select"]').setValue('gpt-6-luna')
    await flushPromises()
    expect(provider.model).toBe('gpt-5.3')
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not save')
    wrapper.unmount()
  })

  it('disables model changes while the provider is running', async () => {
    const { wrapper, provider } = setup()
    provider.running = true
    await flushPromises()
    expect(wrapper.get('[data-testid="chat-model-select"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
