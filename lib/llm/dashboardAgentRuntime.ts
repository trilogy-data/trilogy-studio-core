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
import { resolveDashboardConnectionId } from '../dashboards/connectionResolution'
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
 * Mounted dashboard components layer component-bound capabilities on top via
 * the screenBridge (a live-rendered query executor, item refresh, and
 * screenshots). Headless runs (e.g. the overseer's create_report firing the
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
  const resolvedConnectionId = resolveDashboardConnectionId(dashboardData, connectionStore)
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

// Tools that mutate dashboard state — these trigger an auto-fork on first use
// so a chat session never modifies the user's original dashboard in place.
export const MUTATING_DASHBOARD_TOOLS = new Set([
  'add_dashboard_item',
  'update_dashboard_item',
  'remove_dashboard_item',
  'move_dashboard_item',
  'update_dashboard_info',
  'set_dashboard_title',
  'set_executive_memo',
  'add_claim_section',
  'add_appendix_header',
  'set_report_layout',
])

// Chat+dashboard pairs that have committed to mutating in place. Populated the
// first time a fork is skipped, so items the agent itself added don't trigger
// a fork on the next mutating call.
const inPlaceKeys = new Set<string>()

/** Test-only: forget in-place decisions. */
export function resetForkGuardForTests(): void {
  inPlaceKeys.clear()
}

/**
 * Fork-on-first-mutation guard, shared by every surface that lets an agent
 * mutate a dashboard. Returns the dashboard id the mutation should target —
 * the original when editing in place is safe, or a fresh fork otherwise.
 *
 * In-place is allowed when: the dashboard is already a derived fork, this
 * chat already claimed it, this dashboard-bound chat has prior successful
 * mutations on it (reconstructed after reopen), or the dashboard is empty.
 * A global (non-bound) conversation mutating a populated original always
 * forks first — deliberately more eager than the old bound-chat behavior.
 */
export async function ensureChatForkForMutation(opts: {
  dashboard: DashboardModel
  chatId: string
  chatStore: ChatStoreType
  dashboardStore: DashboardStoreType
  setActiveDashboard?: (dashboardId: string | null) => void
}): Promise<string> {
  const { dashboard, chatId, chatStore, dashboardStore, setActiveDashboard } = opts

  if (dashboard.parentDashboardId) return dashboard.id

  const key = `${chatId}:${dashboard.id}`
  if (inPlaceKeys.has(key)) return dashboard.id

  const chat = chatStore.chats[chatId]

  // Reconstruct the in-place decision after a reopen: a chat bound to this
  // dashboard that already mutated it successfully owns it.
  const hasPriorMutation =
    chat?.sourceRefId === dashboard.id &&
    chat?.messages.some((m) =>
      m.executedToolCalls?.some((c) => MUTATING_DASHBOARD_TOOLS.has(c.name) && c.result?.success),
    )
  if (hasPriorMutation) {
    inPlaceKeys.add(key)
    return dashboard.id
  }

  // Nothing to preserve on an empty dashboard.
  if (Object.keys(dashboard.gridItems).length === 0) {
    inPlaceKeys.add(key)
    return dashboard.id
  }

  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '')
  try {
    const fork = dashboardStore.forkDashboard(dashboard.id, `chat-${stamp}`)
    // A dashboard-bound chat moves with its dashboard so reopening the panel
    // on the fork resumes the conversation. Global conversations leave the
    // original dashboard's chat pointer untouched.
    if (chat && chat.sourceRefId === dashboard.id) {
      dashboard.setChatId(null)
      fork.setChatId(chatId)
      chat.sourceRefId = fork.id
      chat.changed = true
    }
    inPlaceKeys.add(`${chatId}:${fork.id}`)
    setActiveDashboard?.(fork.id)
    return fork.id
  } catch (err) {
    console.error('Failed to auto-fork dashboard for chat mutation:', err)
    return dashboard.id
  }
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
 * sessions on populated dashboards go through the global chat's dashboard
 * tools, which call ensureChatForkForMutation.
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
