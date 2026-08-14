import { describe, it, expect } from 'vitest'
import { Chat } from './chat'

describe('Chat', () => {
  describe('getLLMMessages', () => {
    it('excludes UI-only artifact-carrier messages from LLM history', () => {
      const chat = new Chat()
      chat.addMessage({ role: 'user', content: 'run a query' })
      chat.addMessage({
        role: 'assistant',
        content: '',
        artifact: { id: 'art-1', type: 'results', data: { headers: [], data: [] } },
      })
      chat.addMessage({ role: 'assistant', content: 'Here are your results.' })

      const llm = chat.getLLMMessages()
      expect(llm).toHaveLength(2)
      expect(llm.some((m) => m.artifact)).toBe(false)
    })

    it('keeps artifact messages that carry text or tool calls', () => {
      const chat = new Chat()
      chat.addMessage({
        role: 'assistant',
        content: 'Chart attached.',
        artifact: { id: 'art-1', type: 'chart', data: {} },
      })
      chat.addMessage({
        role: 'assistant',
        content: '',
        artifact: { id: 'art-2', type: 'chart', data: {} },
        toolCalls: [{ id: 't1', name: 'chart_trilogy_query', input: {} }],
      })

      expect(chat.getLLMMessages()).toHaveLength(2)
    })

    it('still excludes archived messages', () => {
      const chat = new Chat()
      chat.addMessage({ role: 'user', content: 'old', archived: true })
      chat.addMessage({ role: 'user', content: 'new' })

      const llm = chat.getLLMMessages()
      expect(llm).toHaveLength(1)
      expect(llm[0].content).toBe('new')
    })
  })

  describe('clearMessages', () => {
    it('resets messages, artifacts, and the compaction trigger', () => {
      const chat = new Chat()
      chat.addMessage({ role: 'user', content: 'hello' })
      chat.addArtifact({ id: 'art-1', type: 'results', data: {} })
      chat.lastContextTokens = 250_000

      chat.clearMessages()

      expect(chat.messages).toHaveLength(0)
      expect(chat.artifacts).toHaveLength(0)
      expect(chat.activeArtifactIndex).toBe(-1)
      expect(chat.lastContextTokens).toBeUndefined()
    })
  })
})
