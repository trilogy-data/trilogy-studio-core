import { Chat } from '../chats/chat'
import type { ChatImport, ChatToolCall } from '../chats/chat'
import type { LLMToolCall, LLMToolResult } from './base'
import { DASHBOARD_TOOLS, REPORT_TOOLS } from './dashboardAgentTools'
import {
  buildDashboardAgentSystemPrompt,
  buildDashboardStateSnapshot,
} from './dashboardAgentPrompt'
import { DashboardToolExecutor } from './dashboardToolExecutor'
import { formatToolResultText } from './toolLoopCore'
import { isTrilogyType } from '../editors/fileTypes'
import {
  buildItemDataResponse,
  buildRootContent,
  applyItemDataToStore,
  emptyItemDataResponse,
} from '../dashboards/itemData'
import type { DashboardModel } from '../dashboards/base'
import type { DashboardQueryExecutor } from '../dashboards/dashboardQueryExecutor'
import type { DashboardStoreType } from '../stores/dashboardStore'
import type { ChatStoreType, ChatExecutionDependencies } from '../stores/chatStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import type QueryExecutionService from '../stores/queryExecutionService'

/**
 * Shared runtime for the dashboard/report agent — everything needed to run
 * the agent from stores alone, with no mounted dashboard component.
 *
 * The mounted chat panel (DashboardChatPanel) layers component-bound
 * capabilities on top: a live-rendered query executor, item refresh, and
 * screenshots. Headless runs (e.g. the overseer's create_report firing the
 * brief immediately) fall back to store-backed equivalents — refresh is a
 * no-op (items render fresh from specs on mount) and the screenshot tool
 * reports itself unavailable.
 */

export interface DashboardAgentStores {
  dashboardStore: DashboardStoreType
  chatStore: ChatStoreType
  connectionStore: ConnectionStoreType
  editorStore: EditorStoreType
  llmConnectionStore: LLMConnectionStoreType
  queryExecutionService: QueryExecutionService
}

/** Ensure the dashboard has a backing chat record, creating one lazily. */
export function ensureDashboardChat(
  dashboard: DashboardModel,
  chatStore: ChatStoreType,
  llmConnectionStore: LLMConnectionStoreType,
): string {
  const existingId = dashboard.chatId
  if (existingId) {
    const existing = chatStore.chats[existingId]
    if (existing && !existing.deleted) {
      return existingId
    }
  }
  const chat = new Chat({
    name: `Dashboard: ${dashboard.name}`,
    llmConnectionName: llmConnectionStore.activeConnection || '',
    dataConnectionName: dashboard.connection || '',
    source: 'dashboard',
    sourceRefId: dashboard.id,
  })
  chatStore.addChat(chat)
  dashboard.setChatId(chat.id)
  return chat.id
}

/** Tools the agent receives. Reports get the report-mode tools layered onto
 *  the standard dashboard tool surface. */
export function dashboardAgentToolset(dashboard: DashboardModel) {
  return dashboard.layoutType === 'report' ? [...DASHBOARD_TOOLS, ...REPORT_TOOLS] : DASHBOARD_TOOLS
}

/** The dashboard is the single source of truth for active imports. */
export function dashboardChatImports(dashboard: DashboardModel): ChatImport[] {
  return (dashboard.imports || []).map((imp) => ({
    id: imp.id,
    name: imp.name,
    alias: imp.alias || '',
  }))
}

/**
 * System prompt derived entirely from store state.
 *
 * Contains no live dashboard state — see buildDashboardAgentSystemPrompt. Given
 * stable stores this returns a byte-identical string every turn, which is what
 * keeps the prompt cache warm across an agent loop.
 */
