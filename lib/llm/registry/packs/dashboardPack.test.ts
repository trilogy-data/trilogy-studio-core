import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildDashboardPack } from './dashboardPack'
import { ensureChatForkForMutation, resetForkGuardForTests } from '../../dashboardAgentRuntime'
import type { RegisteredTool, ToolContext } from '../types'

const toolByName = (tools: RegisteredTool[], name: string): RegisteredTool => {
  const tool = tools.find((t) => t.definition.name === name)
  if (!tool) throw new Error(`missing tool ${name}`)
  return tool
}

const makeDashboard = (id: string, opts: { items?: number; parent?: string } = {}) => ({
  id,
  name: `Dash ${id}`,
  connection: 'duckdb',
  layoutType: 'grid',
  parentDashboardId: opts.parent ?? null,
  gridItems: Object.fromEntries(
    Array.from({ length: opts.items ?? 0 }, (_, i) => [`item-${i}`, {}]),
  ),
  deleted: false,
  chatId: null as string | null,
  setChatId(next: string | null) {
    this.chatId = next
  },
})

const makeStores = () => {
  const dashboards: Record<string, any> = {
    'd-empty': makeDashboard('d-empty'),
    'd-full': makeDashboard('d-full', { items: 3 }),
    'd-derived': makeDashboard('d-derived', { items: 3, parent: 'd-full' }),
  }
  const dashboardStore = {
    dashboards,
    forkDashboard: vi.fn((id: string, name: string) => {
      const fork = makeDashboard(`${id}-fork-${name}`, { items: 3, parent: id })
      dashboards[fork.id] = fork
      return fork
    }),
    updateDashboardImports: vi.fn(),
  } as any
  const chatStore = {
    chats: {
      'chat-global': { id: 'chat-global', sourceRefId: null, messages: [], changed: false },
      'chat-bound': {
        id: 'chat-bound',
        sourceRefId: 'd-full',
        messages: [
          {
            role: 'assistant',
            executedToolCalls: [
              { name: 'add_dashboard_item', input: {}, id: 'x', result: { success: true } },
            ],
          },
        ],
        changed: false,
      },
    },
  } as any
  return { dashboardStore, chatStore }
}

describe('ensureChatForkForMutation', () => {
  beforeEach(() => resetForkGuardForTests())

  it('edits derived dashboards in place', async () => {
    const { dashboardStore, chatStore } = makeStores()
    const id = await ensureChatForkForMutation({
      dashboard: dashboardStore.dashboards['d-derived'],
      chatId: 'chat-global',
      chatStore,
      dashboardStore,
    })
    expect(id).toBe('d-derived')
    expect(dashboardStore.forkDashboard).not.toHaveBeenCalled()
  })

  it('edits empty dashboards in place and remembers the decision', async () => {
    const { dashboardStore, chatStore } = makeStores()
    const dashboard = dashboardStore.dashboards['d-empty']
    const first = await ensureChatForkForMutation({
      dashboard,
      chatId: 'chat-global',
      chatStore,
      dashboardStore,
    })
    expect(first).toBe('d-empty')
    // Simulate the agent having added items — the claim persists.
    dashboard.gridItems = { a: {}, b: {} }
    const second = await ensureChatForkForMutation({
      dashboard,
      chatId: 'chat-global',
      chatStore,
      dashboardStore,
    })
    expect(second).toBe('d-empty')
    expect(dashboardStore.forkDashboard).not.toHaveBeenCalled()
  })

  it('forks a populated original for a global conversation and navigates', async () => {
    const { dashboardStore, chatStore } = makeStores()
    const navigated: any[] = []
    const id = await ensureChatForkForMutation({
      dashboard: dashboardStore.dashboards['d-full'],
      chatId: 'chat-global',
      chatStore,
      dashboardStore,
      setActiveDashboard: (next) => navigated.push(next),
    })
    expect(dashboardStore.forkDashboard).toHaveBeenCalledTimes(1)
    expect(id).not.toBe('d-full')
    expect(navigated).toEqual([id])
    // Global chats leave dashboard chat pointers untouched.
    expect(dashboardStore.dashboards['d-full'].chatId).toBeNull()
    // Follow-up mutation stays on the fork without re-forking.
    const again = await ensureChatForkForMutation({
      dashboard: dashboardStore.dashboards[id],
      chatId: 'chat-global',
      chatStore,
      dashboardStore,
    })
    expect(again).toBe(id)
    expect(dashboardStore.forkDashboard).toHaveBeenCalledTimes(1)
  })

  it('lets a bound chat with prior successful mutations keep editing in place', async () => {
    const { dashboardStore, chatStore } = makeStores()
    const id = await ensureChatForkForMutation({
      dashboard: dashboardStore.dashboards['d-full'],
      chatId: 'chat-bound',
      chatStore,
      dashboardStore,
    })
    expect(id).toBe('d-full')
    expect(dashboardStore.forkDashboard).not.toHaveBeenCalled()
  })

  it('moves the chat pointer when forking a bound chat without prior mutations', async () => {
    const { dashboardStore, chatStore } = makeStores()
    chatStore.chats['chat-bound'].messages = []
    dashboardStore.dashboards['d-full'].setChatId('chat-bound')
    const id = await ensureChatForkForMutation({
      dashboard: dashboardStore.dashboards['d-full'],
      chatId: 'chat-bound',
      chatStore,
      dashboardStore,
    })
    expect(id).not.toBe('d-full')
    expect(dashboardStore.dashboards['d-full'].chatId).toBeNull()
    expect(dashboardStore.dashboards[id].chatId).toBe('chat-bound')
    expect(chatStore.chats['chat-bound'].sourceRefId).toBe(id)
  })
})

