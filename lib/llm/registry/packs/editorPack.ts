import type { RegisteredTool, ToolContext } from '../types'
import type { ToolCallResult } from '../../sharedToolHelpers'
import { buildExtraContent } from '../../sharedToolHelpers'
import type { QueryInput, QueryResult } from '../../../stores/queryExecutionService'
import { generateArtifactId, type ChatArtifact } from '../../../chats/chat'
import { getChatExecutor } from './chatPacks'
import type Editor from '../../../editors/editor'

// Store-backed editor tools for the global chat: they operate on editors by
// id/name through editorStore, which is live-visible in an open Monaco tab
// (Monaco binds to editor.contents). Deliberately NOT built on
// EditorRefinementToolExecutor — its EditorContext callback shape is bound to
// a mounted component; these tools must work with no editor on screen.

const MAX_READ_CHARS = 40_000

function resolveEditor(ctx: ToolContext, ref: string): Editor | null {
  const store = ctx.runtime.editorStore
  const byId = store.editors[ref]
  if (byId && !byId.deleted) return byId as Editor
  const byName = store.getEditorByName(ref)
  return byName && !byName.deleted ? (byName as Editor) : null
}

function editorSummaryLine(editor: Editor): string {
  const lineCount = (editor.contents || '').split('\n').length
  return `- "${editor.name}" (id ${editor.id}, type ${editor.type}, connection ${editor.connection}, ${lineCount} lines${editor.tags.length ? `, tags: ${editor.tags.join(',')}` : ''})`
}

async function runEditorQuery(ctx: ToolContext, editor: Editor): Promise<ToolCallResult> {
  const connectionStore = ctx.runtime.connectionStore
  const connection =
    connectionStore.connections[editor.connectionId] ||
    connectionStore.connectionByName(editor.connection)
  if (!connection) {
    return { success: false, error: `Editor connection "${editor.connection}" not found.` }
  }
  if (!connection.connected) {
    return {
      success: false,
      error: `Connection "${connection.name}" is not connected. Use connect_data_connection first.`,
    }
  }
  if (!editor.contents?.trim()) {
    return { success: false, error: `Editor "${editor.name}" is empty.` }
  }

  const queryInput: QueryInput = {
    text: editor.contents,
    editorType: editor.type === 'sql' ? 'sql' : 'trilogy',
    imports: [],
    extraContent: buildExtraContent(connectionStore, ctx.runtime.editorStore, connection.id),
  }

  try {
    const handle = await ctx.runtime.queryExecutionService.executeQuery(connection.id, queryInput)
    const queryResult: QueryResult = await handle.resultPromise
    if (!queryResult.success) {
      return {
        success: false,
        error: queryResult.error || 'Query execution failed',
        executionTime: queryResult.executionTime,
        generatedSql: queryResult.generatedSql,
      }
    }
    if (!queryResult.results) {
      return { success: false, error: 'Query returned no results' }
    }
    const artifact: ChatArtifact = {
      id: generateArtifactId(),
      type: 'results',
      data: queryResult.results,
      config: {
        query: editor.contents,
        connectionName: connection.name,
        generatedSql: queryResult.generatedSql,
        executionTime: queryResult.executionTime,
        resultSize: queryResult.resultSize,
        columnCount: queryResult.columnCount,
        editorId: editor.id,
      },
    }
    return {
      success: true,
      artifact,
      artifactId: artifact.id,
      executionTime: queryResult.executionTime,
      generatedSql: queryResult.generatedSql,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Query execution failed',
    }
  }
}

