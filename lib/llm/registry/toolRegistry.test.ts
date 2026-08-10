import { describe, it, expect, beforeEach } from 'vitest'
import { ToolRegistry } from './toolRegistry'
import { buildDefaultRegistry, resetSharedRegistryForTests, getSharedRegistry } from './index'
import { CHAT_TOOLS } from '../chatAgentPrompt'
import type { RegisteredTool } from './types'
import type { ToolCallResult } from '../sharedToolHelpers'

const fakeTool = (name: string, pack: RegisteredTool['pack'] = 'base'): RegisteredTool => ({
  definition: {
    name,
    description: `${name} description.`,
    input_schema: { type: 'object', properties: {} },
  },
  pack,
  execute: async () => ({ success: true, message: `${name} ran` }) as ToolCallResult,
})

const context = () =>
  [
    { connectionStore: {}, editorStore: {}, chatStore: {}, queryExecutionService: {} } as any,
    { chatId: 'chat-1', cache: new Map() },
  ] as const

describe('ToolRegistry', () => {
  beforeEach(() => {
    resetSharedRegistryForTests()
  })

  it('golden: chat context toolset deep-equals the legacy CHAT_TOOLS array', () => {
    // This is the release gate for "the tool union changed": any drift here
    // means the tool array sent to providers changed, which busts the
    // Anthropic prompt-cache prefix for every existing conversation.
    const registry = buildDefaultRegistry()
    expect(registry.getToolsetForContext('chat')).toEqual([...CHAT_TOOLS])
  })

  it('returns the same array instance per context (memoized identity)', () => {
    const registry = buildDefaultRegistry()
    const first = registry.getToolsetForContext('chat')
    const second = registry.getToolsetForContext('chat')
    expect(first).toBe(second)
  })

  it('shared registry is a stable instance', () => {
    expect(getSharedRegistry()).toBe(getSharedRegistry())
  })

  it('rejects duplicate tool names', () => {
    const registry = new ToolRegistry()
    registry.register(fakeTool('alpha'))
    expect(() => registry.register(fakeTool('alpha'))).toThrow(/already registered/)
  })

  it('preserves registration order in toolsets', () => {
    const registry = new ToolRegistry()
    registry.registerAll([fakeTool('b', 'data'), fakeTool('a', 'artifacts'), fakeTool('c', 'base')])
    expect(registry.getToolNames('chat')).toEqual(['b', 'a', 'c'])
  })

  it('dispatches to the registered execute function', async () => {
    const registry = new ToolRegistry()
    registry.register(fakeTool('alpha'))
    const executor = registry.createExecutor('chat', ...context())
    const result = await executor.executeToolCall('alpha', {})
    expect(result.success).toBe(true)
    expect(result.message).toBe('alpha ran')
  })

  it('returns a generated unknown-tool error listing available names', async () => {
    const registry = new ToolRegistry()
    registry.registerAll([fakeTool('alpha', 'data'), fakeTool('beta', 'base')])
    const executor = registry.createExecutor('chat', ...context())
    const result = await executor.executeToolCall('missing', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown tool: missing')
    expect(result.error).toContain('alpha')
    expect(result.error).toContain('beta')
  })

  it('rejects tools outside the context toolset even if registered', async () => {
    const registry = new ToolRegistry()
    registry.register(fakeTool('jobs-only', 'jobs'))
    const executor = registry.createExecutor('chat', ...context())
    const result = await executor.executeToolCall('jobs-only', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown tool')
  })

  it('short-circuits on failed availability with the hint', async () => {
    const registry = new ToolRegistry()
    let executed = false
    registry.register({
      ...fakeTool('guarded'),
      availability: () => ({ available: false, hint: 'No dashboard is currently open.' }),
      execute: async () => {
        executed = true
        return { success: true }
      },
    })
    const executor = registry.createExecutor('chat', ...context())
    const result = await executor.executeToolCall('guarded', {})
    expect(result.success).toBe(false)
    expect(result.error).toBe('No dashboard is currently open.')
    expect(executed).toBe(false)
  })

  it('converts a throwing tool into a failed result', async () => {
    const registry = new ToolRegistry()
    registry.register({
      ...fakeTool('boom'),
      execute: async () => {
        throw new Error('kaput')
      },
    })
    const executor = registry.createExecutor('chat', ...context())
    const result = await executor.executeToolCall('boom', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('kaput')
  })
})
