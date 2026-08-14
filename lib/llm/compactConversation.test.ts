import { describe, it, expect, vi } from 'vitest'
import { Chat, type ChatMessage } from '../chats/chat'
import { compactChat } from './compactConversation'

const makeProvider = (summary = 'Summary of earlier work.') => {
  const generateCompletion = vi.fn().mockResolvedValue({
    text: summary,
    usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
  })
  return {
    model: 'big-model',
    getFastModel: () => 'fast-model',
    generateCompletion,
  } as any
}

/** A realistic turn: user ask, assistant tool call, hidden tool results,
 *  assistant answer. */
const turn = (n: number): ChatMessage[] => [
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
    toolResults: [{ toolCallId: `tc-${n}`, toolName: 'run_trilogy_query', result: 'ok' }],
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
    const chat = makeChat(3) // 12 messages < keepRecent + min
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