export function buildEditorPack(): RegisteredTool[] {
  return [
    {
      pack: 'editor',
      definition: {
        name: 'list_editors',
        description:
          'List editors (query and data-model files), optionally filtered by data connection name. Editors tagged "source" define reusable datasources for the semantic model.',
        input_schema: {
          type: 'object',
          properties: {
            connection: {
              type: 'string',
              description: 'Optional connection name to filter by',
            },
          },
        },
      },
      execute: async (input, ctx) => {
        let editors = Object.values(ctx.runtime.editorStore.editors).filter(
          (e) => !e.deleted,
        ) as Editor[]
        if (input.connection) {
          const connection =
            ctx.runtime.connectionStore.connections[input.connection] ||
            ctx.runtime.connectionStore.connectionByName(input.connection)
          editors = editors.filter(
            (e) =>
              e.connection === input.connection || (connection && e.connectionId === connection.id),
          )
        }
        if (editors.length === 0) {
          return {
            success: true,
            message: input.connection
              ? `No editors found for connection "${input.connection}".`
              : 'No editors exist yet. Use create_editor to make one.',
          }
        }
        return {
          success: true,
          message: `${editors.length} editor(s):\n${editors
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(editorSummaryLine)
            .join('\n')}`,
        }
      },
    },
    {
      pack: 'editor',
      definition: {
        name: 'read_editor',
        description:
          'Read the full contents of an editor by id or name. Always read an editor before updating it.',
        input_schema: {
          type: 'object',
          properties: {
            editor_ref: { type: 'string', description: 'Editor id or exact name' },
          },
          required: ['editor_ref'],
        },
      },
      execute: async (input, ctx) => {
        const editor = resolveEditor(ctx, String(input.editor_ref ?? ''))
        if (!editor) {
          return {
            success: false,
            error: `Editor "${input.editor_ref}" not found. Use list_editors to see available editors.`,
          }
        }
        const contents = editor.contents || ''
        const lineCount = contents.split('\n').length
        const truncated = contents.length > MAX_READ_CHARS
        const body = truncated
          ? `${contents.slice(0, MAX_READ_CHARS)}\n...(truncated at ${MAX_READ_CHARS} of ${contents.length} characters)`
          : contents
        return {
          success: true,
          message: `Editor "${editor.name}" (id ${editor.id}, type ${editor.type}, ${lineCount} lines):\n\n${body}`,
        }
      },
    },
    {
      pack: 'editor',
      definition: {
        name: 'create_editor',
        description:
          'Create a new editor (query or data-model file) on a connection, optionally with initial contents, and open it.',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Editor name (e.g. "sales_aggregate")' },
            type: {
              type: 'string',
              enum: ['trilogy', 'sql'],
              description: 'Editor language',
            },
            connection: { type: 'string', description: 'Data connection name' },
            contents: { type: 'string', description: 'Optional initial contents' },
          },
          required: ['name', 'type', 'connection'],
        },
      },
      execute: async (input, ctx) => {
        const connection =
          ctx.runtime.connectionStore.connections[input.connection] ||
          ctx.runtime.connectionStore.connectionByName(input.connection)
        if (!connection) {
          return {
            success: false,
            error: `Connection "${input.connection}" not found.`,
          }
        }
        const type = input.type === 'sql' ? 'sql' : 'preql'
        const editor = ctx.runtime.editorStore.newEditor(
          String(input.name),
          type as any,
          connection.name,
          input.contents || '',
        )
        ctx.runtime.navigation?.setActiveEditor(editor.id)
        return {
          success: true,
          message: `Created editor "${editor.name}" (id ${editor.id}, type ${editor.type}) on connection "${connection.name}".`,
        }
      },
    },
    {
      pack: 'editor',
      definition: {
        name: 'update_editor_contents',
        description:
          'Replace the full contents of an editor. ALWAYS call read_editor first and produce the complete new file — this overwrites everything, including any recent user edits. Changes are live in the open editor.',
        input_schema: {
          type: 'object',
          properties: {
            editor_ref: { type: 'string', description: 'Editor id or exact name' },
            contents: { type: 'string', description: 'The complete new contents' },
          },
          required: ['editor_ref', 'contents'],
        },
      },
      execute: async (input, ctx) => {
        const editor = resolveEditor(ctx, String(input.editor_ref ?? ''))
        if (!editor) {
          return {
            success: false,
            error: `Editor "${input.editor_ref}" not found. Use list_editors to see available editors.`,
          }
        }
        if (typeof input.contents !== 'string') {
          return { success: false, error: 'contents must be a string.' }
        }
        const previousLines = (editor.contents || '').split('\n').length
        editor.setContent(input.contents)
        return {
          success: true,
          message: `Updated editor "${editor.name}": ${previousLines} -> ${input.contents.split('\n').length} lines. Changes are unsaved until the user (or autosave) saves.`,
        }
      },
    },
    {
      pack: 'editor',
      definition: {
        name: 'run_editor_query',
        description:
          "Execute an editor's contents as a query against its own connection and return results (with execution time in ms). Use this to test a datasource or query file after editing it.",
        input_schema: {
          type: 'object',
          properties: {
            editor_ref: { type: 'string', description: 'Editor id or exact name' },
          },
          required: ['editor_ref'],
        },
      },
      execute: async (input, ctx) => {
        const editor = resolveEditor(ctx, String(input.editor_ref ?? ''))
        if (!editor) {
          return {
            success: false,
            error: `Editor "${input.editor_ref}" not found. Use list_editors to see available editors.`,
          }
        }
        return runEditorQuery(ctx, editor)
      },
    },
    {
      pack: 'editor',
      definition: {
        name: 'validate_query',
        description:
          'Validate a Trilogy query against a connection without executing it. Cheaper than running; use to check syntax and model references.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The Trilogy query to validate' },
            connection: { type: 'string', description: 'Data connection name' },
          },
          required: ['query', 'connection'],
        },
      },
      execute: (input, ctx) =>
        getChatExecutor(ctx).validateQuery(
          String(input.query ?? ''),
          String(input.connection ?? ''),
        ),
    },
  ]
}
