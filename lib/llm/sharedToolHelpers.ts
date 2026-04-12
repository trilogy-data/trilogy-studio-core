/**
 * Shared helpers extracted from ChatToolExecutor, DashboardToolExecutor, and
 * EditorRefinementToolExecutor to eliminate duplication across the three tool
 * executor classes.
 */

import type { ChatArtifact, ChatImport } from '../chats/chat'
import type { CompletionItem, ContentInput } from '../stores/resolver'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { EditorStoreType } from '../stores/editorStore'

export interface ToolCallResult {
  success: boolean
  artifact?: ChatArtifact
  artifactId?: string
  error?: string
  message?: string
  executionTime?: number
  query?: string
  generatedSql?: string
  formattedQuery?: string
  triggersSymbolRefresh?: boolean
  terminatesLoop?: boolean
  awaitsUserInput?: boolean
  availableSymbols?: CompletionItem[]
  imageData?: {
    data: string
    mediaType: string
  }
}

/**
 * Shared connect-data-connection logic used by all three tool executors.
 * The optional `onConnected` callback lets callers perform side-effects
 * after a successful connection (e.g. ChatToolExecutor updates the chat's
 * data connection name).
 */
export async function connectDataConnection(
  connectionStore: ConnectionStoreType,
  connectionName: string,
  opts?: { onConnected?: (connectionName: string) => void },
): Promise<ToolCallResult> {
  if (!connectionName || typeof connectionName !== 'string') {
    return {
      success: false,
      error: `Connection name is required. Available connections: ${Object.keys(connectionStore.connections).join(', ') || 'None'}`,
    }
  }

  const connection = connectionStore.connections[connectionName]
  if (!connection) {
    return {
      success: false,
      error: `Connection "${connectionName}" not found. Available connections: ${Object.keys(connectionStore.connections).join(', ') || 'None'}`,
    }
  }

  if (connection.connected) {
    opts?.onConnected?.(connectionName)
    return {
      success: true,
      message: `Connection "${connectionName}" is already active.`,
    }
  }

  try {
    await connectionStore.connectConnection(connectionName)
    opts?.onConnected?.(connectionName)
    return {
      success: true,
      message: `Successfully connected to "${connectionName}".`,
      triggersSymbolRefresh: true,
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to connect to "${connectionName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Build the `ContentInput[]` array that provides cross-file context to the
 * Trilogy query engine. Merges connection sources, editor contents for the
 * connection, and (optionally) active imports. Duplicate aliases are resolved
 * by preferring the later source in the chain.
 */
export function buildExtraContent(
  connectionStore: ConnectionStoreType,
  editorStore: EditorStoreType | null,
  connectionName: string,
  activeImports?: ChatImport[],
): ContentInput[] {
  const extraContentMap = new Map<string, string>()

  // Connection sources first
  const connectionSources = connectionStore.getConnectionSources(connectionName)
  connectionSources.forEach((s) => extraContentMap.set(s.alias, s.contents))

  // Overlay with all editors for this connection
  if (editorStore) {
    Object.values(editorStore.editors)
      .filter((editor) => editor.connection === connectionName && !editor.deleted)
      .forEach((editor) => {
        extraContentMap.set(editor.name, editor.contents)
      })
  }

  // Overlay active imports (if provided)
  if (activeImports) {
    activeImports.forEach((imp) => {
      const alias = imp.alias || imp.name
      const contents = editorStore?.editors[imp.id]?.contents || ''
      if (contents) {
        extraContentMap.set(alias, contents)
      }
    })
  }

  return Array.from(extraContentMap.entries()).map(([alias, contents]) => ({ alias, contents }))
}
