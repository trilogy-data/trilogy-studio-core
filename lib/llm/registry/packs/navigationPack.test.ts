import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildNavigationPack } from './navigationPack'
import { buildEditorPack } from './editorPack'
import type { RegisteredTool, ToolContext } from '../types'

const toolByName = (tools: RegisteredTool[], name: string): RegisteredTool => {
  const tool = tools.find((t) => t.definition.name === name)
  if (!tool) throw new Error(`missing tool ${name}`)
  return tool
}

const makeNavigation = () => {
  const calls: Record<string, any[]> = {}
  const record =
    (name: string) =>
    (...args: any[]) => {
      calls[name] = calls[name] || []
      calls[name].push(args)
    }
  return {
    calls,
    nav: {
      calls,
      activeScreen: { value: 'editors' },
      activeDashboard: { value: '' },
      activeEditor: { value: 'ed-1' },
      activeTab: { value: 'tab-1' },
      tabs: { value: [{ id: 'tab-1', title: 'My Editor', screen: 'editors', address: 'ed-1' }] },
      setActiveScreen: record('setActiveScreen'),
      setActiveSidebarScreen: record('setActiveSidebarScreen'),
      setActiveDashboard: record('setActiveDashboard'),
      setActiveEditor: record('setActiveEditor'),
      updateTabName: record('updateTabName'),
      closeTab: record('closeTab'),
    } as any,
  }
}

const makeContext = (navigation: any): ToolContext => {
  const editors: Record<string, any> = {
    'ed-1': {
      id: 'ed-1',
      name: 'sales_model',
      type: 'preql',
      connection: 'duckdb',
      connectionId: 'local-duckdb',
      contents: 'key a int;',
      storage: 'local',
      deleted: false,
      loading: false,
      changed: false,
      tags: [],
      setContent(next: string) {
        this.contents = next
        this.changed = true
      },
      setName(next: string) {
        this.name = next
        this.changed = true
      },
      delete() {
        this.deleted = true
        this.changed = true
      },
    },
  }
  return {
    runtime: {
      navigation,
      connectionStore: {
        connections: {
          'local-duckdb': { id: 'local-duckdb', name: 'duckdb', type: 'duckdb', connected: true },
        },
        connectionByName: (name: string) =>
          name === 'duckdb'
            ? { id: 'local-duckdb', name: 'duckdb', type: 'duckdb', connected: true }
            : undefined,
      },
      editorStore: {
        editors,
        getEditorByName: (name: string) => Object.values(editors).find((e: any) => e.name === name),
        updateEditorName: (id: string, name: string) => editors[id].setName(name),
      },
      modelStore: {
        models: {
          sales: {
            sources: [{ editor: 'ed-1', alias: 'sales_model' }],
            updateModelSourceName(id: string, name: string) {
              const source = this.sources.find((candidate: any) => candidate.editor === id)
              if (source) source.alias = name
            },
            removeModelSourceSimple(id: string) {
              this.sources = this.sources.filter((source: any) => source.editor !== id)
            },
          },
        },
      },
      saveEditors: vi.fn().mockResolvedValue(undefined),
      saveModels: vi.fn().mockResolvedValue(undefined),
      chatStore: {},
      queryExecutionService: {},
      dashboardStore: {
        dashboards: {
          'd-1': {
            id: 'd-1',
            name: 'Revenue',
            connection: 'duckdb',
            gridItems: { a: {}, b: {} },
            deleted: false,
          },
        },
      },
    } as any,
    session: { chatId: 'chat-1', cache: new Map() },
  }
}

describe('navigationPack', () => {
  let navigation: ReturnType<typeof makeNavigation>
  let ctx: ToolContext
  const pack = buildNavigationPack()

  beforeEach(() => {
    navigation = makeNavigation()
    ctx = makeContext(navigation.nav)
  })

  it('get_app_state summarizes screen, tabs, connections, dashboards, and editors', async () => {
    const result = await toolByName(pack, 'get_app_state').execute({}, ctx)
    expect(result.success).toBe(true)
    expect(result.message).toContain('Active screen: editors')
    expect(result.message).toContain('My Editor')
    expect(result.message).toContain('duckdb (duckdb, connected)')
    expect(result.message).toContain('"Revenue"')
    expect(result.message).toContain('Active editor: "sales_model"')
  })

  it('tools are unavailable without a navigation runtime', () => {
    const tool = toolByName(pack, 'get_app_state')
    const noNav = { ...ctx, runtime: { ...ctx.runtime, navigation: undefined } }
    const availability = tool.availability!(noNav)
    expect(availability.available).toBe(false)
  })

  it('open_dashboard resolves by name and navigates', async () => {
    const result = await toolByName(pack, 'open_dashboard').execute(
      { dashboard_ref: 'Revenue' },
      ctx,
    )
    expect(result.success).toBe(true)
    expect(result.message).toContain('"Revenue"')
    expect(navigation.calls.setActiveDashboard[0]).toEqual(['d-1'])
  })

  it('open_dashboard lists available dashboards on a miss', async () => {
    const result = await toolByName(pack, 'open_dashboard').execute({ dashboard_ref: 'nope' }, ctx)
    expect(result.success).toBe(false)
    expect(result.error).toContain('"Revenue"')
  })

  it('navigate_to_screen rejects unknown screens', async () => {
    const result = await toolByName(pack, 'navigate_to_screen').execute({ screen: 'bogus' }, ctx)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Valid screens')
  })
})

