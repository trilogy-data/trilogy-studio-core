import type { RegisteredTool, ToolContext } from '../types'
import type { ToolCallResult } from '../../sharedToolHelpers'
import { buildExtraContent } from '../../sharedToolHelpers'
import type { QueryInput, QueryResult } from '../../../stores/queryExecutionService'
import { generateArtifactId, type ChatArtifact } from '../../../chats/chat'
import { getChatExecutor } from './chatPacks'
import type Editor from '../../../editors/editor'
import { normalizeRemoteEditorPath } from '../../../editors/editor'

// Store-backed editor tools for the global chat: they operate on editors by
// id/name through editorStore, which is live-visible in an open Monaco tab
// (EditorCode watches editor.contents and syncs the Monaco model). Deliberately NOT built on
// EditorRefinementToolExecutor — its EditorContext callback shape is bound to
// a mounted component; these tools must work with no editor on screen.

const MAX_READ_CHARS = 40_000

function resolveEditor(ctx: ToolContext, ref: string): Editor | null {
  const store = ctx.runtime.editorStore
  // Own-property guard: refs like "__proto__" must not resolve prototype members.
  const byId = Object.prototype.hasOwnProperty.call(store.editors, ref)
    ? store.editors[ref]
    : undefined
  if (byId && !byId.deleted) return byId as Editor
  const byName = store.getEditorByName(ref)
  return byName && !byName.deleted ? (byName as Editor) : null
}

function editorSummaryLine(editor: Editor): string {
  const lineCount = (editor.contents || '').split('\n').length
  return `- "${editor.name}" (id ${editor.id}, type ${editor.type}, connection ${editor.connection}, ${lineCount} lines${editor.tags.length ? `, tags: ${editor.tags.join(',')}` : ''})`
}

function editorNameForRename(editor: Editor, requestedName: string): string {
  return editor.storage === 'remote'
    ? normalizeRemoteEditorPath(requestedName, editor.type)
    : requestedName
}

function findEditorNameConflict(ctx: ToolContext, editor: Editor, name: string): Editor | null {
  return (
    (Object.values(ctx.runtime.editorStore.editors).find(
      (candidate) =>
        !candidate.deleted &&
        candidate.id !== editor.id &&
        candidate.connectionId === editor.connectionId &&
        candidate.name === name,
    ) as Editor | undefined) || null
  )
}

function syncEditorModels(
  ctx: ToolContext,
  editorId: string,
  action: 'rename' | 'delete',
  newName?: string,
): number {
  let updated = 0
  for (const model of Object.values(ctx.runtime.modelStore?.models || {})) {
    if (!model.sources.some((source) => source.editor === editorId)) continue
    if (action === 'rename') {
      model.updateModelSourceName(editorId, newName || '')
    } else {
      model.removeModelSourceSimple(editorId)
    }
    updated += 1
  }
  return updated
}

