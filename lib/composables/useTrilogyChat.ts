import { useTrilogyCore, type TrilogyCoreOptions } from './useTrilogyCore'
import { useChatWithTools, type UseChatWithToolsReturn } from './useChatWithTools'
import type { NavigationStore } from '../stores/useScreenNavigation'

export interface TrilogyChatOptions extends TrilogyCoreOptions {
  /**
   * Data connection name to use for queries.
   * Must match a connection added to connectionStore.
   */
  dataConnectionName?: string

  /**
   * Initial title for the chat (default: 'Chat')
   */
  initialTitle?: string

  /**
   * Whether to persist chat to the chat store (default: true).
   * Set to false for throwaway/embedded chat modes.
   */
  persistChat?: boolean

  /**
   * Optional callback when the chat title is updated.
   * Alternative to using navigationStore for tab updates.
   */
  onTitleUpdate?: (newTitle: string, chatId: string) => void

  /**
   * Optional navigation store for tab name updates.
   * If not provided, one will be created internally.
   */
  navigationStore?: NavigationStore | null
}

/**
 * Simplified composable for Trilogy chat with tool execution.
 *
 * This is a convenience wrapper that combines useTrilogyCore() and
 * useChatWithTools() into a single call. All stores are automatically
 * initialized internally.
 *
 * @example
 * ```typescript
 * // Minimal setup - just start chatting
 * const chat = useTrilogyChat()
 *
 * // With a data connection for queries
 * const chat = useTrilogyChat({
 *   dataConnectionName: 'my-database',
 * })
 *
 * // Throwaway chat (not persisted)
 * const chat = useTrilogyChat({
 *   persistChat: false,
 *   initialTitle: 'Quick Question',
 * })
 *
 * // With title update callback
 * const chat = useTrilogyChat({
 *   onTitleUpdate: (title, id) => console.log(`Chat ${id} renamed to ${title}`),
 * })
 * ```
 */
export function useTrilogyChat(options: TrilogyChatOptions = {}): UseChatWithToolsReturn {
  const {
    // TrilogyCoreOptions
    storeQueryHistory,
    resolverCacheSize,
    // TrilogyChatOptions
    dataConnectionName,
    initialTitle = 'Chat',
    persistChat = true,
    onTitleUpdate,
    navigationStore: providedNavigationStore,
  } = options

  // Initialize all core stores and services
  const core = useTrilogyCore({
    storeQueryHistory,
    resolverCacheSize,
  })

  // Use provided navigationStore or the one from core
  const navigationStore = providedNavigationStore ?? core.navigationStore

  // Create the chat composable with all dependencies wired up
  return useChatWithTools({
    llmConnectionStore: core.llmConnectionStore,
    connectionStore: core.connectionStore,
    queryExecutionService: core.queryExecutionService,
    editorStore: core.editorStore,
    chatStore: persistChat ? core.chatStore : null,
    navigationStore: persistChat ? navigationStore : null,
    dataConnectionName,
    initialTitle,
    onTitleUpdate,
  })
}

export default useTrilogyChat
