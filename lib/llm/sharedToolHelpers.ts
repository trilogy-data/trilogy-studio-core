/**
 * Shared helpers extracted from ChatToolExecutor, DashboardToolExecutor, and
 * EditorRefinementToolExecutor to eliminate duplication across the three tool
 * executor classes.
 */

import type { ChatArtifact, ChatImport } from '../chats/chat'
import type { CompletionItem, ContentInput } from '../stores/resolver'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { EditorStoreType } from '../stores/editorStore'
import { fetchConceptsForImport, type FetchConceptsForImportDeps } from './importConcepts'

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

/**
 * Fetch a specific row range from artifact data that contains tabular rows.
 * Both ChatToolExecutor and EditorRefinementToolExecutor resolve the artifact
 * their own way, then delegate the row-slicing logic here.
 */
export function getArtifactRowsFromData(
  artifactId: string,
  artifactData: any,
  startRow: number,
  endRow: number,
): ToolCallResult {
  const jsonData =
    typeof artifactData?.toJSON === 'function' ? artifactData.toJSON() : artifactData
  const rows: any[] = jsonData?.data

  if (!Array.isArray(rows)) {
    return { success: false, error: `Artifact "${artifactId}" has no row data.` }
  }

  const totalRows = rows.length
  const clampedStart = Math.max(0, Math.min(startRow, totalRows - 1))
  const clampedEnd = Math.max(clampedStart, Math.min(endRow, totalRows - 1))
  const slice = rows.slice(clampedStart, clampedEnd + 1)

  return {
    success: true,
    message:
      `Rows ${clampedStart}-${clampedEnd} of ${totalRows} total from artifact "${artifactId}":\n` +
      JSON.stringify({ headers: jsonData.headers, data: slice }, null, 2),
  }
}

// ---------------------------------------------------------------------------
// Shared import management
// ---------------------------------------------------------------------------

/**
 * Abstraction over how active imports are read/written. Chat and Dashboard
 * executors each wire this differently (chat uses chatStore, dashboard uses
 * injected callbacks).
 */
export interface ImportStateAccessor {
  getActiveImports(): ChatImport[]
  setActiveImports(imports: ChatImport[]): void
  getConnectionName(): string
}

/** Get available imports (editor files) for a connection. */
export function getAvailableImports(
  editorStore: EditorStoreType | null,
  connectionName: string,
): ChatImport[] {
  if (!editorStore) return []

  return Object.values(editorStore.editors)
    .filter((editor) => editor.connection === connectionName && !editor.deleted)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((editor) => ({
      id: editor.id,
      name: editor.name.replace(/\//g, '.'),
      alias: '',
    }))
}

/** Select (or clear) the active import and fetch its concepts. */
export async function selectActiveImport(
  importName: string,
  accessor: ImportStateAccessor,
  deps: FetchConceptsForImportDeps,
  editorStore: EditorStoreType | null,
): Promise<ToolCallResult> {
  const connectionName = accessor.getConnectionName()

  // Handle clearing
  if (!importName || importName.trim() === '') {
    accessor.setActiveImports([])
    return {
      success: true,
      message: 'Cleared active data source selection.',
      triggersSymbolRefresh: true,
    }
  }

  if (!connectionName) {
    return {
      success: false,
      error: 'No data connection selected. Please select a data connection first.',
    }
  }

  const available = getAvailableImports(editorStore, connectionName)
  const importToSelect = available.find(
    (i) => i.name === importName || i.name.endsWith(`.${importName}`),
  )

  if (!importToSelect) {
    return {
      success: false,
      error: `Import "${importName}" not found. Available imports: ${available.map((i) => i.name).join(', ') || 'none'}`,
    }
  }

  const activeImports = accessor.getActiveImports()
  const alreadyActive =
    activeImports.length === 1 && activeImports[0].id === importToSelect.id

  if (!alreadyActive) {
    accessor.setActiveImports([importToSelect])
  }

  const conceptsOutput = await fetchConceptsForImport(deps, importToSelect, connectionName)

  const prefix = alreadyActive
    ? `"${importToSelect.name}" is already the active data source.`
    : `Successfully selected "${importToSelect.name}" as the active data source.`

  return {
    success: true,
    message: `${prefix}\n\n${conceptsOutput}`,
    triggersSymbolRefresh: !alreadyActive,
  }
}

/** List available imports with active status. */
export function listAvailableImports(
  accessor: ImportStateAccessor,
  editorStore: EditorStoreType | null,
): ToolCallResult {
  const connectionName = accessor.getConnectionName()
  if (!connectionName) {
    return {
      success: false,
      error: 'No data connection selected. Please select a data connection first.',
    }
  }

  const available = getAvailableImports(editorStore, connectionName)
  const activeImports = accessor.getActiveImports()
  const activeImport = activeImports.length > 0 ? activeImports[0] : null

  if (available.length === 0) {
    return {
      success: true,
      message: `No data sources available on connection "${connectionName}".`,
    }
  }

  const currentStatus = activeImport
    ? `Current active data source: ${activeImport.name}\n\n`
    : 'No data source currently selected.\n\n'

  return {
    success: true,
    message: `${currentStatus}Available data sources for connection "${connectionName}":\n${available.map((i) => `- ${i.name}${activeImport?.id === i.id ? ' (active)' : ''}`).join('\n')}\n\nUse select_active_import to select a data source.`,
  }
}
