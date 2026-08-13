import type { LLMToolDefinition } from '../../base'
import type { RegisteredTool, ToolContext } from '../types'
import type { ToolCallResult } from '../../sharedToolHelpers'
import { DASHBOARD_TOOLS } from '../../dashboardAgentTools'
import { DashboardToolExecutor } from '../../dashboardToolExecutor'
import {
  MUTATING_DASHBOARD_TOOLS,
  ensureChatForkForMutation,
  getOrCreateHeadlessQueryExecutor,
  dashboardChatImports,
  type DashboardAgentStores,
} from '../../dashboardAgentRuntime'
import type { DashboardQueryExecutor } from '../../../dashboards/dashboardQueryExecutor'
import type { ChatImport } from '../../../chats/chat'

// Dashboard tools for the global chat. Definitions come from DASHBOARD_TOOLS
// but gain an optional `dashboard_id` input — the global conversation isn't
// bound to one dashboard, so tools default to the currently viewed dashboard
// and accept an explicit id for headless targeting.
//
// Tools DASHBOARD_TOOLS shares with the data/base packs (run_trilogy_query,
// select_active_import, list_available_imports, connect_data_connection,
// return_to_user) are excluded: the global chat routes those through the chat
// executor. Report-mode tools stay out of the global union entirely.

const GLOBAL_DASHBOARD_TOOL_NAMES = [
  'get_dashboard_state',
  'list_dashboard_items',
  'get_dashboard_item',
  'add_dashboard_item',
  'update_dashboard_item',
  'remove_dashboard_item',
  'move_dashboard_item',
  'get_dashboard_info',
  'update_dashboard_info',
  'set_dashboard_title',
  'set_dashboard_theme',
  'capture_dashboard_screenshot',
] as const

function withDashboardIdInput(definition: LLMToolDefinition): LLMToolDefinition {
  return {
    ...definition,
    input_schema: {
      ...definition.input_schema,
      properties: {
        ...definition.input_schema.properties,
        dashboard_id: {
          type: 'string',
          description:
            'Optional dashboard id to target. Defaults to the currently viewed dashboard.',
        },
      },
    },
  }
}

function resolveTargetDashboardId(ctx: ToolContext, explicit?: string): string {
  if (explicit) return explicit
  const bridged = ctx.runtime.screenBridge?.dashboard?.dashboardId
  if (bridged) return bridged
  return ctx.runtime.navigation?.activeDashboard.value || ''
}

/** Executor per (session, dashboard): bridge-aware closures re-read the live
 *  screenBridge at call time, so a dashboard mounting mid-conversation
 *  upgrades refresh/screenshot without rebuilding the executor. */
function getDashboardExecutor(ctx: ToolContext, dashboardId: string): DashboardToolExecutor {
  const key = `dashboardExecutor:${dashboardId}`
  let executor = ctx.session.cache.get(key) as DashboardToolExecutor | undefined
  if (executor) return executor

  const { dashboardStore, connectionStore, editorStore, chatStore, queryExecutionService } =
    ctx.runtime
  if (!dashboardStore) {
    throw new Error('Dashboard store is not available in this context.')
  }

  const bridgeFor = () => {
    const bridge = ctx.runtime.screenBridge?.dashboard
    return bridge && bridge.dashboardId === dashboardId ? bridge : null
  }
  const headlessStores = {
    dashboardStore,
    connectionStore,
    editorStore,
    chatStore,
    queryExecutionService,
    llmConnectionStore: ctx.runtime.llmConnectionStore,
  } as DashboardAgentStores

  executor = new DashboardToolExecutor({
    dashboardStore,
    connectionStore,
    editorStore,
    queryExecutionService,
    dashboardId,
    getActiveImports: (): ChatImport[] => {
      const dashboard = dashboardStore.dashboards[dashboardId]
      return dashboard ? dashboardChatImports(dashboard) : []
    },
    setActiveImports: (imports: ChatImport[]) => {
      dashboardStore.updateDashboardImports(
        dashboardId,
        imports.map((imp) => ({ id: imp.id, name: imp.name, alias: imp.alias })),
      )
    },
    getDashboardQueryExecutor: () => {
      const bridge = bridgeFor()
      if (bridge) {
        return (bridge.getDashboardQueryExecutor() as DashboardQueryExecutor | null) ?? null
      }
      return getOrCreateHeadlessQueryExecutor(dashboardId, headlessStores)
    },
    refreshItem: (itemId: string) => bridgeFor()?.refreshItem(itemId) ?? undefined,
    captureDashboardImage: async () => {
      const bridge = bridgeFor()
      if (!bridge?.captureImage) {
        throw new Error(
          'This dashboard is not currently on screen. Use open_dashboard to display it, then retry the screenshot.',
        )
      }
      return bridge.captureImage()
    },
  })
  ctx.session.cache.set(key, executor)
  return executor
}

