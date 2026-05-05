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
      case 'create_trilogy_file':
        return this.createTrilogyFile(toolInput.name, toolInput.content)
      case 'update_trilogy_file':
        return this.updateTrilogyFile(toolInput.name, toolInput.content)
      case 'validate_trilogy_file':
        return this.validateTrilogyFile(toolInput.name)
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
          error: `Unknown tool: ${toolName}. Available: list_project_files, read_project_file, create_trilogy_file, update_trilogy_file, validate_trilogy_file, run_trilogy_query, return_to_user`,
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

  private async createTrilogyFile(name: string, content: string): Promise<ToolCallResult> {
    if (!name) return { success: false, error: 'name is required' }
    if (typeof content !== 'string') {
      return { success: false, error: 'content is required' }
    }
    const project = this.project
    if (!project) return { success: false, error: 'No project context.' }

    const filename = name.endsWith('.preql') ? name : `${name}.preql`
    if (this.findEditorByName(filename)) {
      return {
        success: false,
        error: `File "${filename}" already exists. Use update_trilogy_file to modify.`,
      }
    }

    const conn = this.connection
    const editor = this.editorStore.newEditor(filename, 'preql', conn?.name ?? '', content)
    this.projectStore.addEditorToProject(project.id, editor.id)

    const validation = await this.validateContent(filename, content)
    return {
      success: true,
      message: `Created ${filename}.\n${validation}`,
      triggersSymbolRefresh: true,
    }
  }

  private async updateTrilogyFile(name: string, content: string): Promise<ToolCallResult> {
    if (!name) return { success: false, error: 'name is required' }
    if (typeof content !== 'string') {
      return { success: false, error: 'content is required' }
    }
    const editor = this.findEditorByName(name)
    if (!editor) {
      return {
        success: false,
        error: `File "${name}" not found. Use create_trilogy_file to add it.`,
      }
    }
    const editorType: EditorType =
      (getEditorTypeForPath(name) as EditorType | null) || (editor.type as EditorType)
    if (editorType !== 'preql' && editorType !== 'trilogy') {
      return {
        success: false,
        error: `update_trilogy_file only edits .preql files; ${name} is ${editorType}.`,
      }
    }
    editor.contents = content
    editor.changed = true

    const validation = await this.validateContent(name, content)
    return {
      success: true,
      message: `Updated ${name}.\n${validation}`,
      triggersSymbolRefresh: true,
    }
  }

  private async validateTrilogyFile(name: string): Promise<ToolCallResult> {
    if (!name) return { success: false, error: 'name is required' }
    const editor = this.findEditorByName(name)
    if (!editor) {
      return { success: false, error: `File "${name}" not found.` }
    }
    if (editor.type !== 'preql' && editor.type !== 'trilogy') {
      return {
        success: false,
        error: `validate_trilogy_file only handles Trilogy files; ${name} is ${editor.type}.`,
      }
    }
    const result = await this.validateContent(name, editor.contents)
    return { success: true, message: `Validation of ${name}:\n${result}` }
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
