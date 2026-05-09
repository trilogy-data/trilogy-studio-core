import type { ChatStoreType } from '../stores/chatStore'
import type { ProjectStoreType } from '../stores/projectStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type QueryExecutionService from '../stores/queryExecutionService'
import type { QueryInput, QueryResult } from '../stores/queryExecutionService'
import type { ToolCallResult } from './sharedToolHelpers'
import { executeTrilogyQueryCore, buildExtraContent } from './sharedToolHelpers'
import type { EditorType } from '../editors/fileTypes'
import { getEditorTypeForPath } from '../editors/fileTypes'
import { EditorTag } from '../editors'

/**
 * Tool executor for architect subchats. File-centric — never spawns more
 * subchats, never asks the user. Operates on the project recorded in
 * subchat.parentProjectId at spawn time, so user navigation can't shift
 * what the architect is working on mid-run.
 */
export class ArchitectToolExecutor {
  constructor(
    private chatStore: ChatStoreType,
    private projectStore: ProjectStoreType,
    private editorStore: EditorStoreType,
    private connectionStore: ConnectionStoreType,
    private queryExecutionService: QueryExecutionService,
    private chatId: string,
  ) {}

  // ---------- context resolution ----------

  private get projectId(): string {
    const chat = this.chatStore.chats[this.chatId]
    return chat?.parentProjectId || this.projectStore.activeProjectId || ''
  }

  private get project() {
    const id = this.projectId
    return id ? this.projectStore.projects[id] || null : null
  }

  private get connection() {
    const project = this.project
    if (!project) return null
    return (
      (project.dataConnectionId && this.connectionStore.connections[project.dataConnectionId]) ||
      null
    )
  }

  private findEditorByName(name: string) {
    const project = this.project
    if (!project) return null
    for (const id of project.editorIds) {
      const ed = this.editorStore.editors[id]
      if (ed && !ed.deleted && ed.name === name) return ed
    }
    return null
  }

  // ---------- dispatch ----------