describe('dashboardPack targeting', () => {
  const pack = buildDashboardPack()

  beforeEach(() => resetForkGuardForTests())

  const makeContext = (overrides: Partial<any> = {}): ToolContext => {
    const { dashboardStore, chatStore } = makeStores()
    return {
      runtime: {
        dashboardStore,
        chatStore,
        connectionStore: { connections: {}, connectionByName: () => undefined },
        editorStore: { editors: {}, getEditorByName: () => undefined },
        queryExecutionService: {},
        navigation: {
          activeDashboard: { value: '' },
          setActiveDashboard: vi.fn(),
        },
        ...overrides,
      } as any,
      session: { chatId: 'chat-global', cache: new Map() },
    }
  }

  it('every wrapped dashboard tool accepts an optional dashboard_id', () => {
    for (const name of [
      'get_dashboard_state',
      'add_dashboard_item',
      'capture_dashboard_screenshot',
    ]) {
      const tool = toolByName(pack, name)
      expect(tool.definition.input_schema.properties.dashboard_id).toBeDefined()
      expect(tool.definition.input_schema.required ?? []).not.toContain('dashboard_id')
    }
  })

  it('errors helpfully when no dashboard is in view and none specified', async () => {
    const ctx = makeContext()
    const result = await toolByName(pack, 'get_dashboard_state').execute({}, ctx)
    expect(result.success).toBe(false)
    expect(result.error).toContain('open_dashboard')
  })

  it('defaults the target to the screen-bridged dashboard', async () => {
    const ctx = makeContext({
      screenBridge: {
        dashboard: {
          dashboardId: 'd-full',
          refreshItem: () => undefined,
          getDashboardQueryExecutor: () => null,
        },
      },
    })
    const result = await toolByName(pack, 'get_dashboard_state').execute({}, ctx)
    // The real executor runs against our mock store; success proves targeting.
    expect(result.success).toBe(true)
    expect(result.message).toContain('Dash d-full')
  })

  it('errors on an unknown explicit dashboard_id', async () => {
    const ctx = makeContext()
    const result = await toolByName(pack, 'get_dashboard_state').execute(
      { dashboard_id: 'ghost' },
      ctx,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('refresh_dashboard_item requires the target dashboard on screen', async () => {
    const ctx = makeContext({
      screenBridge: {
        dashboard: {
          dashboardId: 'd-empty',
          refreshItem: vi.fn(() => 'q-1'),
          getDashboardQueryExecutor: () => null,
        },
      },
    })
    const wrongTarget = await toolByName(pack, 'refresh_dashboard_item').execute(
      { item_id: 'item-0', dashboard_id: 'd-full' },
      ctx,
    )
    expect(wrongTarget.success).toBe(false)

    const onScreen = await toolByName(pack, 'refresh_dashboard_item').execute(
      { item_id: 'item-0' },
      ctx,
    )
    expect(onScreen.success).toBe(true)
    expect(onScreen.message).toContain('q-1')
  })
})
