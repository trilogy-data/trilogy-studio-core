import { describe, it, expect, vi } from 'vitest'
import { Chat, type ChatMessage } from '../chats/chat'
import {
  compactChat,
  compactHistory,
  maybeCompactChat,
  shouldCompact,
  type CompactableHistory,
  DEFAULT_COMPACTION_THRESHOLD_TOKENS,
} from './compaction'

const makeProvider = (summary = 'Summary of earlier work.') => {
  const generateCompletion = vi.fn().mockResolvedValue({
    text: summary,
    usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
  })
  return {
    model: 'big-model',
    getFastModel: () => 'fast-model',
    getCompactionThresholdTokens: () => DEFAULT_COMPACTION_THRESHOLD_TOKENS,
    generateCompletion,
  } as any
}

/** A realistic turn: user ask, assistant tool call, hidden tool results,
 *  assistant answer. */
const turn = (n: number, filler = ''): ChatMessage[] => [
  { role: 'user', content: `question ${n}` },
  {
    role: 'assistant',
    content: `working on ${n}`,
    toolCalls: [{ id: `tc-${n}`, name: 'run_trilogy_query', input: { query: 'select 1;' } }],
  },
  {
    role: 'user',
    content: '',
    hidden: true,
    toolResults: [{ toolCallId: `tc-${n}`, toolName: 'run_trilogy_query', result: `ok${filler}` }],
  },
  { role: 'assistant', content: `answer ${n}` },
]

const makeChat = (turns: number): Chat => {
  const chat = new Chat({ name: 'test' })
  for (let i = 0; i < turns; i++) {
    chat.messages.push(...turn(i))
  }
  return chat
}

