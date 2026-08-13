import type { LLMToolDefinition } from '../base'
import type { ToolCallResult } from '../sharedToolHelpers'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { EditorStoreType } from '../../stores/editorStore'
import type { ChatStoreType } from '../../stores/chatStore'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import type { JobsApiStoreType } from '../../stores/jobsApiStore'
import type QueryExecutionService from '../../stores/queryExecutionService'
import type { NavigationStore } from '../../stores/useScreenNavigation'

/** Organizational unit for tool registration. Packs are the unit of
 *  registration, testing, and toolset composition — a toolset context is just
 *  an ordered list of packs. */
export type ToolPackId =
  | 'base'
  | 'docs'
  | 'data'
  | 'artifacts'
  | 'navigation'
  | 'editor'
  | 'dashboard'
  | 'jobs'
  /** Conversation-management tools (compaction). Global panel only — kept out
   *  of 'base' so legacy toolsets stay byte-identical (prompt-cache golden). */
  | 'context'

/** Live capabilities registered by mounted screen components. Entries are
 *  present only while the corresponding screen is mounted; tools that need a
 *  live component (screenshots, in-view refresh) check for them via
 *  `availability` and degrade with an actionable hint otherwise. */
export interface ScreenBridge {
  dashboard?: {
    dashboardId: string
    captureImage?: () => Promise<{
      base64: string
      mediaType: string
      width: number
      height: number
      overflows: Array<{
        itemId: string
        visiblePx: number
        contentPx: number
        overflowPx: number
        visibleRatio: number
      }>
    }>
    refreshItem: (itemId: string) => string | undefined
    getDashboardQueryExecutor: () => unknown | null
  }
  editor?: {
    editorId: string
    runActiveEditorQuery?: () => Promise<unknown>
    getCurrentResults?: () => unknown | null
  }
}

/** Long-lived app services shared by every tool execution. Constructed by the
 *  surface driving the loop (global panel, llms screen, dashboard runtime) from
 *  injected stores; jobs/navigation/screenBridge arrive in later phases and are
 *  optional so early surfaces don't have to fake them. */
export interface ToolRuntime {
  connectionStore: ConnectionStoreType
  editorStore: EditorStoreType
  chatStore: ChatStoreType
  queryExecutionService: QueryExecutionService
  dashboardStore?: DashboardStoreType
  modelStore?: ModelConfigStoreType
  llmConnectionStore?: LLMConnectionStoreType
  jobsStore?: JobsApiStoreType
  saveEditors?: () => Promise<unknown> | unknown
  saveModels?: () => Promise<unknown> | unknown
  navigation?: NavigationStore
  screenBridge?: ScreenBridge
}

/** Per-conversation execution state. One instance per executeMessage run;
 *  `cache` memoizes per-session executor instances (ChatToolExecutor,
 *  per-dashboard DashboardToolExecutor, ...) so tools don't rebuild them on
 *  every call. */
export interface ToolSession {
  chatId: string
  cache: Map<string, unknown>
  /** Wired by the compaction integration; absent until that phase lands. */
  requestCompaction?: (focus?: string) => Promise<ToolCallResult>
}

export interface ToolContext {
  runtime: ToolRuntime
  session: ToolSession
}

export type ToolAvailability = { available: true } | { available: false; hint: string }

export interface RegisteredTool {
  definition: LLMToolDefinition
  pack: ToolPackId
  /** Optional pre-check; when it fails the tool is not invoked and the hint is
   *  returned as a graceful error the model can act on. */
  availability?: (ctx: ToolContext) => ToolAvailability
  execute(input: Record<string, any>, ctx: ToolContext): Promise<ToolCallResult>
}
