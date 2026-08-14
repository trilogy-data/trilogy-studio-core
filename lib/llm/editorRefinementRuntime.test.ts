import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ensureRefinementChat,
  sendRefinementMessage,
  disposeRefinementChat,
  clearRefinementPrompt,
} from './editorRefinementRuntime'

const makeStores = () => {
  const chats: Record<string, any> = {}
  const sessions: Record<string, any> = {
    'ed-1': {
      messages: [],
      artifacts: [],
      originalContent: 'select 1;',
      currentContent: 'select 1;',
    },
  }
  const editorStore = {
    editors: {
      'ed-1': {
        id: 'ed-1',
        name: 'my_query',
        type: 'preql',
        connection: 'duckdb',
        contents: 'select 1;',
        completionSymbols: [],
        results: null,
        get refinementSession() {
          return sessions['ed-1']
        },
      },
    },
    updateRefinementSession: vi.fn((id: string, updates: any) => {
      sessions[id] = { ...sessions[id], ...updates }
    }),
    acceptRefinement: vi.fn((_id: string, callbacks?: any) => {
      callbacks?.onFinish?.('Changes accepted')
      sessions['ed-1'] = null
    }),
  } as any
  const chatStore = {
    chats,
    addChat: vi.fn((chat: any) => {
      chats[chat.id] = chat
    }),
    executeMessage: vi.fn().mockResolvedValue(undefined),
    isChatExecuting: vi.fn(() => false),
    stopExecution: vi.fn(),
    removeChat: vi.fn((id: string) => {
      if (chats[id]) chats[id].deleted = true
    }),
  } as any
  const llmConnectionStore = { activeConnection: 'llm-1', connections: {} } as any
  return { editorStore, chatStore, llmConnectionStore, sessions }
}

const makeDeps = (stores: ReturnType<typeof makeStores>) =>
  ({
    llmConnectionStore: stores.llmConnectionStore,
    connectionStore: { connections: {}, connectionByName: () => undefined },
    queryExecutionService: {},
    editorStore: stores.editorStore,
  }) as any

describe('editorRefinementRuntime', () => {
  let stores: ReturnType<typeof makeStores>

  beforeEach(() => {
    stores = makeStores()
  })

  it('creates an ephemeral editor-source chat once and reuses it', () => {
    const first = ensureRefinementChat('ed-1', stores)
    expect(first).toBeTruthy()
    const chat = stores.chatStore.chats[first!]
    expect(chat.source).toBe('editor')
    expect(chat.storage).toBe('ephemeral')
    expect(chat.sourceRefId).toBe('ed-1')
    expect(stores.editorStore.updateRefinementSession).toHaveBeenCalledWith('ed-1', {
      refinementChatId: first,
    })

    const second = ensureRefinementChat('ed-1', stores)
    expect(second).toBe(first)
    expect(stores.chatStore.addChat).toHaveBeenCalledTimes(1)
  })

  it('runs through chatStore.executeMessage with editor tools, frozen prompt, and 20 iterations', async () => {
    await sendRefinementMessage({
      editorId: 'ed-1',
      message: 'add a filter',
      stores,
      deps: makeDeps(stores),
    })
    expect(stores.chatStore.executeMessage).toHaveBeenCalledTimes(1)
    const [chatId, message, , options] = stores.chatStore.executeMessage.mock.calls[0]
    expect(chatId).toBe(stores.sessions['ed-1'].refinementChatId)
    expect(message).toBe('add a filter')
    expect(options.overrides.maxIterations).toBe(20)
    expect(options.overrides.tools.some((t: any) => t.name === 'edit_editor')).toBe(true)

    // Frozen prompt: identical across calls even when editor content changes.
    const providerFirst = options.overrides.buildSystemPrompt()
    stores.sessions['ed-1'].currentContent = 'select 2;'
    expect(options.overrides.buildSystemPrompt()).toBe(providerFirst)
    clearRefinementPrompt(chatId)
  })

  it('disposes the backing chat (stopping any run)', () => {
    const chatId = ensureRefinementChat('ed-1', stores)!
    stores.chatStore.isChatExecuting.mockReturnValueOnce(true)
    disposeRefinementChat('ed-1', stores)
    expect(stores.chatStore.stopExecution).toHaveBeenCalledWith(chatId)
    expect(stores.chatStore.removeChat).toHaveBeenCalledWith(chatId)
  })

  it('accepts the session after the loop when the agent calls close_session', async () => {
    // close_session fires mid-loop via onFinish; the session must be cleared
    // only AFTER executeMessage resolves (never mid-run), via acceptRefinement.
    let orderLog: string[] = []
    stores.chatStore.executeMessage.mockImplementation(
      async (_id: string, _msg: string, _deps: any, options: any) => {
        await options.overrides.executeToolCall('close_session', {})
        orderLog.push('loop-finished')
      },
    )
    stores.editorStore.acceptRefinement.mockImplementation((_id: string, callbacks?: any) => {
      orderLog.push('accepted')
      callbacks?.onFinish?.()
    })

    const onFinish = vi.fn()
    await sendRefinementMessage({
      editorId: 'ed-1',
      message: 'done, close it',
      stores,
      deps: makeDeps(stores),
      callbacks: { onFinish },
    })

    expect(stores.editorStore.acceptRefinement).toHaveBeenCalledTimes(1)
    expect(orderLog).toEqual(['loop-finished', 'accepted'])
    expect(onFinish).toHaveBeenCalled()
  })

  it('retargets the selection range after a length-changing replaceSelection edit', async () => {
    stores.sessions['ed-1'].selectedText = 'select 1;'
    stores.sessions['ed-1'].selectionRange = { start: 0, end: 9 }

    stores.chatStore.executeMessage.mockImplementation(
      async (_id: string, _msg: string, _deps: any, options: any) => {
        await options.overrides.executeToolCall('edit_editor', {
          content: 'select 42;',
          replaceSelection: true,
        })
      },
    )

    await sendRefinementMessage({
      editorId: 'ed-1',
      message: 'change the constant',
      stores,
      deps: makeDeps(stores),
    })

    const session = stores.sessions['ed-1']
    expect(session.currentContent).toBe('select 42;')
    // Follow-up selection edits must splice against the NEW offsets.
    expect(session.selectionRange).toEqual({ start: 0, end: 10 })
    expect(session.selectedText).toBe('select 42;')
  })
})