describe('compactChat', () => {
  it('no-ops on short conversations', async () => {
    const chat = makeChat(3) // 12 messages — the recent tail covers all of it
    const provider = makeProvider()
    expect(await compactChat(provider, chat)).toBeNull()
    expect(provider.generateCompletion).not.toHaveBeenCalled()
  })

  it('archives early history behind a hidden summary at a safe boundary', async () => {
    const chat = makeChat(10) // 40 messages
    const provider = makeProvider()
    const result = await compactChat(provider, chat)
    expect(result).not.toBeNull()
    expect(result!.archivedCount).toBeGreaterThanOrEqual(6)

    // The summary message sits where the archive ends, hidden and flagged.
    const summaryIdx = chat.messages.findIndex((m) => m.compaction)
    expect(summaryIdx).toBeGreaterThan(0)
    expect(chat.messages[summaryIdx].hidden).toBe(true)
    expect(chat.messages[summaryIdx].content).toContain('Summary of earlier work.')

    // Every message before the summary is archived; none after it is.
    chat.messages.slice(0, summaryIdx).forEach((m) => expect(m.archived).toBe(true))
    chat.messages.slice(summaryIdx + 1).forEach((m) => expect(m.archived).toBeUndefined())

    // The LLM view = summary + kept tail; original messages still exist.
    const llmView = chat.getLLMMessages()
    expect(llmView[0].compaction).toBe(true)
    expect(chat.messages.length).toBe(41)
  })

  it('never separates a toolCalls message from its toolResults pair', async () => {
    const chat = makeChat(10)
    const provider = makeProvider()
    await compactChat(provider, chat)
    const llmView = chat.getLLMMessages()
    // The first non-summary message must be a turn-starting user message.
    const first = llmView[1]
    expect(first.role).toBe('user')
    expect(first.toolResults).toBeUndefined()
    expect(first.hidden).toBeFalsy()
  })

  it('does not mutate history when summarization fails', async () => {
    const chat = makeChat(10)
    const provider = makeProvider()
    provider.generateCompletion.mockRejectedValueOnce(new Error('llm down'))
    await expect(compactChat(provider, chat)).rejects.toThrow('llm down')
    expect(chat.messages.some((m) => m.archived)).toBe(false)
    expect(chat.messages.some((m) => m.compaction)).toBe(false)
  })

  it('includes an exact artifact index and honors focus', async () => {
    const chat = makeChat(10)
    chat.artifacts.push({ id: 'art-1', type: 'results', data: {}, config: { resultSize: 42 } })
    chat.artifacts.push({ id: 'art-2', type: 'chart', data: {}, hidden: true })
    const provider = makeProvider()
    await compactChat(provider, chat, { focus: 'keep the SQL exact' })

    const summaryMessage = chat.messages.find((m) => m.compaction)!
    expect(summaryMessage.content).toContain('[art-1] results')
    expect(summaryMessage.content).toContain('42 rows')
    expect(summaryMessage.content).not.toContain('art-2')

    const [options] = provider.generateCompletion.mock.calls[0]
    expect(options.systemPrompt).toContain('keep the SQL exact')
  })

  it('asks for a structured summary in a standalone request', async () => {
    const chat = makeChat(10)
    const provider = makeProvider()
    await compactChat(provider, chat)

    const [options, history] = provider.generateCompletion.mock.calls[0]
    expect(options.systemPrompt).toContain('context summarization assistant')
    expect(options.systemPrompt).toContain('## Goal')
    expect(options.systemPrompt).toContain('## Open items')
    // Standalone: the transcript is the whole request, not a continuation of
    // the conversation being compacted.
    expect(options.prompt).toBe('')
    expect(history).toHaveLength(1)
    expect(history[0].content).toContain('--- TRANSCRIPT ---')
  })

  it('swaps to the fast model and restores it', async () => {
    const chat = makeChat(10)
    const provider = makeProvider()
    let modelDuringCall = ''
    provider.generateCompletion.mockImplementation(async () => {
      modelDuringCall = provider.model
      return { text: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
    })
    await compactChat(provider, chat)
    expect(modelDuringCall).toBe('fast-model')
    expect(provider.model).toBe('big-model')
  })

  it('compacts chats driven entirely by hidden injections (overseer wake-ups)', async () => {
    // An overseer woken only via hiddenUserMessage injections has no visible
    // user turns; hidden non-toolResults user messages must count as safe
    // cuts or such chats can never compact and grow unbounded.
    const chat = new Chat({ name: 'overseer' })
    for (let i = 0; i < 10; i++) {
      chat.messages.push(
        { role: 'user', content: `[subchat ${i} completed] summary`, hidden: true },
        { role: 'assistant', content: `dispatching next step ${i}` },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: `tc-${i}`, name: 'spawn_subchat', input: {} }],
        },
        {
          role: 'user',
          content: '',
          hidden: true,
          toolResults: [{ toolCallId: `tc-${i}`, toolName: 'spawn_subchat', result: 'ok' }],
        },
      )
    }
    const provider = makeProvider()
    const result = await compactChat(provider, chat)
    expect(result).not.toBeNull()
    // The cut still never lands on a toolResults message.
    const llmView = chat.getLLMMessages()
    const first = llmView[1]
    expect(first.toolResults).toBeUndefined()
  })

  it('aborts (returns null) when the chat is cleared during summarization', async () => {
    const chat = makeChat(10)
    const provider = makeProvider()
    provider.generateCompletion.mockImplementation(async () => {
      // Simulate the user clearing the conversation mid-summarize.
      chat.clearMessages()
      return { text: 'ghost summary', usage: { promptTokens: 1, completionTokens: 1 } }
    })
    const result = await compactChat(provider, chat)
    expect(result).toBeNull()
    // The ghost summary must not be spliced into the fresh conversation.
    expect(chat.messages.some((m) => m.compaction)).toBe(false)
    expect(chat.messages.some((m) => m.archived)).toBe(false)
  })

  it('second compaction archives the summary of the first coherently', async () => {
    const chat = makeChat(10)
    const provider = makeProvider('first summary')
    await compactChat(provider, chat)
    // Grow the conversation again.
    for (let i = 10; i < 20; i++) chat.messages.push(...turn(i))
    provider.generateCompletion.mockResolvedValue({
      text: 'second summary',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    })
    const result = await compactChat(provider, chat)
    expect(result).not.toBeNull()
    const llmView = chat.getLLMMessages()
    // Exactly one live summary message (the new one); the first is archived.
    const liveSummaries = llmView.filter((m) => m.compaction)
    expect(liveSummaries).toHaveLength(1)
    expect(liveSummaries[0].content).toContain('second summary')
  })
})

