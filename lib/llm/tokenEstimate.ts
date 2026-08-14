/**
 * Cheap, provider-agnostic token estimation.
 *
 * Providers report exact usage only *after* a request, so anything that has to
 * reason about history size before sending (compaction retention budgets, the
 * fallback compaction trigger for chats restored from storage) needs a local
 * approximation. ~4 characters per token is the usual English/code heuristic;
 * it runs long on dense JSON and short on prose, which is fine here — every
 * consumer treats the result as a budget, not a bill.
 */

import type { LLMMessage } from './base'

export const CHARS_PER_TOKEN = 4

/** Per-message envelope (role marker, delimiters) charged by every provider. */
const MESSAGE_OVERHEAD_TOKENS = 4

/** Per tool call / tool result envelope (id, name, JSON braces). */
const TOOL_ENVELOPE_TOKENS = 8

/**
 * Flat charge for an attached image. Base64 length is a terrible proxy — it
 * would put a screenshot at tens of thousands of tokens — so use a figure in
 * the range vision models actually bill for a full-size image.
 */
const IMAGE_TOKENS = 1600

export function estimateTextTokens(text: string | undefined | null): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function estimateMessageTokens(message: LLMMessage): number {
  let tokens = MESSAGE_OVERHEAD_TOKENS + estimateTextTokens(message.content)

  for (const call of message.toolCalls ?? []) {
    tokens += TOOL_ENVELOPE_TOKENS + estimateTextTokens(call.name)
    try {
      tokens += estimateTextTokens(JSON.stringify(call.input))
    } catch {
      // Non-serializable input (cycles) — the name overhead alone will do.
    }
  }

  for (const result of message.toolResults ?? []) {
    tokens += TOOL_ENVELOPE_TOKENS + estimateTextTokens(result.toolName)
    tokens += estimateTextTokens(result.result)
    if (result.imageData) tokens += IMAGE_TOKENS
  }

  return tokens
}

export function estimateHistoryTokens(messages: LLMMessage[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0)
}
