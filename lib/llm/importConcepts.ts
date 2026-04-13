import type QueryExecutionService from '../stores/queryExecutionService'
import type { QueryInput } from '../stores/queryExecutionService'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { ChatImport } from '../chats/chat'
import type { ContentInput } from '../stores/resolver'

export interface FetchConceptsForImportDeps {
  connectionStore: ConnectionStoreType
  editorStore: EditorStoreType | null
  queryExecutionService: QueryExecutionService
}

/**
 * Validates a no-op query against the given import to extract every concept
 * (field) in scope, and returns a human-readable bullet list suitable for
 * inclusion in a tool result message.
 *
 * Used by both the chat and dashboard agent tool executors so the
 * `select_active_import` tool exposes the same field information across
 * surfaces.
 */
export async function fetchConceptsForImport(
  deps: FetchConceptsForImportDeps,
  imp: ChatImport,
  connectionName: string,
): Promise<string> {
  const { connectionStore, editorStore, queryExecutionService } = deps

  try {
    const editorContent = editorStore?.editors[imp.id]?.contents || ''
    if (!editorContent) {
      return 'No fields found in this data source.'
    }

    // Gather all editor sources for this connection so dependent imports resolve
    const allConnectionEditors = editorStore
      ? Object.values(editorStore.editors)
          .filter((editor) => editor.connection === connectionName && !editor.deleted)
          .map((editor) => ({ alias: editor.name, contents: editor.contents }))
      : []

    const connectionSources = connectionStore.getConnectionSources(connectionName)
    const extraContentMap = new Map<string, string>()
    connectionSources.forEach((s) => extraContentMap.set(s.alias, s.contents))
    allConnectionEditors.forEach((s) => extraContentMap.set(s.alias, s.contents))

    const extraContent: ContentInput[] = Array.from(extraContentMap.entries()).map(
      ([alias, contents]) => ({ alias, contents }),
    )

    const queryInput: QueryInput = {
      text: 'SELECT 1',
      editorType: 'trilogy' as const,
      imports: [{ name: imp.name, alias: imp.alias || '' }],
      extraContent,
    }

    const validation = await queryExecutionService.validateQuery(connectionName, queryInput, false)

    if (validation?.data?.completion_items) {
      const concepts = validation.data.completion_items.filter(
        (item) => item.trilogyType === 'concept',
      )

      if (concepts.length === 0) {
        return 'No fields found in this data source.'
      }

      const conceptsList = concepts
        .map((c) => {
          let entry = `- ${c.label} (${c.datatype || c.type})`
          if (c.description) {
            entry += `: ${c.description}`
          }
          if (c.calculation) {
            entry += ` [calculated: ${c.calculation}]`
          }
          return entry
        })
        .join('\n')

      return `AVAILABLE FIELDS (${concepts.length} total):\n${conceptsList}`
    }

    return 'Unable to fetch field information for this data source.'
  } catch (error) {
    console.error('Failed to fetch concepts for import:', error)
    return 'Error fetching field information for this data source.'
  }
}
