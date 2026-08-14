/**
 * Generic conversation compaction.
 *
 * When a conversation approaches the model's context window, everything before
 * a safe cut point is replaced by a summary produced in a *standalone* request
 * (its own system prompt, no conversation history, run on the provider's fast
 * model). The archived messages are flagged, never deleted, so the UI can still
 * render them and unarchiving stays trivial.
 *
 *   before:  [system][tools][old turns ............][recent turns]
 *   after:   [system][tools][summary][recent turns]
 *
 * Retention is a token budget, not a message count: the recent tail is kept
 * verbatim until ~keepRecentTokens is filled, so a handful of huge tool results
 * costs the same as many small turns. A message-count floor keeps the current
 * turn intact, and a ceiling makes long chats of tiny messages compactable too.
 *
 * The core (`compactHistory`) works on anything exposing a message array plus
 * the LLM-visible view of it, so it serves `Chat` and ad-hoc ref-array
 * histories alike. `compactChat` is the `Chat` binding.
 *
 * Cache note: compaction rewrites the message prefix (a one-time message-cache
 * miss on the next request) but never touches the frozen tools+system prefix.
 */

import type { Chat, ChatMessage } from '../chats/chat'
import type { LLMMessage, LLMProvider } from './base'
import { DEFAULT_COMPACTION_THRESHOLD_TOKENS } from './consts'
import { formatTranscript } from './subchatSummarize'
import { estimateHistoryTokens, estimateMessageTokens } from './tokenEstimate'
import { SYSTEM_INPUT_START, SYSTEM_INPUT_END } from './toolLoopCore'

export { DEFAULT_COMPACTION_THRESHOLD_TOKENS }

/** Token budget of recent history preserved verbatim through a compaction. */
export const DEFAULT_KEEP_RECENT_TOKENS = 20_000

/** Never keep fewer than this many recent messages, however large they are —
 *  cutting closer would strand the turn currently in progress. */
const DEFAULT_MIN_KEEP_RECENT = 6

/** Never keep more than this many recent messages, however small they are —
 *  otherwise a long chat of tiny turns could never be compacted. */
const DEFAULT_MAX_KEEP_RECENT = 20

/** Below this, summarizing costs more than it saves. */
const DEFAULT_MIN_ARCHIVE_COUNT = 6

const COMPACTION_SYSTEM_PROMPT =
  'You are a context summarization assistant. You are given the earlier portion of an ' +
  'assistant conversation that is about to fall out of the context window. Produce a structured ' +
  'summary that the assistant will rely on INSTEAD of those messages.\n\n' +
  'Use exactly these sections:\n' +
  '## Goal — what the user is ultimately trying to accomplish.\n' +
  '## Progress — what was built, changed, or discovered, with exact names and ids (editors, ' +
  'dashboards, jobs, connections, queries, fields).\n' +
  '## Key decisions — choices made and why, including approaches tried and rejected.\n' +
  '## Current state — where the work stands right now.\n' +
  '## Open items — unresolved questions, known failures, and obvious next steps.\n\n' +
  'Be concrete: prefer exact identifiers, query text and error messages over paraphrase. ' +
  'Aim for 300-600 words. Omit nothing the assistant would need to continue seamlessly. ' +
  'Do not editorialize and do not add recommendations of your own.'

export interface CompactionResult {
  archivedCount: number
  summary: string
}

/**
 * Anything compaction can operate on: the full history (mutated in place) plus
 * the subset currently sent to the model. `Chat` satisfies this structurally.
 */
export interface CompactableHistory<M extends LLMMessage = LLMMessage> {
  messages: M[]
  getLLMMessages(): M[]
}

export interface CompactionOptions<M extends LLMMessage = LLMMessage> {
  /** Extra emphasis for the summarizer (from the user or the compact tool). */
  focus?: string
  /** Token budget of recent history kept verbatim. Default 20k. */
  keepRecentTokens?: number
  minKeepRecentCount?: number
  maxKeepRecentCount?: number
  minArchiveCount?: number
  /** Appended verbatim to the summary. Built programmatically by the caller —
   *  never by the model — so identifiers in it are exact. */
  appendix?: string
  /** Wrap the summary in the caller's message flavour (extra flags, ids). */
  createSummaryMessage?: (content: string) => M
  /** Called after the history has been mutated, for persistence bookkeeping. */
  onCompacted?: (result: CompactionResult) => void
}

/**
 * A safe cut point starts a fresh turn: cutting immediately before it can never
 * separate an assistant toolCalls message from its paired toolResults message
 * (those are adjacent by construction in the tool loop; the results message is
 * the only user message carrying toolResults). Hidden user messages without
 * toolResults (system notes, injections) are safe cuts too — chats driven
 * purely by hidden injections (e.g. an overseer woken by subchat completions)
 * would otherwise never find a cut point and could never compact.
 */
function isSafeCutPoint(message: LLMMessage): boolean {
  return message.role === 'user' && !(message.toolResults && message.toolResults.length > 0)
}

/**
 * Index of the first message to keep: fill the recent-token budget walking
 * backward, clamp by the count floor/ceiling, then extend the kept range
 * backward to the nearest safe boundary. Returns -1 when there is not enough
 * history to be worth compacting.
 */
