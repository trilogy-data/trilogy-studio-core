import { CHAT_TOOLS } from '../../chatAgentPrompt'
import { ChatToolExecutor } from '../../chatToolExecutor'
import type { LLMToolDefinition } from '../../base'
import type { RegisteredTool, ToolContext, ToolPackId } from '../types'

// Phase-transition note: these packs re-export the existing CHAT_TOOLS
// definitions verbatim (same object identity) and delegate execution to the
// existing ChatToolExecutor, so routing the chat path through the registry is
// a zero-behavior change. Definitions migrate into per-pack modules as the
// packs grow their own tools.

const DATA_TOOL_NAMES = [
  'run_trilogy_query',
  'chart_trilogy_query',
  'select_active_import',
  'list_available_imports',
  'connect_data_connection',
] as const

const ARTIFACT_TOOL_NAMES = [
  'create_markdown',
  'list_artifacts',
  'get_artifact',
  'get_artifact_rows',
  'update_artifact',
  'hide_artifact',
  'reorder_artifacts',
] as const

const BASE_TOOL_NAMES = ['return_to_user'] as const

function chatToolDefinition(name: string): LLMToolDefinition {
  const def = (CHAT_TOOLS as readonly LLMToolDefinition[]).find((tool) => tool.name === name)
  if (!def) {
    throw new Error(`CHAT_TOOLS is missing expected tool '${name}'`)
  }
  return def
}

/** Session-memoized ChatToolExecutor: artifacts and imports live on the chat,
 *  so one executor instance per conversation run is both correct and cheap.
 *  Exported for sibling packs that reuse its public helpers (validateQuery). */
export function getChatExecutor(ctx: ToolContext): ChatToolExecutor {
  const key = 'chatToolExecutor'
  let executor = ctx.session.cache.get(key) as ChatToolExecutor | undefined
  if (!executor) {
    executor = new ChatToolExecutor(
      ctx.runtime.queryExecutionService,
      ctx.runtime.connectionStore,
      ctx.runtime.chatStore,
      ctx.runtime.editorStore,
      ctx.session.chatId,
    )
    ctx.session.cache.set(key, executor)
  }
  return executor
}

function wrapChatTools(names: readonly string[], pack: ToolPackId): RegisteredTool[] {
  return names.map((name) => ({
    definition: chatToolDefinition(name),
    pack,
    execute: (input, ctx) => getChatExecutor(ctx).executeToolCall(name, input),
  }))
}

export function buildDataPack(): RegisteredTool[] {
  return wrapChatTools(DATA_TOOL_NAMES, 'data')
}

export function buildArtifactsPack(): RegisteredTool[] {
  return wrapChatTools(ARTIFACT_TOOL_NAMES, 'artifacts')
}

export function buildBasePack(): RegisteredTool[] {
  return wrapChatTools(BASE_TOOL_NAMES, 'base')
}
