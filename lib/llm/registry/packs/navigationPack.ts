import type { RegisteredTool, ToolContext, ToolAvailability } from '../types'
import type { ToolCallResult } from '../../sharedToolHelpers'

// Tools that let the agent see and drive the app shell. All are thin wrappers
// over the useScreenNavigation singleton (passed in via ToolRuntime.navigation)
// plus store lookups; none require a mounted screen component.

const NAVIGABLE_SCREENS = [
  'editors',
  'connections',
  'dashboard',
  'models',
  'community-models',
  'jobs',
  'tutorial',
  'welcome',
  'settings',
] as const

function requireNavigation(ctx: ToolContext): ToolAvailability {
  return ctx.runtime.navigation
    ? { available: true }
    : {
        available: false,
        hint: 'App navigation is not available in this embedding context.',
      }
}

function resolveDashboard(ctx: ToolContext, ref: string) {
  const store = ctx.runtime.dashboardStore
  if (!store) return null
  const byId = store.dashboards[ref]
  if (byId) return byId
  return Object.values(store.dashboards).find((d: any) => d.name === ref && !d.deleted) || null
}

function resolveEditor(ctx: ToolContext, ref: string) {
  const store = ctx.runtime.editorStore
  const byId = store.editors[ref]
  if (byId && !byId.deleted) return byId
  const byName = store.getEditorByName(ref)
  return byName && !byName.deleted ? byName : null
}

async function getAppState(ctx: ToolContext): Promise<ToolCallResult> {
  const nav = ctx.runtime.navigation!
  const lines: string[] = []

  lines.push(`Active screen: ${nav.activeScreen.value || 'welcome'}`)

  const tabs = nav.tabs.value
  if (tabs.length > 0) {
    lines.push(
      `Open tabs: ${tabs.map((t) => `${t.title} (${t.screen}${t.id === nav.activeTab.value ? ', active' : ''})`).join('; ')}`,
    )
  }

  const activeDashboardId = nav.activeDashboard.value
  if (activeDashboardId && ctx.runtime.dashboardStore) {
    const dashboard = ctx.runtime.dashboardStore.dashboards[activeDashboardId]
    if (dashboard) {
      lines.push(
        `Active dashboard: "${dashboard.name}" (id ${dashboard.id}, connection ${dashboard.connection || 'none'}, ${Object.keys(dashboard.gridItems).length} items)`,
      )
    }
  }

  const activeEditorId = nav.activeEditor.value
  if (activeEditorId) {
    const editor = ctx.runtime.editorStore.editors[activeEditorId]
    if (editor) {
      lines.push(
        `Active editor: "${editor.name}" (id ${editor.id}, type ${editor.type}, connection ${editor.connection})`,
      )
    }
  }

  const connections = Object.values(ctx.runtime.connectionStore.connections).map(
    (c: any) => `${c.name} (${c.type}${c.connected ? ', connected' : ', not connected'})`,
  )
  lines.push(`Data connections: ${connections.join('; ') || 'none configured'}`)

  const dashboards = ctx.runtime.dashboardStore
    ? Object.values(ctx.runtime.dashboardStore.dashboards).filter((d: any) => !d.deleted)
    : []
  if (dashboards.length > 0) {
    lines.push(
      `Dashboards (${dashboards.length}): ${dashboards
        .slice(0, 20)
        .map((d: any) => `"${d.name}"`)
        .join(', ')}${dashboards.length > 20 ? ', ...' : ''}`,
    )
  }

  const editors = Object.values(ctx.runtime.editorStore.editors).filter((e) => !e.deleted)
  lines.push(`Editors: ${editors.length} total (use list_editors for details)`)

  return { success: true, message: lines.join('\n') }
}

export function buildNavigationPack(): RegisteredTool[] {
  return [
    {
      pack: 'navigation',
      availability: requireNavigation,
      definition: {
        name: 'get_app_state',
        description:
          'Get a snapshot of the current app state: which screen the user is viewing, open tabs, the active dashboard/editor, data connections and their status, and available dashboards. Call this to orient yourself before navigating or when context may have changed.',
        input_schema: { type: 'object', properties: {} },
      },
      execute: (_input, ctx) => getAppState(ctx),
    },
    {
      pack: 'navigation',
      availability: requireNavigation,
      definition: {
        name: 'navigate_to_screen',
        description:
          'Navigate the app to a different screen. Use open_dashboard/open_editor instead when targeting a specific dashboard or editor.',
        input_schema: {
          type: 'object',
          properties: {
            screen: {
              type: 'string',
              enum: [...NAVIGABLE_SCREENS],
              description: 'The screen to navigate to',
            },
          },
          required: ['screen'],
        },
      },
      execute: async (input, ctx) => {
        const screen = input.screen as (typeof NAVIGABLE_SCREENS)[number]
        if (!NAVIGABLE_SCREENS.includes(screen)) {
          return {
            success: false,
            error: `Unknown screen "${input.screen}". Valid screens: ${NAVIGABLE_SCREENS.join(', ')}`,
          }
        }
        const nav = ctx.runtime.navigation!
        nav.setActiveScreen(screen)
        nav.setActiveSidebarScreen(screen)
        return { success: true, message: `Navigated to the ${screen} screen.` }
      },
    },
    {
      pack: 'navigation',
      availability: requireNavigation,
      definition: {
        name: 'open_dashboard',
        description:
          'Open a dashboard in the main pane by id or name. The user will see the dashboard; subsequent dashboard tools default to it.',
        input_schema: {
          type: 'object',
          properties: {
            dashboard_ref: {
              type: 'string',
              description: 'Dashboard id or exact name',
            },
          },
          required: ['dashboard_ref'],
        },
      },
      execute: async (input, ctx) => {
        if (!ctx.runtime.dashboardStore) {
          return { success: false, error: 'Dashboard store is not available in this context.' }
        }
        const dashboard = resolveDashboard(ctx, String(input.dashboard_ref ?? ''))
        if (!dashboard) {
          const names = Object.values(ctx.runtime.dashboardStore.dashboards)
            .filter((d: any) => !d.deleted)
            .map((d: any) => `"${d.name}"`)
            .join(', ')
          return {
            success: false,
            error: `Dashboard "${input.dashboard_ref}" not found. Available: ${names || 'none'}`,
          }
        }
        ctx.runtime.navigation!.setActiveDashboard(dashboard.id)
        return {
          success: true,
          message: `Opened dashboard "${dashboard.name}" (id ${dashboard.id}, connection ${dashboard.connection || 'none'}, ${Object.keys(dashboard.gridItems).length} items).`,
        }
      },
    },
    {
      pack: 'navigation',
      availability: requireNavigation,
      definition: {
        name: 'open_editor',
        description:
          'Open an editor (query/model file) in the main pane by id or name, so the user can see it.',
        input_schema: {
          type: 'object',
          properties: {
            editor_ref: {
              type: 'string',
              description: 'Editor id or exact name',
            },
          },
          required: ['editor_ref'],
        },
      },
      execute: async (input, ctx) => {
        const editor = resolveEditor(ctx, String(input.editor_ref ?? ''))
        if (!editor) {
          return {
            success: false,
            error: `Editor "${input.editor_ref}" not found. Use list_editors to see available editors.`,
          }
        }
        ctx.runtime.navigation!.setActiveEditor(editor.id)
        return {
          success: true,
          message: `Opened editor "${editor.name}" (id ${editor.id}, type ${editor.type}).`,
        }
      },
    },
  ]
}