function findCutPoint<M extends LLMMessage>(live: M[], opts: CompactionOptions<M>): number {
  const budget = opts.keepRecentTokens ?? DEFAULT_KEEP_RECENT_TOKENS
  const minKeep = opts.minKeepRecentCount ?? DEFAULT_MIN_KEEP_RECENT
  const maxKeep = opts.maxKeepRecentCount ?? DEFAULT_MAX_KEEP_RECENT
  const minArchive = opts.minArchiveCount ?? DEFAULT_MIN_ARCHIVE_COUNT

  let kept = 0
  let tokens = 0
  for (let i = live.length - 1; i >= 0; i--) {
    if (kept >= maxKeep) break
    if (kept >= minKeep && tokens >= budget) break
    tokens += estimateMessageTokens(live[i])
    kept++
  }

  let cut = live.length - kept
  while (cut > 0 && !isSafeCutPoint(live[cut])) {
    cut--
  }
  return cut < minArchive ? -1 : cut
}

/**
 * Should this history be compacted before the next request?
 *
 * `reportedContextTokens` is the provider-reported input size of the last
 * request (prompt + cached input) — the accurate signal. Chats restored from
 * storage, or providers that report no usage, fall back to a local estimate;
 * that estimate excludes the system prompt and tool definitions, so it trips
 * slightly later, which is the safe direction.
 */
export function shouldCompact(
  history: CompactableHistory<any>,
  thresholdTokens: number,
  reportedContextTokens?: number,
): boolean {
  if (!thresholdTokens || thresholdTokens <= 0) return false
  const tokens = reportedContextTokens ?? estimateHistoryTokens(history.getLLMMessages())
  return tokens > thresholdTokens
}

async function summarizeMessages(
  provider: LLMProvider,
  messages: LLMMessage[],
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

function defaultSummaryMessage<M extends LLMMessage>(content: string): M {
  return { role: 'user', hidden: true, content } as M
}

/**
 * Compact any history: summarize everything before a safe cut point via the
 * provider's fast model, mark those messages archived (never deleted), and
 * insert a hidden summary message at the cut.
 *
 * A running tool loop keeps its own local copy of the history, so compaction
 * takes effect from the next request that rebuilds it — callers should compact
 * between turns, not mid-loop.
 *
 * Returns null when there is not enough history to be worth compacting, or when
 * the history changed underneath us while the summary was being generated.
 */
export async function compactHistory<M extends LLMMessage = LLMMessage>(
  provider: LLMProvider,
  history: CompactableHistory<M>,
  opts: CompactionOptions<M> = {},
): Promise<CompactionResult | null> {
  const live = history.getLLMMessages()
  const cut = findCutPoint(live, opts)
  if (cut < 0) return null

  const toArchive = live.slice(0, cut)
  const summary = await summarizeMessages(provider, toArchive, opts.focus)

  // The history may have been cleared or rebuilt during the summarize await —
  // splicing a summary of erased history into a fresh conversation would be
  // wrong, so bail out before mutating anything.
  const insertAt = history.messages.indexOf(live[cut])
  if (insertAt < 0) return null

  // Mutations happen only after the summary call succeeds.
  toArchive.forEach((message) => {
    message.archived = true
  })
  const createSummaryMessage = opts.createSummaryMessage ?? defaultSummaryMessage
  const content = `${SYSTEM_INPUT_START}[Conversation compacted. Summary of the earlier conversation:]\n\n${summary}${opts.appendix ?? ''}${SYSTEM_INPUT_END}`
  history.messages.splice(insertAt, 0, createSummaryMessage(content))

  const result = { archivedCount: toArchive.length, summary }
  opts.onCompacted?.(result)
  return result
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

/** Compact a `Chat`: the generic core plus the artifact index, the `compaction`
 *  flag the UI keys off, and persistence bookkeeping. */
export async function compactChat(
  provider: LLMProvider,
  chat: Chat,
  opts: CompactionOptions<ChatMessage> = {},
): Promise<CompactionResult | null> {
  return compactHistory<ChatMessage>(provider, chat, {
    ...opts,
    appendix: opts.appendix ?? buildArtifactIndex(chat),
    createSummaryMessage:
      opts.createSummaryMessage ??
      ((content) => ({ role: 'user', hidden: true, compaction: true, content })),
    onCompacted: (result) => {
      chat.updatedAt = new Date()
      chat.changed = true
      opts.onCompacted?.(result)
    },
  })
}

/**
 * Auto-compaction entry point: compact only if the chat has grown past the
 * provider's configured threshold. Failure is non-fatal — the caller's turn
 * proceeds uncompacted rather than erroring out.
 */
export async function maybeCompactChat(
  provider: LLMProvider,
  chat: Chat,
  opts: CompactionOptions<ChatMessage> = {},
): Promise<CompactionResult | null> {
  if (!shouldCompact(chat, provider.getCompactionThresholdTokens(), chat.lastContextTokens)) {
    return null
  }
  try {
    const result = await compactChat(provider, chat, opts)
    // Re-arm the trigger only once a real request has re-measured the context.
    if (result) chat.lastContextTokens = undefined
    return result
  } catch (err) {
    console.error('Automatic conversation compaction failed:', err)
    return null
  }
}