async function executeDashboardTool(
  toolName: string,
  toolInput: Record<string, any>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const { dashboard_id, ...input } = toolInput
  if (!ctx.runtime.dashboardStore) {
    return { success: false, error: 'Dashboard store is not available in this context.' }
  }
  let dashboardId = resolveTargetDashboardId(ctx, dashboard_id ? String(dashboard_id) : undefined)
  if (!dashboardId) {
    return {
      success: false,
      error:
        'No dashboard is currently in view. Pass dashboard_id, or use open_dashboard / list_dashboards first.',
    }
  }
  const dashboard = ctx.runtime.dashboardStore.dashboards[dashboardId]
  if (!dashboard || (dashboard as any).deleted) {
    return { success: false, error: `Dashboard "${dashboardId}" not found.` }
  }

  if (MUTATING_DASHBOARD_TOOLS.has(toolName)) {
    dashboardId = await ensureChatForkForMutation({
      dashboard,
      chatId: ctx.session.chatId,
      chatStore: ctx.runtime.chatStore,
      dashboardStore: ctx.runtime.dashboardStore,
      setActiveDashboard: ctx.runtime.navigation
        ? (id) => ctx.runtime.navigation!.setActiveDashboard(id)
        : undefined,
    })
  }

  return getDashboardExecutor(ctx, dashboardId).executeToolCall(toolName, input)
}

export function buildDashboardPack(): RegisteredTool[] {
  const wrapped: RegisteredTool[] = GLOBAL_DASHBOARD_TOOL_NAMES.map((name) => {
    const definition = (DASHBOARD_TOOLS as readonly LLMToolDefinition[]).find(
      (tool) => tool.name === name,
    )
    if (!definition) {
      throw new Error(`DASHBOARD_TOOLS is missing expected tool '${name}'`)
    }
    return {
      definition: withDashboardIdInput(definition),
      pack: 'dashboard',
      execute: (input, ctx) => executeDashboardTool(name, input, ctx),
    }
  })

  return [
    ...wrapped,
    {
      pack: 'dashboard',
      definition: {
        name: 'list_dashboards',
        description: 'List dashboards, optionally filtered by data connection name.',
        input_schema: {
          type: 'object',
          properties: {
            connection: { type: 'string', description: 'Optional connection name filter' },
          },
        },
      },
      execute: async (input, ctx) => {
        if (!ctx.runtime.dashboardStore) {
          return { success: false, error: 'Dashboard store is not available in this context.' }
        }
        let dashboards = Object.values(ctx.runtime.dashboardStore.dashboards).filter(
          (d: any) => !d.deleted,
        )
        if (input.connection) {
          dashboards = dashboards.filter((d: any) => d.connection === input.connection)
        }
        if (dashboards.length === 0) {
          return { success: true, message: 'No dashboards found.' }
        }
        return {
          success: true,
          message: dashboards
            .map(
              (d: any) =>
                `- "${d.name}" (id ${d.id}, connection ${d.connection || 'none'}, ${Object.keys(d.gridItems).length} items, layout ${d.layoutType || 'grid'})`,
            )
            .join('\n'),
        }
      },
    },
    {
      pack: 'dashboard',
      definition: {
        name: 'create_dashboard',
        description: 'Create a new empty dashboard on a connection and open it.',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Dashboard name (must be unique)' },
            connection: { type: 'string', description: 'Data connection name' },
          },
          required: ['name', 'connection'],
        },
      },
      execute: async (input, ctx) => {
        if (!ctx.runtime.dashboardStore) {
          return { success: false, error: 'Dashboard store is not available in this context.' }
        }
        const connection =
          ctx.runtime.connectionStore.connections[input.connection] ||
          ctx.runtime.connectionStore.connectionByName(input.connection)
        if (!connection) {
          return { success: false, error: `Connection "${input.connection}" not found.` }
        }
        try {
          const dashboard = ctx.runtime.dashboardStore.newDashboard(
            String(input.name),
            connection.name,
          )
          ctx.runtime.navigation?.setActiveDashboard(dashboard.id)
          return {
            success: true,
            message: `Created dashboard "${dashboard.name}" (id ${dashboard.id}) on connection "${connection.name}".`,
          }
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to create dashboard',
          }
        }
      },
    },
    {
      pack: 'dashboard',
      definition: {
        name: 'refresh_dashboard_item',
        description:
          "Re-run the query behind a dashboard item that is currently on screen, so the user sees fresh data. Requires the dashboard to be open in the main pane. To measure query timing, prefer run_trilogy_query with the item's query (results report execution time in ms).",
        input_schema: {
          type: 'object',
          properties: {
            item_id: { type: 'string', description: 'The dashboard item id' },
            dashboard_id: {
              type: 'string',
              description:
                'Optional dashboard id to target. Defaults to the currently viewed dashboard.',
            },
          },
          required: ['item_id'],
        },
      },
      availability: (ctx) =>
        ctx.runtime.screenBridge?.dashboard
          ? { available: true }
          : {
              available: false,
              hint: 'No dashboard is mounted on screen. Use open_dashboard first, then retry.',
            },
      execute: async (input, ctx) => {
        const bridge = ctx.runtime.screenBridge?.dashboard
        const targetId = resolveTargetDashboardId(
          ctx,
          input.dashboard_id ? String(input.dashboard_id) : undefined,
        )
        if (!bridge || bridge.dashboardId !== targetId) {
          return {
            success: false,
            error: `Dashboard "${targetId}" is not the one on screen. Use open_dashboard first.`,
          }
        }
        const queryId = bridge.refreshItem(String(input.item_id))
        return {
          success: true,
          message: queryId
            ? `Refresh triggered for item ${input.item_id} (query ${queryId}). The item re-renders as results arrive.`
            : `Refresh triggered for item ${input.item_id}.`,
        }
      },
    },
  ]
}
