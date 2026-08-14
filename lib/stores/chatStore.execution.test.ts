import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import useChatStore from './chatStore'

/**
 * Execution lifecycle tests for chatStore.executeMessage: run supersession,
 * stop semantics, and failure feedback. The LLM is a controllable deferred so
 * tests decide exactly when each request resolves.
 */

interface DeferredCall {
  resolve: (value: any) => void
  reject: (error: any) => void
  options: any
}

function makeDeferredLLM(opts: { rejectOnAbort?: boolean } = {}) {
  const calls: DeferredCall[] = []
  const generateCompletion = vi.fn(
    (_connectionName: string, options: any) =>
      new Promise((resolve, reject) => {
        if (opts.rejectOnAbort !== false) {
          // Real providers reject the in-flight fetch on abort — and rewrap
          // the DOMException into a plain Error, which is exactly the case
          // the store's abort detection must survive.
          options.signal?.addEventListener?.('abort', () =>
            reject(new Error('Provider error: Aborted')),
          )
        }
        calls.push({ resolve, reject, options })
      }),
  )
  return { calls, generateCompletion }
}

const makeDeps = (llm: ReturnType<typeof makeDeferredLLM>, activeConnection = 'llm-1') =>
  ({
    llmConnectionStore: {
      activeConnection,
      connections: {},
      generateCompletion: llm.generateCompletion,
    },
    connectionStore: { connections: {}, connectionByName: () => undefined },
    queryExecutionService: {},
    editorStore: { editors: {}, getEditorByName: () => undefined },
  }) as any

const makeOverrides = () => ({
  tools: [],
  executeToolCall: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  buildSystemPrompt: () => 'sys',
  terminateOnNoToolCall: true,
})

describe('chatStore.executeMessage lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('a superseded run must not clobber the new run or leave error bubbles', async () => {
    const store = useChatStore()
    const chat = store.newChat('llm-1')
    const llm = makeDeferredLLM()
    const deps = makeDeps(llm)

    const run1 = store.executeMessage(chat.id, 'first question', deps, {
      overrides: makeOverrides(),
    })
    await vi.waitFor(() => expect(llm.calls.length).toBe(1))

    // Second send on the same chat aborts run 1 and takes over the record.
    const run2 = store.executeMessage(chat.id, 'second question', deps, {
      overrides: makeOverrides(),
    })
    await run1

    // Run 1 finished (aborted) — but run 2 still owns the loading state.
    expect(store.isChatExecuting(chat.id)).toBe(true)

    await vi.waitFor(() => expect(llm.calls.length).toBe(2))
    llm.calls[1].resolve({ text: 'the answer', toolCalls: [] })
    await run2

    expect(store.isChatExecuting(chat.id)).toBe(false)
    // The aborted run's provider-wrapped error must not surface as a chat error.
    expect(chat.messages.some((m) => m.error)).toBe(false)
    expect(chat.messages.map((m) => m.content)).toContain('the answer')
  })

  it('a user stop does not fire queued injections (no self-restart)', async () => {
    const store = useChatStore()
    const chat = store.newChat('llm-1')
    chat.pendingInjections.push('[subchat finished while busy]')
    const llm = makeDeferredLLM({ rejectOnAbort: false })
    const deps = makeDeps(llm)

    const run = store.executeMessage(chat.id, 'go do things', deps, {
      overrides: makeOverrides(),
    })
    await vi.waitFor(() => expect(llm.calls.length).toBe(1))

    store.stopExecution(chat.id)
    // The in-flight response lands after the stop; the loop detects the abort.
    llm.calls[0].resolve({ text: 'partial', toolCalls: [] })
    await run

    expect(store.isChatExecuting(chat.id)).toBe(false)
    // The injection stays queued for the next run instead of restarting the
    // agent the user just stopped.
    expect(chat.pendingInjections).toHaveLength(1)
    expect(llm.generateCompletion).toHaveBeenCalledTimes(1)
  })

  it('a send with no LLM connection persists the message and a visible error', async () => {
    const store = useChatStore()
    const chat = store.newChat('')
    const llm = makeDeferredLLM()
    const deps = makeDeps(llm, '')

    await store.executeMessage(chat.id, 'hello?', deps, { overrides: makeOverrides() })

    // The user's text must not silently vanish (chat UIs render from the store).
    expect(chat.messages.some((m) => m.role === 'user' && m.content === 'hello?')).toBe(true)
    const errorMsg = chat.messages.find((m) => m.error)
    expect(errorMsg?.content).toContain('No LLM connection available')
    expect(llm.generateCompletion).not.toHaveBeenCalled()
  })

  it('an execution error survives in the execution record (finally must not wipe it)', async () => {
    const store = useChatStore()
    const chat = store.newChat('llm-1')
    const llm = makeDeferredLLM()
    const deps = makeDeps(llm)

    const run = store.executeMessage(chat.id, 'boom', deps, { overrides: makeOverrides() })
    await vi.waitFor(() => expect(llm.calls.length).toBe(1))
    llm.calls[0].reject(new Error('rate limited hard'))
    await run

    expect(store.getChatExecution(chat.id)?.error).toBe('rate limited hard')
    expect(chat.messages.some((m) => m.error && m.content.includes('rate limited hard'))).toBe(true)
  })
})