describe('editorPack', () => {
  let ctx: ToolContext
  const pack = buildEditorPack()

  beforeEach(() => {
    ctx = makeContext(makeNavigation().nav)
  })

  it('list_editors lists with metadata', async () => {
    const result = await toolByName(pack, 'list_editors').execute({}, ctx)
    expect(result.success).toBe(true)
    expect(result.message).toContain('"sales_model"')
    expect(result.message).toContain('type preql')
  })

  it('read_editor returns full contents', async () => {
    const result = await toolByName(pack, 'read_editor').execute({ editor_ref: 'sales_model' }, ctx)
    expect(result.success).toBe(true)
    expect(result.message).toContain('key a int;')
  })

  it('update_editor_contents replaces contents live', async () => {
    const result = await toolByName(pack, 'update_editor_contents').execute(
      { editor_ref: 'ed-1', contents: 'key b int;\nkey c int;' },
      ctx,
    )
    expect(result.success).toBe(true)
    expect((ctx.runtime.editorStore as any).editors['ed-1'].contents).toBe('key b int;\nkey c int;')
    expect(result.message).toContain('1 -> 2 lines')
  })

  it('update_editor_contents errors on a missing editor', async () => {
    const result = await toolByName(pack, 'update_editor_contents').execute(
      { editor_ref: 'ghost', contents: 'x' },
      ctx,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('rename_editor updates the editor, model source, tab title, and persistence', async () => {
    const result = await toolByName(pack, 'rename_editor').execute(
      { editor_ref: 'ed-1', new_name: 'sales_clean' },
      ctx,
    )

    expect(result.success).toBe(true)
    expect((ctx.runtime.editorStore as any).editors['ed-1'].name).toBe('sales_clean')
    expect((ctx.runtime.modelStore as any).models.sales.sources[0].alias).toBe('sales_clean')
    expect((ctx.runtime.navigation as any).calls.updateTabName[0]).toEqual([
      'editors',
      null,
      'ed-1',
    ])
    expect(ctx.runtime.saveEditors as any).toHaveBeenCalledTimes(1)
    expect(ctx.runtime.saveModels as any).toHaveBeenCalledTimes(1)
  })

  it('rename_editor rejects a duplicate name on the same connection', async () => {
    ;(ctx.runtime.editorStore as any).editors['ed-2'] = {
      id: 'ed-2',
      name: 'taken',
      connectionId: 'local-duckdb',
      deleted: false,
    }

    const result = await toolByName(pack, 'rename_editor').execute(
      { editor_ref: 'ed-1', new_name: 'taken' },
      ctx,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('already exists')
    expect((ctx.runtime.editorStore as any).editors['ed-1'].name).toBe('sales_model')
  })

  it('delete_editor requires confirmation', async () => {
    const result = await toolByName(pack, 'delete_editor').execute(
      { editor_ref: 'ed-1', confirm: false },
      ctx,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('not confirmed')
    expect((ctx.runtime.editorStore as any).editors['ed-1'].deleted).toBe(false)
  })

  it('delete_editor marks the editor deleted, removes its model source, and closes its tab', async () => {
    const navigation = ctx.runtime.navigation as any
    const result = await toolByName(pack, 'delete_editor').execute(
      { editor_ref: 'ed-1', confirm: true },
      ctx,
    )

    expect(result.success).toBe(true)
    expect((ctx.runtime.editorStore as any).editors['ed-1'].deleted).toBe(true)
    expect((ctx.runtime.modelStore as any).models.sales.sources).toEqual([])
    expect(navigation.calls.closeTab[0]).toEqual([null, 'ed-1'])
    expect(ctx.runtime.saveEditors as any).toHaveBeenCalledTimes(1)
    expect(ctx.runtime.saveModels as any).toHaveBeenCalledTimes(1)
  })
})