describe('retention budget', () => {
  it('keeps fewer messages when recent ones are large', async () => {
    // 10 turns whose tool results are ~15k tokens each: the 20k budget is
    // filled by a couple of turns, so far more history is archived than the
    // message-count ceiling alone would give.
    const chat = new Chat({ name: 'heavy' })
    for (let i = 0; i < 10; i++) chat.messages.push(...turn(i, 'x'.repeat(60_000)))
    const provider = makeProvider()

    const result = await compactChat(provider, chat)
    expect(result).not.toBeNull()
    const kept = chat.getLLMMessages().length - 1 // minus the summary
    expect(kept).toBeLessThan(20) // the count ceiling would have kept 20
    expect(kept).toBeGreaterThanOrEqual(6) // ...but never fewer than the floor
  })

  it('honors an explicit keepRecentTokens budget', async () => {
    const chat = new Chat({ name: 'heavy' })
    for (let i = 0; i < 10; i++) chat.messages.push(...turn(i, 'x'.repeat(60_000)))
    const provider = makeProvider()

    // A far larger budget keeps the tail long enough to hit the count ceiling.
    await compactChat(provider, chat, { keepRecentTokens: 200_000 })
    expect(chat.getLLMMessages().length - 1).toBe(20)
  })
})

describe('shouldCompact', () => {
  const history = { messages: [], getLLMMessages: () => [] } as CompactableHistory

  it('is disabled at threshold 0', () => {
    expect(shouldCompact(history, 0, 5_000_000)).toBe(false)
  })

  it('compares the reported context size against the threshold', () => {
    expect(shouldCompact(history, 100_000, 100_001)).toBe(true)
    expect(shouldCompact(history, 100_000, 100_000)).toBe(false)
  })

  it('falls back to estimating the live history when nothing was reported', () => {
    const chat = makeChat(10)
    expect(shouldCompact(chat, 10)).toBe(true)
    expect(shouldCompact(chat, 1_000_000)).toBe(false)
  })
})

describe('maybeCompactChat', () => {
  const grownChat = () => {
    const chat = makeChat(10)
    chat.lastContextTokens = 250_000
    return chat
  }

  it('compacts past the connection threshold and re-arms the trigger', async () => {
    const chat = grownChat()
    const provider = makeProvider()
    const result = await maybeCompactChat(provider, chat)
    expect(result).not.toBeNull()
    expect(chat.lastContextTokens).toBeUndefined()
  })

  it('respects a raised per-connection threshold', async () => {
    const chat = grownChat()
    const provider = makeProvider()
    provider.getCompactionThresholdTokens = () => 500_000
    expect(await maybeCompactChat(provider, chat)).toBeNull()
    expect(provider.generateCompletion).not.toHaveBeenCalled()
  })

  it('respects a lowered per-connection threshold', async () => {
    const chat = makeChat(10)
    chat.lastContextTokens = 60_000
    const provider = makeProvider()
    provider.getCompactionThresholdTokens = () => 50_000
    expect(await maybeCompactChat(provider, chat)).not.toBeNull()
  })

  it('never compacts when the connection disables it', async () => {
    const chat = grownChat()
    const provider = makeProvider()
    provider.getCompactionThresholdTokens = () => 0
    expect(await maybeCompactChat(provider, chat)).toBeNull()
    expect(provider.generateCompletion).not.toHaveBeenCalled()
  })

  it('swallows summarization failures so the turn can proceed', async () => {
    const chat = grownChat()
    const provider = makeProvider()
    provider.generateCompletion.mockRejectedValueOnce(new Error('llm down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeCompactChat(provider, chat)).toBeNull()
    expect(chat.messages.some((m) => m.archived)).toBe(false)
    spy.mockRestore()
  })
})

describe('compactHistory on a plain message array', () => {
  it('compacts any history holder, not just Chat', async () => {
    // The shape a ref-array-backed loop (useToolLoop) exposes.
    const messages: ChatMessage[] = []
    for (let i = 0; i < 10; i++) messages.push(...turn(i))
    const history: CompactableHistory<ChatMessage> = {
      messages,
      getLLMMessages: () => messages.filter((m) => !m.archived),
    }
    const provider = makeProvider('array summary')

    const result = await compactHistory(provider, history, { appendix: '\n\n[extra context]' })
    expect(result).not.toBeNull()

    const summary = messages.find((m) => m.hidden && m.content.includes('array summary'))!
    expect(summary).toBeDefined()
    expect(summary.content).toContain('[extra context]')
    expect(messages.filter((m) => m.archived)).toHaveLength(result!.archivedCount)
    // Nothing was deleted — archived + summary + kept tail.
    expect(messages.length).toBe(41)
  })
})
