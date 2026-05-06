/**
 * Overseer agent — orchestrates work via subchats. The overseer does NOT
 * query data directly; it delegates to architect (model setup) or analyst
 * (analysis / dashboards) subchats, monitors them, and reports back to the
 * user.
 *
 * Subchats run asynchronously. When a subchat terminates, its summary is
 * injected into the overseer's conversation as a hidden user message and
 * the overseer wakes up to react. This keeps the user looking at one
 * persistent chat while the actual work happens in delegated agents.
 */

import { RETURN_TO_USER_TOOL } from './chatAgentPrompt'

export type SubchatKind = 'architect' | 'analyst'

export const SUBCHAT_KINDS: SubchatKind[] = ['architect', 'analyst']

export interface SubchatStatus {
  id: string
  kind: SubchatKind
  status: 'running' | 'idle' | 'errored'
  /** Last assistant message content (truncated) — gives the overseer a quick
   *  read on what the subchat is up to without dumping full transcripts. */
  lastMessage?: string
}

export interface OverseerPromptOptions {
  /** Optional name of the workspace / project the overseer is responsible for. */
  projectName?: string
  /** Optional brief description of the workspace's purpose. */
  projectDescription?: string
  /** Snapshot of subchats — populated each iteration so the overseer always
   *  sees current state. Empty array when no subchats exist yet. */
  subchats: SubchatStatus[]
  /** Names of available data connections (subchats use these). */
  availableConnections: string[]
  /** Names of attached editors / files in the workspace. */
  availableEditors: string[]
  /** Optional instructions text that replaces OVERSEER_DEFAULT_INSTRUCTIONS.
   *  Dynamic workspace context (files, connections, subchats) is still
   *  appended automatically. */
  instructionsOverride?: string
}

/** Analyst preamble. Sits above the generic chat-agent prompt and is the
 *  overridable portion for analyst subchats — the rest of the analyst prompt
 *  (Trilogy syntax, tool guidance, etc.) is shared with the standalone chat
 *  agent and stays in lockstep with it. */
export const ANALYST_DEFAULT_INSTRUCTIONS = `You are an ANALYST subchat. Your job is to answer the overseer's question — run queries, build charts, surface findings. When done, call return_to_user with a concise summary the overseer can show the user.`

/** Static instructions block — overridable per-project. */
export const OVERSEER_DEFAULT_INSTRUCTIONS = `You are the OVERSEER of a Trilogy Explorer workspace. Your job is to coordinate work — never to query data directly.

ORCHESTRATION RULES:
- You delegate work to two kinds of subchat: 'architect' (sets up data models from raw files — registers tables, defines Trilogy concepts) and 'analyst' (runs queries, builds charts, produces dashboards).
- You have NO direct query tools. Always delegate via spawn_subchat.
- Subchats run asynchronously. spawn_subchat returns immediately with a subchat id and 'running' status. When the subchat finishes, its summary appears in your conversation as a system-injected message and you'll be re-invoked to react.
- You may follow up with a running OR finished subchat via send_to_subchat — useful for clarifying questions or asking it to extend its work.
- list_subchats gives you the current snapshot at any time (also visible in the prompt above).
- When you've handled the user's request and have nothing more to delegate or report, call return_to_user with a concise summary.

DELEGATION GUIDELINES:
- Architect subchats: use for "set up a model", "load these files", "define concepts for X", schema work.
- Analyst subchats: use for "show me revenue trend", "build a dashboard", "what does the data look like", any question that produces results or visuals.
- Give subchats a complete, self-contained task description — they don't see your conversation with the user. Include any relevant file names, connection names, or constraints.
- Don't spawn redundant subchats. Check ACTIVE SUBCHATS first; if one is already handling something, follow up with send_to_subchat instead.`

function describeSubchat(s: SubchatStatus): string {
  const last = s.lastMessage ? ` — "${truncate(s.lastMessage, 120)}"` : ''
  return `  - ${s.id} [${s.kind}] (${s.status})${last}`
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}

export function buildOverseerSystemPrompt(options: OverseerPromptOptions): string {
  const {
    projectName,
    projectDescription,
    subchats,
    availableConnections,
    availableEditors,
    instructionsOverride,
  } = options

  const subchatBlock =
    subchats.length > 0
      ? `ACTIVE SUBCHATS:\n${subchats.map(describeSubchat).join('\n')}`
      : 'No subchats spawned yet.'

  const editorsLine =
    availableEditors.length > 0
      ? `Attached files: ${availableEditors.join(', ')}`
      : 'No files attached yet.'

  const instructions = instructionsOverride?.trim() || OVERSEER_DEFAULT_INSTRUCTIONS

  const contextBlock = `WORKSPACE: ${projectName || 'unnamed'}${projectDescription ? `\n${projectDescription}` : ''}

${editorsLine}
DATA CONNECTIONS: ${availableConnections.length > 0 ? availableConnections.join(', ') : 'none configured'}

${subchatBlock}`

  return `${instructions}

${contextBlock}
`
}

// Overseer's tool list. Deliberately minimal — no direct data tools.
export const OVERSEER_TOOLS = [
  {
    name: 'spawn_subchat',
    description:
      "Delegate work to a new subchat. Returns immediately with the subchat's id; the subchat runs asynchronously and its summary is injected back into your conversation when it terminates. Use 'architect' for data model setup, 'analyst' for queries / analysis / charts.",
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: SUBCHAT_KINDS,
          description:
            "'architect' for data model / schema work; 'analyst' for queries, analysis, and charts.",
        },
        task: {
          type: 'string',
          description:
            'A complete, self-contained task description for the subchat. Include relevant file names, connection names, and constraints — the subchat does not see your conversation history.',
        },
        name: {
          type: 'string',
          description:
            'Optional short label for this subchat (shown in the UI). Defaults to the first words of the task.',
        },
      },
      required: ['kind', 'task'],
    },
  },
  {
    name: 'send_to_subchat',
    description:
      'Send a follow-up message to an existing subchat (running or idle). Returns immediately; the subchat resumes asynchronously and its updated summary is injected back when it next terminates.',
    input_schema: {
      type: 'object',
      properties: {
        subchat_id: {
          type: 'string',
          description: 'Id of the subchat to send to. Use list_subchats to discover available ids.',
        },
        message: { type: 'string', description: 'The follow-up message content.' },
      },
      required: ['subchat_id', 'message'],
    },
  },
  {
    name: 'list_subchats',
    description:
      'List all subchats in this workspace with their current status and last message. Use to check on delegated work without spawning new chats.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'peek_subchat',
    description:
      "Get a quick natural-language summary of what a (still-running OR finished) subchat has been doing. Uses a cheap fast model and reads the subchat's full transcript including tool calls. Use when you want a sense of progress without waiting for the subchat to terminate, or to recall what a finished one accomplished.",
    input_schema: {
      type: 'object',
      properties: {
        subchat_id: { type: 'string', description: 'Id of the subchat to summarize.' },
      },
      required: ['subchat_id'],
    },
  },
  {
    name: 'delete_subchat',
    description:
      "Delete a finished subchat from the workspace. Use to prune retry attempts or experiments that are no longer relevant — keeps the sidebar uncluttered. Refuses while a subchat is still running; ask the user to stop it first if you really need to delete a live one.",
    input_schema: {
      type: 'object',
      properties: {
        subchat_id: { type: 'string', description: 'Id of the subchat to delete.' },
      },
      required: ['subchat_id'],
    },
  },
  RETURN_TO_USER_TOOL,
]
