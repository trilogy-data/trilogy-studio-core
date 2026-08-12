import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  sendGlobalChatMessage,
  getFrozenPromptProvider,
  clearFrozenPrompt,
  resetFrozenPromptsForTests,
  buildUnifiedSystemPrompt,
  getCurrentScreenContext,
  maybeGenerateChatName,
} from './globalChatRuntime'
import useScreenNavigation from '../stores/useScreenNavigation'
import { getSharedRegistry } from './registry'

const makeDeps = () =>
  ({
    llmConnectionStore: { activeConnection: 'llm-1', connections: {} },
    connectionStore: { connections: { c1: { name: 'duckdb', type: 'duckdb', connected: true } } },
    queryExecutionService: {},
    editorStore: { editors: {}, getEditorByName: () => undefined },
  }) as any

describe('globalChatRuntime', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    window.location.hash = ''
    resetFrozenPromptsForTests()
  })

  it('materializes a pending context note as a hidden message before executing', async () => {
    const added: any[] = []
    const chat = { id: 'chat-1', pendingContextNote: '[navigation] on jobs screen' }
    const chatStore = {
      chats: { 'chat-1': chat },
      addMessageToChat: (_id: string, msg: any) => added.push(msg),
      executeMessage: vi.fn().mockResolvedValue(undefined),
    } as any

    await sendGlobalChatMessage({
      chatId: 'chat-1',
      message: 'hello',
      chatStore,
      deps: makeDeps(),
    })

    expect(added).toHaveLength(1)
    expect(added[0].hidden).toBe(true)
    expect(added[0].role).toBe('user')
    expect(added[0].content).toContain('[navigation] on jobs screen')
    expect(added[0].content).toContain('<system_input>')
    expect(chat.pendingContextNote).toBeNull()

    // The note lands before executeMessage appends the real user message.
    expect(chatStore.executeMessage).toHaveBeenCalledTimes(1)
    const [chatId, message, , options] = chatStore.executeMessage.mock.calls[0]
    expect(chatId).toBe('chat-1')
    expect(message).toBe('hello')
    expect(options.overrides.tools).toBe(getSharedRegistry().getToolsetForContext('global'))
  })

  it('does not add a note message when none is pending', async () => {
    const added: any[] = []
    const chatStore = {
      chats: { 'chat-1': { id: 'chat-1', pendingContextNote: null } },
      addMessageToChat: (_id: string, msg: any) => added.push(msg),
      executeMessage: vi.fn().mockResolvedValue(undefined),
    } as any

    await sendGlobalChatMessage({ chatId: 'chat-1', message: 'hi', chatStore, deps: makeDeps() })
    expect(added).toHaveLength(0)
  })

  it('freezes the system prompt per conversation', () => {
    const deps = makeDeps()
    const provider = getFrozenPromptProvider('chat-1', deps)
    const first = provider()
    // Mutating live state must not change the frozen prompt.
    deps.connectionStore.connections.c2 = { name: 'bigquery', type: 'bigquery', connected: false }
    const second = provider()
    expect(second).toBe(first)

    // A different conversation snapshots fresh state.
    const other = getFrozenPromptProvider('chat-2', deps)()
    expect(other).not.toBe(first)

    // Clearing lets the conversation re-snapshot.
    clearFrozenPrompt('chat-1')
    const rebuilt = getFrozenPromptProvider('chat-1', deps)()
    expect(rebuilt).not.toBe(first)
    expect(rebuilt).toContain('bigquery')
  })

  it('unified prompt documents app-control tools but bakes in no live screen state', () => {
    const prompt = buildUnifiedSystemPrompt(makeDeps())
    expect(prompt).toContain('get_app_state')
    expect(prompt).toContain('open_dashboard')
    expect(prompt).toContain('update_editor_contents')
    expect(prompt).toContain('STUDIO APP CONTROL')
    // Live state stays out of the frozen prompt (cache stability).
    expect(prompt).not.toContain('Active screen:')
  })

  describe('maybeGenerateChatName', () => {
    const makeNamingSetup = (name: string, messages: any[]) => {
      const chat = {
        id: 'chat-1',
        name,
        deleted: false,
        llmConnectionName: 'llm-1',
        messages,
      }
      const chatStore = {
        chats: { 'chat-1': chat },
        updateChatName: vi.fn((_id: string, newName: string) => {
          chat.name = newName
        }),
      } as any
      const deps = makeDeps()
      deps.llmConnectionStore.generateChatName = vi.fn().mockResolvedValue('Sales Deep Dive')
      return { chat, chatStore, deps }
    }

    const exchange = [
      { role: 'user', content: 'show me sales' },
      { role: 'assistant', content: 'Here you go.' },
    ]

    it('renames a chat still carrying the default name after an exchange', async () => {
      const { chatStore, deps } = makeNamingSetup('Chat 3:45:12 PM', exchange)
      await maybeGenerateChatName('chat-1', chatStore, deps)
      expect(deps.llmConnectionStore.generateChatName).toHaveBeenCalledWith('llm-1', exchange)
      expect(chatStore.updateChatName).toHaveBeenCalledWith('chat-1', 'Sales Deep Dive')
    })

    it('never renames a user-titled chat', async () => {
      const { chatStore, deps } = makeNamingSetup('My Analysis', exchange)
      await maybeGenerateChatName('chat-1', chatStore, deps)
      expect(deps.llmConnectionStore.generateChatName).not.toHaveBeenCalled()
    })

    it('waits for an assistant reply before naming', async () => {
      const { chatStore, deps } = makeNamingSetup('Chat 3:45:12 PM', [
        { role: 'user', content: 'show me sales' },
      ])
      await maybeGenerateChatName('chat-1', chatStore, deps)
      expect(deps.llmConnectionStore.generateChatName).not.toHaveBeenCalled()
    })

    it('swallows naming failures', async () => {
      const { chatStore, deps } = makeNamingSetup('Chat 3:45:12 PM', exchange)
      deps.llmConnectionStore.generateChatName = vi.fn().mockRejectedValue(new Error('nope'))
      await expect(maybeGenerateChatName('chat-1', chatStore, deps)).resolves.toBeUndefined()
      expect(chatStore.updateChatName).not.toHaveBeenCalled()
    })

    it('skips the rename if the user renamed mid-generation', async () => {
      const { chat, chatStore, deps } = makeNamingSetup('Chat 3:45:12 PM', exchange)
      deps.llmConnectionStore.generateChatName = vi.fn().mockImplementation(async () => {
        chat.name = 'Renamed By Hand'
        return 'Sales Deep Dive'
      })
      await maybeGenerateChatName('chat-1', chatStore, deps)
      expect(chatStore.updateChatName).not.toHaveBeenCalled()
    })
  })

  it('reads the current screen context from the navigation singleton', () => {
    const nav = useScreenNavigation()
    nav.activeScreen.value = 'dashboard' as any
    nav.activeDashboard.value = 'd-9'
    const context = getCurrentScreenContext()
    expect(context.screen).toBe('dashboard')
    expect(context.dashboardId).toBe('d-9')
  })
})
