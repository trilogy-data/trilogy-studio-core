/**
 * Shared subchat summarization. Used in two places:
 *
 *   1. Subchat completion injection (chatStore.handleSubchatCompletion) —
 *      so the overseer ALWAYS gets a summary, even when the LLM hit the
 *      tool iteration limit or returned text without calling return_to_user.
 *      Without this, the overseer just sees "(no summary)" and tends to
 *      spawn redundant retry subchats.
 *
 *   2. Overseer's peek_subchat tool — so the overseer can poke a still-
 *      running subchat and get a quick read.
 *
 * Both paths run a one-shot completion against the subchat's transcript
 * using the provider's fastModel (falls back to its main model). The model
 * swap is reverted in a finally so persistence sees the original.
 */

import type { Chat, ChatMessage } from '../chats/chat'
import type { LLMProvider } from './base'

export type SummarizeContext = 'completion' | 'peek'

const COMPLETION_SYSTEM_PROMPT =
  "You are summarizing a subchat that has just finished. Read the transcript below " +
  '(messages and tool calls) and produce a 2–4 sentence summary of what was accomplished, ' +
  'what (if anything) failed or remains, and any concrete artifacts (file names, queries, ' +
  'errors). Be specific. The overseer will use this report to update the user — there is ' +
  'no other source of truth, so do not omit important results.'

const PEEK_SYSTEM_PROMPT =
  "You are summarizing a subchat's progress for an overseer agent. Read the transcript " +
  'below (messages and tool calls) and produce a concise 2–4 sentence summary of what has ' +
  'happened so far, what has been accomplished, and what (if anything) remains. Be specific ' +
  'about file names, queries, or errors. Do not editorialize.'

/**
 * Run the subchat's transcript through the provider's fastModel and return
 * a summary string. Throws on LLM error — callers decide whether to fall
 * back to a stub.
 */
export async function summarizeSubchat(
  provider: LLMProvider,
  subchat: Chat,
  context: SummarizeContext = 'completion',
): Promise<string> {
  const transcript = formatTranscript(subchat.messages)
  const systemPrompt = context === 'completion' ? COMPLETION_SYSTEM_PROMPT : PEEK_SYSTEM_PROMPT

  const fastModel = provider.getFastModel()
  const originalModel = provider.model
  const swap = !!fastModel && fastModel !== originalModel

  try {
    if (swap) provider.model = fastModel
    const response = await provider.generateCompletion({ prompt: '', systemPrompt }, [
      {
        role: 'user',
        content:
          `Subchat kind: ${subchat.kind}\n` +
          `Name: ${subchat.name}\n\n` +
          `--- TRANSCRIPT ---\n${transcript}`,
      },
    ])
    return response.text.trim()
  } finally {
    if (swap) provider.model = originalModel
  }
}

/** Flatten a transcript: role + content + each tool call/result, lightly truncated. */
export function formatTranscript(messages: ChatMessage[]): string {
  return messages
    .map((m, i) => {
      const lines: string[] = [`[${i}] ${m.role}: ${truncate(m.content || '', 800)}`]
      if (m.toolCalls && m.toolCalls.length > 0) {
        for (const tc of m.toolCalls) {
          lines.push(`  → ${tc.name}(${truncate(JSON.stringify(tc.input), 200)})`)
        }
      }
      if (m.toolResults && m.toolResults.length > 0) {
        for (const tr of m.toolResults) {
          lines.push(`  ← ${tr.toolName}: ${truncate(tr.result, 300)}`)
        }
      }
      return lines.join('\n')
    })
    .join('\n\n')
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}