export function buildAgentSystemPrompt(
  dashboard: DashboardModel,
  connectionStore: ConnectionStoreType,
  editorStore: EditorStoreType,
): string {
  const availableConnections = connectionStore
    ? Object.values(connectionStore.connections).map((c) => c.name)
    : []
  const dashboardConnection =
    (dashboard.connectionId && connectionStore?.connections[dashboard.connectionId]) ||
    (dashboard.connection ? connectionStore?.connectionByName(dashboard.connection) : undefined)
  // Note: connection *connected* status is deliberately not read here — it flips
  // mid-session (connect_data_connection) and belongs in the state snapshot.
  const availableImports: ChatImport[] =
    editorStore && dashboardConnection
      ? Object.values(editorStore.editors)
          .filter(
            (editor) =>
              !editor.deleted &&
              isTrilogyType(editor.type) &&
              editor.connectionId === dashboardConnection.id,
          )
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((editor) => ({
            id: editor.id,
            name: editor.name.replace(/\//g, '.'),
            alias: '',
          }))
      : []

  return buildDashboardAgentSystemPrompt({
    dashboard,
    availableConnections,
    availableImportsForConnection: availableImports,
  })
}

/** Current mutable dashboard state, in the shape the agent's get_dashboard_state
 *  tool returns. Used to seed the conversation with starting context. */
export function buildDashboardStateContext(
  dashboard: DashboardModel,
  connectionStore: ConnectionStoreType,
): string {
  const dashboardConnection =
    (dashboard.connectionId && connectionStore?.connections[dashboard.connectionId]) ||
    (dashboard.connection ? connectionStore?.connectionByName(dashboard.connection) : undefined)

  return buildDashboardStateSnapshot({
    dashboard,
    dataConnectionName: dashboard.connection,
    activeImports: dashboardChatImports(dashboard),
    isDataConnectionActive: dashboardConnection?.connected ?? false,
  })
}

/**
 * Build the session's system-prompt provider.
 *
 * The tool loop calls buildSystemPrompt() on every iteration. The frozen prompt
 * is recomputed (cheap, and identical each time), while the state snapshot is
 * captured on first call and reused — so the prompt stays byte-stable for the
 * whole session even as the agent mutates the dashboard underneath it. The agent
 * refreshes its view through get_dashboard_state instead.
 */
export function createDashboardSystemPromptProvider(
  getDashboard: () => DashboardModel | null | undefined,
  connectionStore: ConnectionStoreType,
  editorStore: EditorStoreType,
): () => string {
  let frozenStateContext: string | null = null

  return () => {
    const dashboard = getDashboard()
    if (!dashboard) return ''

    if (frozenStateContext === null) {
      frozenStateContext = buildDashboardStateContext(dashboard, connectionStore)
    }

    return `${buildAgentSystemPrompt(dashboard, connectionStore, editorStore)}

DASHBOARD STATE AT THE START OF THIS CONVERSATION (snapshot — call get_dashboard_state for current state):
${frozenStateContext}`
  }
}

/** Get (or create) the dashboard's query executor with store-backed item
 *  accessors. Shares the store cache with the mounted path — the closures
 *  read/write the same persisted model, so whichever side creates the
 *  executor first, both work against identical state. */
export function getOrCreateHeadlessQueryExecutor(
  dashboardId: string,
  stores: DashboardAgentStores,
): DashboardQueryExecutor {
  const { dashboardStore, connectionStore, editorStore, queryExecutionService } = stores
  const dashboardData = dashboardStore.dashboards[dashboardId]
  const resolvedConnectionId =
    dashboardData.connectionId ||
    connectionStore.connectionByName(dashboardData.connection)?.id ||
    dashboardData.connection
  return dashboardStore.getOrCreateQueryExecutor(dashboardId, {
    queryExecutionService,
    connectionName: resolvedConnectionId,
    dashboardId,
    getDashboardData: (id: string) => dashboardStore.dashboards[id],
    getItemData: (itemId: string, dashId: string) => {
      const d = dashboardStore.dashboards[dashId]
      if (!d) return emptyItemDataResponse(itemId)
      return buildItemDataResponse(d, itemId, { rootContent: buildRootContent(d, editorStore) })
    },
    setItemData: (itemId: string, dashId: string, data: any) =>
      applyItemDataToStore(dashboardStore, dashId, itemId, data),
  })
}

/** Store-only tool executor — refresh no-ops, screenshots unavailable. */
export function buildHeadlessToolExecutor(
  dashboardId: string,
  stores: DashboardAgentStores,
): DashboardToolExecutor {
  const { dashboardStore, connectionStore, editorStore, queryExecutionService } = stores
  return new DashboardToolExecutor({
    dashboardStore,
    connectionStore,
    editorStore,
    queryExecutionService,
    dashboardId,
    getActiveImports: () => {
      const d = dashboardStore.dashboards[dashboardId]
      return d ? dashboardChatImports(d) : []
    },
    setActiveImports: (imports: ChatImport[]) => {
      dashboardStore.updateDashboardImports(
        dashboardId,
        imports.map((imp) => ({ id: imp.id, name: imp.name, alias: imp.alias })),
      )
    },
    getDashboardQueryExecutor: () => getOrCreateHeadlessQueryExecutor(dashboardId, stores),
    refreshItem: () => undefined,
  })
}

/** Seed a brand-new dashboard chat with a synthetic select_active_import
 *  tool call + result so the agent starts with the chosen import's field
 *  list in context. Without this, the agent guesses field names before it
 *  gets around to calling select_active_import itself. */
export async function seedInitialImportContext(opts: {
  chatStore: ChatStoreType
  chatId: string
  toolExecutor: DashboardToolExecutor
  imports: ChatImport[]
}): Promise<void> {
  const { chatStore, chatId, toolExecutor, imports } = opts
  const chat = chatStore.chats[chatId]
  if (!chat) return
  // Only seed on a fresh conversation — otherwise we'd stack duplicates on
  // every dashboard reopen.
  if (chat.messages.length > 0) return

  if (imports.length === 0) return
  const imp = imports[0]

  let result
  try {
    result = await toolExecutor.executeToolCall('select_active_import', {
      import_name: imp.name,
    })
  } catch (err) {
    console.error('Failed to seed initial import context:', err)
    return
  }
  if (!result.success) return

  const toolCallId = `seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const toolCall: LLMToolCall = {
    id: toolCallId,
    name: 'select_active_import',
    input: { import_name: imp.name },
  }
  const executedToolCall: ChatToolCall = {
    id: toolCallId,
    name: 'select_active_import',
    input: { import_name: imp.name },
    result: { success: true, message: result.message },
  }
  const toolResult: LLMToolResult = {
    toolCallId,
    toolName: 'select_active_import',
    result: formatToolResultText(result),
  }

  chatStore.addMessageToChat(chatId, {
    role: 'assistant',
    content: `Inspecting the selected data source "${imp.name}" so I know what fields are available.`,
    toolCalls: [toolCall],
    executedToolCalls: [executedToolCall],
  })
  chatStore.addMessageToChat(chatId, {
    role: 'user',
    content: '',
    toolResults: [toolResult],
    hidden: true,
  })
}

/**
 * Fire a prompt at a dashboard's agent, fully headless. Mirrors the
 * overseer's spawnSubchat contract: kicks off execution and returns the
 * backing chat id immediately; the run continues in the background via
 * chatStore. Any mounted view of the same dashboard/chat observes progress
 * reactively through the shared stores.
 *
 * No fork-on-mutate here: headless runs target freshly created (empty)
 * dashboards, where edit-in-place is the intended behavior. Interactive
 * sessions on populated dashboards go through DashboardChatPanel, which
 * retains the fork guard.
 */
export async function startDashboardAgentRun(opts: {
  dashboardId: string
  prompt: string
  stores: DashboardAgentStores
  deps: ChatExecutionDependencies
}): Promise<string> {
  const { dashboardId, prompt, stores, deps } = opts
  const dashboard = stores.dashboardStore.dashboards[dashboardId]
  if (!dashboard) {
    throw new Error(`Dashboard ${dashboardId} not found`)
  }

  const chatId = ensureDashboardChat(dashboard, stores.chatStore, stores.llmConnectionStore)
  const toolExecutor = buildHeadlessToolExecutor(dashboardId, stores)

  await seedInitialImportContext({
    chatStore: stores.chatStore,
    chatId,
    toolExecutor,
    imports: dashboardChatImports(dashboard),
  })

  stores.chatStore
    .executeMessage(chatId, prompt, deps, {
      overrides: {
        tools: dashboardAgentToolset(dashboard),
        executeToolCall: (toolName, toolInput) =>
          toolExecutor.executeToolCall(toolName, toolInput as Record<string, any>),
        buildSystemPrompt: createDashboardSystemPromptProvider(
          () => stores.dashboardStore.dashboards[dashboardId],
          stores.connectionStore,
          stores.editorStore,
        ),
      },
    })
    .catch((err) => {
      console.error(`Headless dashboard agent run for ${dashboardId} failed`, err)
    })

  return chatId
}