  async executeToolCall(
    toolName: string,
    toolInput: Record<string, any>,
  ): Promise<ToolCallResult> {
    switch (toolName) {
      case 'list_project_files':
        return this.listProjectFiles()
      case 'read_project_file':
        return this.readProjectFile(toolInput.name)
      case 'create_file':
        return this.createFile(toolInput.name, toolInput.type, toolInput.content)
      case 'update_file':
        return this.updateFile(toolInput.name, toolInput.content)
      case 'set_file_purpose':
        return this.setFilePurpose(toolInput.name, toolInput.purpose)
      case 'rename_project_file':
        return this.renameProjectFile(toolInput.name, toolInput.new_name)
      case 'delete_project_file':
        return this.deleteProjectFile(toolInput.name)
      case 'lint_file':
        return this.lintFile(toolInput.name)
      case 'run_trilogy_query':
        return this.runTrilogyQuery(toolInput.query)
      case 'return_to_user':
        return {
          success: true,
          message: toolInput.message || 'Done.',
          terminatesLoop: true,
        }
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}. Available: list_project_files, read_project_file, create_file, update_file, set_file_purpose, rename_project_file, delete_project_file, lint_file, run_trilogy_query, return_to_user`,
        }
    }
  }

  // ---------- tools ----------

  private listProjectFiles(): ToolCallResult {
    const project = this.project
    if (!project) return { success: false, error: 'No project context.' }
    const lines = project.editorIds
      .map((id) => this.editorStore.editors[id])
      .filter((e) => e && !e.deleted)
      .map((ed) => `  - ${ed.name}  (${ed.type}, ${(ed.contents || '').length} bytes)`)
    return {
      success: true,
      message:
        lines.length > 0
          ? `Files in project "${project.name}":\n${lines.join('\n')}`
          : `Project "${project.name}" has no files attached yet.`,
    }
  }

  private readProjectFile(name: string): ToolCallResult {
    if (!name) return { success: false, error: 'name is required' }
    const editor = this.findEditorByName(name)
    if (!editor) {
      return { success: false, error: `File "${name}" not found in project.` }
    }
    const body = middleTruncate(editor.contents)
    return {
      success: true,
      message: `Contents of ${name} (${editor.type}, ${editor.contents.length} bytes):\n\n${body}`,
    }
  }

  private async createFile(
    name: string,
    type: string,
    content: string,
  ): Promise<ToolCallResult> {
    if (!name) return { success: false, error: 'name is required' }
    if (typeof content !== 'string') {
      return { success: false, error: 'content is required' }
    }
    const editorType = normalizeArchitectFileType(type)
    if (!editorType) {
      return {
        success: false,
        error: `type must be 'trilogy' or 'sql' (got ${JSON.stringify(type)}).`,
      }
    }
    const project = this.project
    if (!project) return { success: false, error: 'No project context.' }

    const filename = ensureExtension(name, editorType)
    if (this.findEditorByName(filename)) {
      return {
        success: false,
        error: `File "${filename}" already exists. Use update_file to modify.`,
      }
    }

    const conn = this.connection
    const editor = this.editorStore.newEditor(filename, editorType, conn?.name ?? '', content)
    this.projectStore.addEditorToProject(project.id, editor.id)

    const validation =
      editorType === 'preql' ? `\n${await this.validateContent(filename, content)}` : ''
    return {
      success: true,
      message: `Created ${filename}.${validation}`,
      triggersSymbolRefresh: editorType === 'preql',
    }
  }

  private async updateFile(name: string, content: string): Promise<ToolCallResult> {
    if (!name) return { success: false, error: 'name is required' }
    if (typeof content !== 'string') {
      return { success: false, error: 'content is required' }
    }
    const editor = this.findEditorByName(name)
    if (!editor) {
      return {
        success: false,
        error: `File "${name}" not found. Use create_file to add it.`,
      }
    }
    const editorType: EditorType =
      (getEditorTypeForPath(name) as EditorType | null) || (editor.type as EditorType)
    if (editorType !== 'preql' && editorType !== 'trilogy' && editorType !== 'sql') {
      return {
        success: false,
        error: `update_file handles .preql and .sql files; ${name} is ${editorType}.`,
      }
    }
    editor.contents = content
    editor.changed = true

    const isTrilogy = editorType === 'preql' || editorType === 'trilogy'
    const validation = isTrilogy ? `\n${await this.validateContent(name, content)}` : ''
    let purposeNote = ''
    // If the file is tagged as a startup script, re-run startup so changes
    // land in the live session immediately. Otherwise the architect's next
    // run_trilogy_query would see stale tables.
    if (editor.tags.includes(EditorTag.STARTUP_SCRIPT)) {
      const conn = this.connection
      if (conn) {
        try {
          await this.connectionStore.connectConnection(conn.id)
          purposeNote = `\nRe-ran startup against ${conn.name}.`
        } catch (e) {
          purposeNote = `\nWarning: re-running startup failed: ${
            e instanceof Error ? e.message : String(e)
          }`
        }
      }
    }
    return {
      success: true,
      message: `Updated ${name}.${validation}${purposeNote}`,
      triggersSymbolRefresh: isTrilogy,
    }
  }

  private async setFilePurpose(name: string, purpose: string): Promise<ToolCallResult> {
    if (!name) return { success: false, error: 'name is required' }
    const normalized = typeof purpose === 'string' ? purpose.toLowerCase() : ''
    if (normalized !== 'startup' && normalized !== 'none') {
      return {
        success: false,
        error: `purpose must be 'startup' or 'none' (got ${JSON.stringify(purpose)}).`,
      }
    }
    const editor = this.findEditorByName(name)
    if (!editor) {
      return { success: false, error: `File "${name}" not found in project.` }
    }
    if (normalized === 'none') {
      editor.removeTag(EditorTag.STARTUP_SCRIPT)
      return { success: true, message: `Cleared purpose tags on ${name}.` }
    }
    editor.addTag(EditorTag.STARTUP_SCRIPT)
    // Re-run startup so the script takes effect immediately. connectConnection
    // calls reset() then runStartup(), which executes every editor tagged
    // STARTUP_SCRIPT for this connection.
    const conn = this.connection
    if (!conn) {
      return {
        success: true,
        message: `Tagged ${name} as startup. No connection bound — will run on next connect.`,
      }
    }
    try {
      await this.connectionStore.connectConnection(conn.id)
      return {
        success: true,
        message: `Tagged ${name} as startup and re-ran startup against ${conn.name}.`,
      }
    } catch (e) {
      return {
        success: false,
        error: `Tagged ${name} as startup, but startup execution failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      }
    }
  }

  private renameProjectFile(name: string, newName: string): ToolCallResult {
    if (!name) return { success: false, error: 'name is required' }
    if (!newName) return { success: false, error: 'new_name is required' }
    if (name === newName) {
      return { success: false, error: 'new_name is identical to current name.' }
    }
    const editor = this.findEditorByName(name)
    if (!editor) {
      return { success: false, error: `File "${name}" not found in project.` }
    }
    if (this.findEditorByName(newName)) {
      return {
        success: false,
        error: `Cannot rename: "${newName}" already exists in this project.`,
      }
    }
    editor.setName(newName)
    return {
      success: true,
      message: `Renamed "${name}" to "${newName}".`,
      triggersSymbolRefresh: true,
    }
  }

  private deleteProjectFile(name: string): ToolCallResult {
    if (!name) return { success: false, error: 'name is required' }
    const project = this.project
    if (!project) return { success: false, error: 'No project context.' }
    const editor = this.findEditorByName(name)
    if (!editor) {
      return { success: false, error: `File "${name}" not found in project.` }
    }
    this.projectStore.removeEditorFromProject(project.id, editor.id)
    this.editorStore.removeEditor(editor.id)
    return {
      success: true,
      message: `Deleted "${name}" from project.`,
      triggersSymbolRefresh: true,
    }
  }

  private async lintFile(name: string): Promise<ToolCallResult> {
    if (!name) return { success: false, error: 'name is required' }
    const editor = this.findEditorByName(name)
    if (!editor) {
      return { success: false, error: `File "${name}" not found.` }
    }
    if (editor.type === 'preql' || editor.type === 'trilogy') {
      const result = await this.validateContent(name, editor.contents)
      return { success: true, message: `Lint of ${name} (trilogy):\n${result}` }
    }
    if (editor.type === 'sql') {
      // No static SQL linter available. Surface that explicitly so the
      // architect doesn't think the file is OK because lint_file returned
      // success — and points it at the runtime check that does work.
      return {
        success: true,
        message: `Lint of ${name} (sql): no static linter for SQL. Tag it with set_file_purpose=startup to validate execution against the connection, or run_trilogy_query to exercise its tables.`,
      }
    }
    return {
      success: false,
      error: `lint_file handles trilogy and sql files; ${name} is ${editor.type}.`,
    }
  }

  private async runTrilogyQuery(query: string): Promise<ToolCallResult> {
    const conn = this.connection
    if (!conn) {
      return { success: false, error: 'No data connection bound to this project.' }
    }
    if (!conn.connected) {
      try {
        await this.connectionStore.connectConnection(conn.id)
      } catch (e) {
        return {
          success: false,
          error: `Could not connect to ${conn.name}: ${e instanceof Error ? e.message : String(e)}`,
        }
      }
    }

    const result = await executeTrilogyQueryCore(
      this.queryExecutionService,
      this.connectionStore,
      this.editorStore,
      conn.name,
      query,
    )
    if (!('queryResult' in result)) {
      // ToolCallResult error path
      return result
    }
    const qr = result.queryResult
    return {
      success: true,
      message: formatPreview(qr),
      executionTime: qr.executionTime,
      generatedSql: qr.generatedSql,
      query,
    }
  }

  // ---------- helpers ----------

  private async validateContent(filename: string, content: string): Promise<string> {
    const conn = this.connection
    if (!conn) return 'No connection bound — skipped validation.'

    const queryInput: QueryInput = {
      text: 'select 1;',
      editorType: 'trilogy',
      imports: [],
      extraContent: [
        ...buildExtraContent(this.connectionStore, this.editorStore, conn.id),
        { alias: filename.replace(/\.preql$/, ''), contents: content },
      ],
      currentFilename: filename,
    }

    try {
      const validation = await this.queryExecutionService.validateQuery(conn.id, queryInput, false)
      if (!validation) return 'Validator returned no response.'
      const items = validation.data?.items ?? []
      const errors = items.filter((i) => i.severity <= 2)
      const others = items.filter((i) => i.severity > 2)
      const concepts = validation.data?.completion_items ?? []
      const conceptNames = concepts
        .filter((c) => c.trilogyType === 'concept')
        .map((c) => c.label)

      const lines: string[] = []
      if (errors.length === 0) {
        lines.push(`OK — ${conceptNames.length} concepts visible.`)
      } else {
        lines.push(`${errors.length} error(s):`)
        for (const e of errors.slice(0, 10)) {
          lines.push(`  - line ${e.startLineNumber}: ${e.message}`)
        }
      }
      if (others.length > 0) {
        lines.push(`${others.length} info/warning(s):`)
        for (const w of others.slice(0, 5)) {
          lines.push(`  - line ${w.startLineNumber}: ${w.message}`)
        }
      }
      if (conceptNames.length > 0 && conceptNames.length <= 30) {
        lines.push(`Concepts: ${conceptNames.join(', ')}`)
      } else if (conceptNames.length > 30) {
        lines.push(`Concepts (first 30 of ${conceptNames.length}): ${conceptNames.slice(0, 30).join(', ')}`)
      }
      return lines.join('\n')
    } catch (e) {
      return `Validation threw: ${e instanceof Error ? e.message : String(e)}`
    }
  }
}

