import { describe, it, expect } from 'vitest'
import type { LLMMessage } from './base'
import { estimateHistoryTokens, estimateMessageTokens, estimateTextTokens } from './tokenEstimate'

describe('estimateTextTokens', () => {
  it('approximates 4 characters per token', () => {
    expect(estimateTextTokens('')).toBe(0)
    expect(estimateTextTokens(undefined)).toBe(0)
    expect(estimateTextTokens('x'.repeat(400))).toBe(100)
  })
})

describe('estimateMessageTokens', () => {
  it('charges tool call inputs and tool result bodies', () => {
    const plain: LLMMessage = { role: 'user', content: 'x'.repeat(400) }
    const withResult: LLMMessage = {
      role: 'user',
      content: '',
      toolResults: [{ toolCallId: '1', toolName: 'run_trilogy_query', result: 'y'.repeat(4000) }],
    }
    expect(estimateMessageTokens(plain)).toBeGreaterThanOrEqual(100)
    expect(estimateMessageTokens(withResult)).toBeGreaterThan(1000)
  })

  it('charges an image a flat rate rather than its base64 length', () => {
    const base64 = 'A'.repeat(200_000)
    const withImage: LLMMessage = {
      role: 'user',
      content: '',
      toolResults: [
        {
          toolCallId: '1',
          toolName: 'screenshot',
          result: 'ok',
          imageData: { data: base64, mediaType: 'image/png' },
        },
      ],
    }
    // 200k base64 chars would be 50k tokens at 4 chars/token — images are
    // billed nowhere near that.
    expect(estimateMessageTokens(withImage)).toBeLessThan(5_000)
    expect(estimateMessageTokens(withImage)).toBeGreaterThan(1_000)
  })

  it('survives non-serializable tool inputs', () => {
    const cyclic: any = {}
    cyclic.self = cyclic
    const message: LLMMessage = {
      role: 'assistant',
      content: 'hi',
      toolCalls: [{ id: '1', name: 'weird', input: cyclic }],
    }
    expect(() => estimateMessageTokens(message)).not.toThrow()
  })
})

describe('estimateHistoryTokens', () => {
  it('sums the history', () => {
    const messages: LLMMessage[] = [
      { role: 'user', content: 'x'.repeat(400) },
      { role: 'assistant', content: 'x'.repeat(400) },
    ]
    expect(estimateHistoryTokens(messages)).toBe(
      estimateMessageTokens(messages[0]) + estimateMessageTokens(messages[1]),
    )
  })
})
