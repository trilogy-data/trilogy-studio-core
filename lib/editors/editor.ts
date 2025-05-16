import { Results } from './results'
import type { ResultsInterface, ChartConfig } from './results'
import type { ChatInteraction } from '../llm'
import { type CompletionItem } from '../stores/resolver'
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
  chatInteraction?: ChatInteraction | null
  // monaco: editor.IStandaloneCodeEditor | null;
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
  chatInteraction?: ChatInteraction | null
  // monaco: editor.IStandaloneCodeEditor | null;

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
    // this.monaco = null;
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
    this.contents = contents
    this.changed = true
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

  // chat interactions don't need to persist through saves
  setChatInteraction(chatInteraction: ChatInteraction | null) {
    this.chatInteraction = chatInteraction
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