// Cap how much of a file the architect can pull into its context. Big CSVs
// or generated SQL dumps can blow up the token budget on a single read,
// so when over threshold we keep the head + tail and drop the middle —
// the architect still sees structure (column headers / opening clauses)
// and how the file ends, which is enough to decide on edits without
// sucking the whole blob into prompt history.
const READ_FILE_EDGE_CHARS = 4000
const READ_FILE_MAX_CHARS = READ_FILE_EDGE_CHARS * 2

function normalizeArchitectFileType(type: string): 'preql' | 'sql' | null {
  switch (typeof type === 'string' ? type.toLowerCase() : '') {
    case 'trilogy':
    case 'preql':
      return 'preql'
    case 'sql':
      return 'sql'
    default:
      return null
  }
}

function ensureExtension(name: string, type: 'preql' | 'sql'): string {
  if (type === 'preql') {
    if (name.endsWith('.preql') || name.endsWith('.trilogy')) return name
    return `${name}.preql`
  }
  return name.endsWith('.sql') ? name : `${name}.sql`
}

function middleTruncate(content: string): string {
  if (content.length <= READ_FILE_MAX_CHARS) return content
  const head = content.slice(0, READ_FILE_EDGE_CHARS)
  const tail = content.slice(-READ_FILE_EDGE_CHARS)
  const omitted = content.length - READ_FILE_EDGE_CHARS * 2
  return `${head}\n<redacted ${omitted} chars>\n${tail}`
}

function formatPreview(qr: QueryResult): string {
  const sql = qr.generatedSql ? `\nGenerated SQL:\n${qr.generatedSql}\n` : ''
  const rows = (qr.results?.data || []) as unknown[]
  const headers = qr.results?.headers ? Array.from(qr.results.headers.keys()) : []
  const head = rows.slice(0, 10)
  return [
    `Query OK — ${rows.length} rows in ${qr.executionTime}ms.`,
    sql,
    headers.length > 0 ? `Columns: ${headers.join(', ')}` : '',
    head.length > 0 ? `\nFirst rows:\n${JSON.stringify(head, null, 2)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
