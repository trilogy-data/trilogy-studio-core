import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { OpenAIProvider } from '../../llm/openai'
import ChatCreatorModal from './ChatCreatorModal.vue'

function setup(preselectedConnection = 'openai') {
  const provider = reactive(new OpenAIProvider('openai', '', 'gpt-5.3'))
  provider.models = ['gpt-6-luna', 'gpt-5.3']
  provider.connected = true
  const other = reactive(new OpenAIProvider('other', '', 'gpt-6-astra'))
  other.models = ['gpt-6-astra', 'gpt-6-luna']
  other.connected = true
  const save = vi.fn().mockResolvedValue(undefined)
  const newChat = vi.fn().mockReturnValue({ id: 'new-chat' })
  const wrapper = mount(ChatCreatorModal, {
    props: { visible: true, preselectedConnection },
    global: {
      provide: {
        llmConnectionStore: reactive({
          connections: { openai: provider, other },
          activeConnection: 'openai',
        }),
        chatStore: { newChat },
        saveLLMConnections: save,
      },
    },
  })
  return { wrapper, provider, other, save, newChat }
}

describe('new chat model selection', () => {
  it('keeps the model editable when the connection is preselected', () => {
    const { wrapper } = setup()
    expect(
      wrapper.get('[data-testid="llm-connection-select"]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.get('[data-testid="chat-model-select"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('allows a model change when the provider is running', async () => {
    const { wrapper, provider, save, newChat } = setup()
    provider.running = true
    await flushPromises()
    expect(wrapper.get('[data-testid="chat-model-select"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="chat-model-select"]').setValue('gpt-6-luna')
    await wrapper.get('[data-testid="create-chat-btn"]').trigger('click')
    await flushPromises()
    expect(provider.model).toBe('gpt-6-luna')
    expect(save).toHaveBeenCalledOnce()
    expect(newChat).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('saves the shared model only when creating the chat', async () => {
    const { wrapper, provider, save, newChat } = setup()
    expect(wrapper.text()).toContain('affects all chats using it')
    await wrapper.get('[data-testid="chat-model-select"]').setValue('gpt-6-luna')
    expect(provider.model).toBe('gpt-5.3')
    expect(save).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="create-chat-btn"]').trigger('click')
    await flushPromises()
    expect(provider.model).toBe('gpt-6-luna')
    expect(provider.changed).toBe(true)
    expect(save).toHaveBeenCalledOnce()
    expect(newChat).toHaveBeenCalledWith('openai', '', undefined, '')
    wrapper.unmount()
  })

  it('discards a cancelled model change when reopened', async () => {
    const { wrapper, provider, save } = setup()
    await wrapper.get('[data-testid="chat-model-select"]').setValue('gpt-6-luna')
    await wrapper.get('[data-testid="cancel-chat-create"]').trigger('click')
    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    expect(
      (wrapper.get('select[data-testid="chat-model-select"]').element as HTMLSelectElement).value,
    ).toBe('gpt-5.3')
    expect(provider.model).toBe('gpt-5.3')
    expect(save).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('uses the newly selected connection’s models and preserves a saved model missing from the list', async () => {
    const { wrapper, other } = setup('')
    other.models = []
    await wrapper.get('[data-testid="llm-connection-select"]').setValue('other')
    expect(wrapper.get('[data-testid="chat-model-select"]').text()).toBe('gpt-6-astra')
    expect(
      (wrapper.get('[data-testid="chat-model-select"]').element as HTMLSelectElement).value,
    ).toBe('gpt-6-astra')
    wrapper.unmount()
  })

  it('keeps the dialog open and restores the model if persistence fails', async () => {
    const { wrapper, provider, save, newChat } = setup()
    save.mockRejectedValue(new Error('storage unavailable'))
    await wrapper.get('[data-testid="chat-model-select"]').setValue('gpt-6-luna')
    await wrapper.get('[data-testid="create-chat-btn"]').trigger('click')
    await flushPromises()
    expect(provider.model).toBe('gpt-5.3')
    expect(newChat).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not save')
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })
})
