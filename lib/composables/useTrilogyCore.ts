import useLLMConnectionStore from '../stores/llmStore'
import useConnectionStore from '../stores/connectionStore'
import useEditorStore from '../stores/editorStore'
import useChatStore from '../stores/chatStore'
import useUserSettingsStore from '../stores/userSettingsStore'
import useScreenNavigation from '../stores/useScreenNavigation'
import TrilogyResolver from '../stores/resolver'
import QueryExecutionService from '../stores/queryExecutionService'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { ChatStoreType } from '../stores/chatStore'
import type { UserSettingsStoreType } from '../stores/userSettingsStore'
import type { NavigationStore } from '../stores/useScreenNavigation'

export interface TrilogyCoreOptions {
  /** Whether to store query history (default: true) */
  storeQueryHistory?: boolean
  /** Cache size for the resolver (default: 100) */
  resolverCacheSize?: number
}

export interface TrilogyCoreReturn {
  // Stores
  llmConnectionStore: LLMConnectionStoreType
  connectionStore: ConnectionStoreType
  editorStore: EditorStoreType
  chatStore: ChatStoreType
  navigationStore: NavigationStore
  userSettingsStore: UserSettingsStoreType

  // Services
  queryExecutionService: QueryExecutionService
  resolver: TrilogyResolver
}

/**
 * Initialize all core Trilogy stores and services.
 *
 * This composable provides a single entry point for setting up the full
 * Trilogy stack, including data connections, LLM connections, editors,
 * chat persistence, and query execution.
 *
 * @example
 * ```typescript
 * // In your app setup
 * const trilogy = useTrilogyCore()
 *
 * // Access individual stores
 * trilogy.connectionStore.addConnection(...)
 * trilogy.llmConnectionStore.newConnection(...)
 *
 * // Use with other composables
 * const chat = useChatWithTools({
 *   llmConnectionStore: trilogy.llmConnectionStore,
 *   connectionStore: trilogy.connectionStore,
 *   // ...
 * })
 * ```
 */
export function useTrilogyCore(options: TrilogyCoreOptions = {}): TrilogyCoreReturn {
  const { storeQueryHistory = true, resolverCacheSize = 100 } = options

  // Initialize all Pinia stores
  const llmConnectionStore = useLLMConnectionStore()
  const connectionStore = useConnectionStore()
  const editorStore = useEditorStore()
  const chatStore = useChatStore()
  const userSettingsStore = useUserSettingsStore()
  const navigationStore = useScreenNavigation()

  // Initialize services that depend on stores
  const resolver = new TrilogyResolver(userSettingsStore, resolverCacheSize)
  const queryExecutionService = new QueryExecutionService(
    resolver,
    connectionStore,
    storeQueryHistory,
  )

  return {
    // Stores
    llmConnectionStore,
    connectionStore,
    editorStore,
    chatStore,
    navigationStore,
    userSettingsStore,

    // Services
    queryExecutionService,
    resolver,
  }
}

export default useTrilogyCore