async function persistEditorMutation(
  ctx: ToolContext,
  modelsChanged = false,
): Promise<{ success: true; suffix: string } | { success: false; error: string }> {
  const callbacks = [ctx.runtime.saveEditors, modelsChanged ? ctx.runtime.saveModels : undefined]
  const availableCallbacks = callbacks.filter(
    (callback): callback is () => Promise<unknown> | unknown => !!callback,
  )
  const needsAutosave = !ctx.runtime.saveEditors || (modelsChanged && !ctx.runtime.saveModels)

  try {
    await Promise.all(availableCallbacks.map((callback) => Promise.resolve(callback())))
  } catch (error) {
    return {
      success: false,
      error: `The editor change was applied in memory, but could not be saved: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }

  return {
    success: true,
    suffix: needsAutosave ? ' The change is marked for autosave.' : ' The change was saved.',
  }
}

function modelSyncSuffix(modelCount: number, action: 'renamed' | 'removed'): string {
  return modelCount > 0
    ? ` The editor source was ${action} in ${modelCount} model${modelCount === 1 ? '' : 's'}.`
    : ''
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
    currentFilename: editor.name,
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
    // Publish into the editor's own results state too, so a chat-driven run
    // behaves like the toolbar Run for an open (or later-opened) editor.
    // Clear a chart config built for a different result shape first — but
    // only when prior results actually exist: persisted editors rehydrate
    // with an empty Results, and comparing against that would wipe the
    // user's saved chart config on the first re-run.
    if (editor.chartConfig && editor.results?.headers && editor.results.headers.size > 0) {
      const sameShape =
        JSON.stringify(Array.from(editor.results.headers.keys())) ===
        JSON.stringify(Array.from(queryResult.results.headers.keys()))
      if (!sameShape) {
        editor.setChartConfig(null)
      }
    }
    ctx.runtime.editorStore.setEditorResults(editor.id, queryResult.results)
    editor.executed_contents = editor.contents
    if (queryResult.generatedSql) {
      editor.generated_sql = queryResult.generatedSql
    }
    if (typeof queryResult.executionTime === 'number') {
      editor.duration = queryResult.executionTime
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
        const name = String(input.name ?? '').trim()
        if (!name) {
          return { success: false, error: 'Editor name cannot be empty.' }
        }
        const connection =
          ctx.runtime.connectionStore.connections[input.connection] ||
          ctx.runtime.connectionStore.connectionByName(input.connection)
        if (!connection) {
          return {
            success: false,
            error: `Connection "${input.connection}" not found.`,
          }
        }
        const conflict = Object.values(ctx.runtime.editorStore.editors).find(
          (candidate) =>
            !candidate.deleted &&
            candidate.name === name &&
            (candidate.connectionId === connection.id || candidate.connection === connection.name),
        ) as Editor | undefined
        if (conflict) {
          return {
            success: false,
            error: `An editor named "${name}" already exists on connection "${connection.name}" (id ${conflict.id}). Use update_editor_contents to modify it, or pick a different name.`,
          }
        }
        const type = input.type === 'sql' ? 'sql' : 'preql'
        const editor = ctx.runtime.editorStore.newEditor(
          name,
          type as any,
          connection.name,
          input.contents || '',
        )
        ctx.runtime.navigation?.setActiveEditor(editor.id)
        const persistence = await persistEditorMutation(ctx)
        if (!persistence.success) return persistence
        return {
          success: true,
          message: `Created editor "${editor.name}" (id ${editor.id}, type ${editor.type}) on connection "${connection.name}".${persistence.suffix}`,
        }
      },
    },
    {
      pack: 'editor',
      definition: {
        name: 'rename_editor',
        description:
          'Rename an editor by id or exact name. The editor id stays stable, open tabs update immediately, and model-source aliases are kept in sync.',
        input_schema: {
          type: 'object',
          properties: {
            editor_ref: { type: 'string', description: 'Editor id or exact name' },
            new_name: {
              type: 'string',
              description: 'New editor name or path. Remote files keep a language extension.',
            },
          },
          required: ['editor_ref', 'new_name'],
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
        const requestedName = String(input.new_name ?? '').trim()
        if (!requestedName) {
          return { success: false, error: 'New editor name cannot be empty.' }
        }
        const newName = editorNameForRename(editor, requestedName)
        const conflict = findEditorNameConflict(ctx, editor, newName)
        if (conflict) {
          return {
            success: false,
            error: `An editor named "${newName}" already exists on connection "${editor.connection}" (id ${conflict.id}).`,
          }
        }

        const previousName = editor.name
        ctx.runtime.editorStore.updateEditorName(editor.id, requestedName)
        const updatedModels = syncEditorModels(ctx, editor.id, 'rename', editor.name)
        ctx.runtime.navigation?.updateTabName('editors', null, editor.id)
        const persistence = await persistEditorMutation(ctx, updatedModels > 0)
        if (!persistence.success) return persistence
        return {
          success: true,
          message: `Renamed editor "${previousName}" to "${editor.name}" (id ${editor.id}).${modelSyncSuffix(updatedModels, 'renamed')}${persistence.suffix}`,
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
        const persistence = await persistEditorMutation(ctx)
        if (!persistence.success) return persistence
        return {
          success: true,
          message: `Updated editor "${editor.name}": ${previousLines} -> ${input.contents.split('\n').length} lines.${persistence.suffix}`,
        }
      },
    },
    {
      pack: 'editor',
      definition: {
        name: 'delete_editor',
        description:
          'Delete an editor by id or exact name and close its open tab. This also removes it from any model that uses it as a source. This is destructive and requires explicit confirmation.',
        input_schema: {
          type: 'object',
          properties: {
            editor_ref: { type: 'string', description: 'Editor id or exact name' },
            confirm: {
              type: 'boolean',
              description: 'Must be true to confirm permanent deletion',
            },
          },
          required: ['editor_ref', 'confirm'],
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
        if (input.confirm !== true) {
          return {
            success: false,
            error: `Deletion of editor "${editor.name}" was not confirmed. Set confirm to true only when deletion is intended.`,
          }
        }
        if (editor.loading) {
          return {
            success: false,
            error: `Editor "${editor.name}" is currently running. Wait for it to finish or cancel it before deleting.`,
          }
        }

        editor.delete()
        const updatedModels = syncEditorModels(ctx, editor.id, 'delete')
        ctx.runtime.navigation?.closeTab(null, editor.id)
        const persistence = await persistEditorMutation(ctx, updatedModels > 0)
        if (!persistence.success) return persistence
        return {
          success: true,
          message: `Deleted editor "${editor.name}" (id ${editor.id}).${modelSyncSuffix(updatedModels, 'removed')}${persistence.suffix}`,
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
