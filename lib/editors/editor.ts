import { Results } from './results'
import type { ResultsInterface, ChartConfig } from './results'
import { type CompletionItem } from '../stores/resolver'
import type { ChatMessage, ChatArtifact } from '../chats/chat'

/**
 * Refinement session state - stored in memory only, NOT persisted to storage.
 * Allows users to tab away and return to an ongoing refinement session.
 */
export interface EditorRefinementSession {
  messages: ChatMessage[]
  artifacts: ChatArtifact[]
  originalContent: string
  originalChartConfig?: ChartConfig
  currentContent: string
  currentChartConfig?: ChartConfig
  selectedText?: string
  selectionRange?: { start: number; end: number }
  /** True if a request was in-progress when the session was saved (execution was interrupted) */
  wasLoading?: boolean
}
// enum of tags
export enum EditorTag {
  SOURCE = 'source',
  STARTUP_SCRIPT = 'startup_script',
  // SCHEDULED = 'scheduled',
}

export interface EditorInterface {
  id: string
  name: string
  type: 'trilogy' | 'sql' | 'preql'
  syntax: string
  connection: string
  results: ResultsInterface
  contents: string
  loading: boolean
  error: string | null
  status_code: number
  duration: number | null
  generated_sql: string | null
  storage: string
  tags: EditorTag[]
  startTime: number | null
  cancelCallback: (() => void) | null
  changed: boolean
  deleted: boolean
  chartConfig?: ChartConfig | null
  refinementSession?: EditorRefinementSession | null
  scrollPosition?: { line: number; column: number } | null
}

export default class Editor implements EditorInterface {
  id: string
  name: string
  type: 'trilogy' | 'sql' | 'preql'
  syntax: string
  connection: string
  results: Results
  contents: string
  loading: boolean
  error: string | null
  status_code: number
  duration: number | null
  generated_sql: string | null
  storage: string
  tags: EditorTag[]
  startTime: number | null
  cancelCallback: (() => void) | null
  changed: boolean
  deleted: boolean
  chartConfig?: ChartConfig | null
  completionSymbols: CompletionItem[]
  refinementSession?: EditorRefinementSession | null
  scrollPosition?: { line: number; column: number } | null

  defaultContents(type: string) {
    switch (type) {
      case 'sql':
        return `SELECT 1;`
      case 'preql':
        return `SELECT 1 -> echo;`
      default:
        return `SELECT 1;`
    }
  }
  constructor({
    id,
    name,
    type,
    connection,
    storage,
    contents = null,
    tags = null,
  }: {
    id: string
    name: string
    type: 'trilogy' | 'sql' | 'preql'
    connection: string
    storage: string
    contents?: string | null
    tags?: EditorTag[] | null
  }) {
    this.id = id
    this.name = name
    this.type = type
    this.syntax = 'preql'
    this.connection = connection
    this.results = new Results(new Map(), [])
    this.contents = contents ? contents : this.defaultContents(type)
    this.loading = false
    this.error = null
    this.duration = null
    this.status_code = 200
    this.generated_sql = null
    this.storage = storage
    this.tags = tags ? tags : []
    this.startTime = null
    this.cancelCallback = null
    // default to change for save
    this.changed = true
    this.deleted = false
    this.completionSymbols = []
  }

  getAutocomplete(word: string): CompletionItem[] {
    return this.completionSymbols.filter((symbol) => symbol.label.startsWith(word))
  }

  setError(error: string | null) {
    this.error = error
    if (error) {
      this.results = new Results(new Map(), [])
      this.changed = true
    }
  }

  setContent(contents: string) {
    if (this.contents === contents) {
      return // No change, do nothing
    }
    this.contents = contents
    this.changed = true
  }

  setName(name: string) {
    if (this.name === name) {
      return // No change, do nothing
    }
    this.changed = true
    this.name = name
  }

  addTag(tag: EditorTag) {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag)
      this.changed = true
    }
  }

  removeTag(tag: EditorTag) {
    this.tags = this.tags.filter((t) => t !== tag)
    this.changed = true
  }

  setChartConfig(chartConfig: ChartConfig | null) {
    this.chartConfig = chartConfig
    this.changed = true
  }

  /**
   * Set the refinement session. This is stored in memory only and NOT persisted to storage.
   * Allows the user to tab away and return to an ongoing refinement chat.
   */
  setRefinementSession(session: EditorRefinementSession | null) {
    this.refinementSession = session
    // Note: Do NOT set this.changed = true - refinement sessions should not trigger saves
  }

  /**
   * Check if there is an active refinement session
   */
  hasActiveRefinement(): boolean {
    return this.refinementSession !== null && this.refinementSession !== undefined
  }

  delete() {
    this.deleted = true
    this.changed = true
  }

  toJSON(preserveResults: boolean = false): object {
    return {
      // default for migration
      id: this.id || this.name,
      name: this.name,
      type: this.type,
      syntax: this.syntax,
      connection: this.connection,
      results: preserveResults ? this.results.toJSON() : null,
      contents: this.contents,
      loading: false,
      error: this.error,
      status_code: this.status_code,
      duration: this.duration,
      generated_sql: this.generated_sql,
      storage: this.storage,
      tags: this.tags,
      chartConfig: this.chartConfig,
    }
  }

  static fromJSON(json: string | Partial<Editor>): Editor {
    const parsed: Partial<Editor> = typeof json === 'string' ? JSON.parse(json) : json
    // Initialize a new Editor instance
    const editor = new Editor({
      id: parsed.id || parsed.name || '',
      name: parsed.name || '',
      type: parsed.type || 'trilogy',
      connection: parsed.connection || '',
      storage: parsed.storage || 'local',
      contents: parsed.contents || null,
    })

    // Hydrate additional properties
    editor.syntax = parsed.syntax || 'preql'
    editor.results = parsed.results ? Results.fromJSON(parsed.results) : new Results(new Map(), [])
    editor.loading = parsed.loading || false
    editor.error = parsed.error || null
    editor.status_code = parsed.status_code || 200

    editor.duration = parsed.duration || null
    editor.generated_sql = parsed.generated_sql || null

    editor.changed = false
    // rehydrate tags to EditorTag
    editor.tags = parsed.tags
      ? parsed.tags
          .map((tag: string) => {
            return Object.values(EditorTag).includes(tag as EditorTag) ? (tag as EditorTag) : null
          })
          .filter((tag): tag is EditorTag => tag !== null)
      : []
    editor.chartConfig = parsed.chartConfig || undefined
    return editor
  }
}
