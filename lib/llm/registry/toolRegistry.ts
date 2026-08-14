import type { LLMToolDefinition } from '../base'
import type { ToolCallResult } from '../sharedToolHelpers'
import type { RegisteredTool, ToolPackId, ToolRuntime, ToolSession, ToolContext } from './types'

/** Named toolset compositions. 'chat' is the studio chat screen's classic
 *  toolset; 'global' (the persistent sidebar panel's union) and the scoped
 *  editor/dashboard contexts arrive in later phases. */
export type ToolsetContextId = 'chat' | 'global' | 'editor-trilogy' | 'editor-sql' | 'dashboard'

const TOOLSET_PACKS: Record<ToolsetContextId, ToolPackId[]> = {
  chat: ['data', 'artifacts', 'base'],
  // Placeholder compositions until their packs land; resolving a context only
  // uses packs that have registered tools, so these are safe to declare early.
  global: [
    'data',
    'artifacts',
    'navigation',
    'editor',
    'dashboard',
    'jobs',
    'docs',
    'context',
    'base',
  ],
  'editor-trilogy': ['data', 'editor', 'docs', 'base'],
  'editor-sql': ['editor', 'docs', 'base'],
  dashboard: ['data', 'dashboard', 'docs', 'base'],
}

export interface RegistryExecutor {
  executeToolCall(toolName: string, toolInput: Record<string, any>): Promise<ToolCallResult>
}

/**
 * Central registry pairing tool definitions with their executors.
 *
 * Cache contract: `getToolsetForContext` returns the SAME array instance per
 * context, in registration order. The tool array is part of the Anthropic
 * prompt-cache prefix (tools render before system), so it must be byte-stable
 * across every turn of a conversation — never build toolsets with per-call
 * closures or conditional definitions.
 */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>() // insertion-ordered
  private toolsetCache = new Map<ToolsetContextId, LLMToolDefinition[]>()

  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool '${tool.definition.name}' is already registered`)
    }
    this.tools.set(tool.definition.name, tool)
    // Registration mutates composition; drop memoized toolsets. Registration
    // happens only at registry construction, so this never fires mid-conversation.
    this.toolsetCache.clear()
  }

  registerAll(tools: RegisteredTool[]): void {
    tools.forEach((tool) => this.register(tool))
  }

  private toolsForContext(ctx: ToolsetContextId): RegisteredTool[] {
    const packs = TOOLSET_PACKS[ctx]
    if (!packs) {
      throw new Error(`Unknown toolset context '${ctx}'`)
    }
    const packSet = new Set(packs)
    return [...this.tools.values()].filter((tool) => packSet.has(tool.pack))
  }

  /** Memoized, deterministically ordered (registration order) tool definitions
   *  for a context. Same array instance on every call — see cache contract. */
  getToolsetForContext(ctx: ToolsetContextId): LLMToolDefinition[] {
    let cached = this.toolsetCache.get(ctx)
    if (!cached) {
      cached = this.toolsForContext(ctx).map((tool) => tool.definition)
      this.toolsetCache.set(ctx, cached)
    }
    return cached
  }

  getToolNames(ctx: ToolsetContextId): string[] {
    return this.toolsForContext(ctx).map((tool) => tool.definition.name)
  }

  /** Executor conforming to the shape ToolExecutorFactory expects. Context
   *  (runtime + session) is bound once per execution run; tools re-read live
   *  state (navigation, screenBridge) from the runtime at call time. */
  createExecutor(
    ctx: ToolsetContextId,
    runtime: ToolRuntime,
    session: ToolSession,
  ): RegistryExecutor {
    const packSet = new Set(TOOLSET_PACKS[ctx])
    const context: ToolContext = { runtime, session }
    return {
      executeToolCall: async (toolName, toolInput) => {
        const tool = this.tools.get(toolName)
        if (!tool || !packSet.has(tool.pack)) {
          return {
            success: false,
            error: `Unknown tool: ${toolName}. Available tools: ${this.getToolNames(ctx).join(', ')}`,
          }
        }
        if (tool.availability) {
          const availability = tool.availability(context)
          if (!availability.available) {
            return { success: false, error: availability.hint }
          }
        }
        try {
          return await tool.execute(toolInput, context)
        } catch (err) {
          // Belt-and-braces: runToolLoop also catches, but a registry-level
          // catch keeps one tool's throw from ever looking like a loop crash.
          const message = err instanceof Error ? err.message : String(err)
          return { success: false, error: `Tool '${toolName}' failed: ${message}` }
        }
      },
    }
  }
}
