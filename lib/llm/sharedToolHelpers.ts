/**
 * Shared helpers extracted from ChatToolExecutor, DashboardToolExecutor, and
 * EditorRefinementToolExecutor to eliminate duplication across the three tool
 * executor classes.
 */

import type { ChatArtifact } from '../chats/chat'
import type { CompletionItem } from '../stores/resolver'
import type { ConnectionStoreType } from '../stores/connectionStore'

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
