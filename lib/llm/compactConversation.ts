import type { Chat, ChatMessage } from '../chats/chat'
import type { LLMProvider } from './base'
import { formatTranscript } from './subchatSummarize'
import { SYSTEM_INPUT_START, SYSTEM_INPUT_END } from './toolLoopCore'

/** Approximate input-context size that triggers automatic compaction before
 *  the next run. */
export const COMPACTION_THRESHOLD_TOKENS = 200_000

/** Never bother summarizing fewer messages than this. */
const MIN_ARCHIVE_COUNT = 6

const DEFAULT_KEEP_RECENT = 12

const COMPACTION_SYSTEM_PROMPT =
  'You are compacting the early history of a long-running assistant conversation. ' +
  'Read the transcript below (messages and tool calls) and produce a 300-600 word summary that preserves: ' +
  "the user's goals; key decisions and their rationale; what was built or changed (editor, dashboard, job, connection names and ids); " +
  'the current state of the work; and unresolved items or open questions. ' +
  'The assistant will rely on this summary INSTEAD of the original messages — omit nothing it would need to continue seamlessly. ' +
  'Do not editorialize or add recommendations.'

export interface CompactionResult {
  archivedCount: number
  summary: string
}

/** A safe cut point starts a fresh turn: cutting immediately before it can
 *  never separate an assistant toolCalls message from its paired toolResults
 *  message (those are adjacent by construction in the tool loop). */
function isSafeCutPoint(message: ChatMessage): boolean {
  return (
    message.role === 'user' &&
    !message.hidden &&
    !(message.toolResults && message.toolResults.length > 0)
  )
}

function buildArtifactIndex(chat: Chat): string {
  const artifacts = chat.artifacts.filter((a) => !a.hidden)
  if (artifacts.length === 0) return ''
  const lines = artifacts.map((a) => {
    const title = a.config?.title || a.config?.query?.slice(0, 60) || ''
    const rows = a.config?.resultSize != null ? `, ${a.config.resultSize} rows` : ''
    return `- [${a.id}] ${a.type}${title ? ` "${title}"` : ''}${rows}`
  })
  // Built programmatically, not by the model, so ids are exact.
  return `\n\nArtifacts still available via get_artifact/get_artifact_rows:\n${lines.join('\n')}`
}

async function summarizeMessages(
  provider: LLMProvider,
  messages: ChatMessage[],
  focus?: string,
): Promise<string> {
  const transcript = formatTranscript(messages)
  const fastModel = provider.getFastModel()
  const originalModel = provider.model
  const swap = !!fastModel && fastModel !== originalModel

  try {
    if (swap) provider.model = fastModel
    const response = await provider.generateCompletion(
      {
        prompt: '',
        systemPrompt: focus
          ? `${COMPACTION_SYSTEM_PROMPT}\n\nAdditional emphasis requested: ${focus}`
          : COMPACTION_SYSTEM_PROMPT,
      },
      [{ role: 'user', content: `--- TRANSCRIPT ---\n${transcript}` }],
    )
    return response.text.trim()
  } finally {
    if (swap) provider.model = originalModel
  }
}

/**
 * Compact a conversation: summarize everything before a safe cut point via
 * the provider's fast model, mark those messages archived (never deleted),
 * and insert a hidden summary message at the cut. The running tool loop keeps
 * its local history, so compaction takes effect from the next request that
 * rebuilds history via chat.getLLMMessages().
 *
 * Cache note: this changes the message prefix (one-time message-cache miss on
 * the next request) but never touches the frozen tools+system prefix.
 *
 * Returns null when there is not enough history to be worth compacting.
 */
export async function compactChat(
  provider: LLMProvider,
  chat: Chat,
  opts: { focus?: string; keepRecentCount?: number } = {},
): Promise<CompactionResult | null> {
  const keepRecent = opts.keepRecentCount ?? DEFAULT_KEEP_RECENT
  const live = chat.getLLMMessages()
  if (live.length < keepRecent + MIN_ARCHIVE_COUNT) return null

  // Keep at least keepRecent messages, extending the kept range backward to
  // the nearest safe boundary.
  let cut = live.length - keepRecent
  while (cut > 0 && !isSafeCutPoint(live[cut])) {
    cut--
  }
  if (cut < MIN_ARCHIVE_COUNT) return null

  const toArchive = live.slice(0, cut)
  const summary = await summarizeMessages(provider, toArchive, opts.focus)

  // Mutations happen only after the summary call succeeds.
  toArchive.forEach((message) => {
    message.archived = true
  })
  const cutMessage = live[cut]
  const insertAt = chat.messages.indexOf(cutMessage)
  const summaryMessage: ChatMessage = {
    role: 'user',
    hidden: true,
    compaction: true,
    content: `${SYSTEM_INPUT_START}[Conversation compacted. Summary of the earlier conversation:]\n\n${summary}${buildArtifactIndex(chat)}${SYSTEM_INPUT_END}`,
  }
  chat.messages.splice(insertAt < 0 ? 0 : insertAt, 0, summaryMessage)
  chat.updatedAt = new Date()
  chat.changed = true

  return { archivedCount: toArchive.length, summary }
}
