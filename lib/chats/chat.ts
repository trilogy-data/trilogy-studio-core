import type { LLMMessage } from '../llm'

// Import for data sources in chat
export interface ChatImport {
  id: string // Editor ID
  name: string // Display name (dot notation: 'folder.editor')
  alias: string // Optional alias
}

// Re-export types that match LLMChat.vue interface
export interface ChatArtifact {
  id: string
  type: 'results' | 'chart' | 'code' | 'markdown' | 'custom'
  data: any
  config?: any
  /** When true, artifact is soft-deleted and shown in the collapsed Hidden section */
  hidden?: boolean
}

/** Generate a short unique artifact ID */
export function generateArtifactId(): string {
  return `art-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 6)}`
}

// Tool call with execution result - used for UI display
// Note: LLMMessage already has toolCalls (LLMToolCall[]) and toolResults (LLMToolResult[])
// for LLM history. This type adds the execution result for displaying in the UI.
export interface ChatToolCall {
  id: string
  name: string
  input: Record<string, any>
  result?: {
    success: boolean
    message?: string
    error?: string
  }
}

export interface ChatMessage extends LLMMessage {
  artifact?: ChatArtifact
  // executedToolCalls stores tool calls with their execution results for UI display
  // The inherited toolCalls/toolResults from LLMMessage are used for LLM history
  executedToolCalls?: ChatToolCall[]
}

export type ChatSource = 'user' | 'dashboard'

/**
 * Conversational role of a chat in the explorer's overseer/subchat model.
 *  - 'user': default for studio chats and any standalone conversation
 *  - 'overseer': explorer's primary chat — orchestrates work via subchats
 *  - 'architect': subchat focused on data model setup
 *  - 'analyst': subchat focused on analysis / dashboards
 *
 * Studio chats are always 'user' (the default) — the dispatch in chatStore
 * only takes a different path when kind === 'overseer'.
 */
export type ChatKind = 'user' | 'overseer' | 'architect' | 'analyst'

export interface ChatSessionData {
  id: string
  name: string
  dataConnectionName: string // Display label for the data connection
  dataConnectionId: string // Stable id used to look up the data connection
  llmConnectionName: string // LLM provider connection (includes model info)
  messages: ChatMessage[]
  artifacts: ChatArtifact[] // Stored separately for right panel display
  activeArtifactIndex: number // Currently expanded artifact (-1 = none)
  imports: ChatImport[] // Data source imports for this chat
  createdAt: Date
  updatedAt: Date
  storage: 'local' | 'github' | 'remote'
  /** What created this chat. 'user' is the default; 'dashboard' means it's
   * owned by a DashboardModel and should be hidden from the main chat list by default. */
  source: ChatSource
  /** For non-user sources, the id of the owning entity (e.g. dashboard id). */
  sourceRefId?: string | null
  /** Overseer/subchat role. Defaults to 'user' (studio's standalone chats). */
  kind: ChatKind
  /** Parent chat id when this is a subchat. Undefined for top-level chats. */
  parentChatId?: string | null
  /** Project the subchat operates on. Set by the overseer when spawning so
   *  the subchat's tools (architect file edits, analyst queries) target a
   *  specific workspace even if the user navigates elsewhere mid-run. */
  parentProjectId?: string | null
  /** Hidden user-message content queued to be re-injected after the current
   * execution finishes. Used by the overseer flow: when a subchat completes
   * while its parent is busy, the result waits here until the parent is idle. */
  pendingInjections: string[]
  changed: boolean
  deleted: boolean
}

export class Chat implements ChatSessionData {
  id: string
  name: string
  dataConnectionName: string
  dataConnectionId: string
  llmConnectionName: string
  messages: ChatMessage[]
  artifacts: ChatArtifact[]
  activeArtifactIndex: number
  imports: ChatImport[]
  createdAt: Date
  updatedAt: Date
  storage: 'local' | 'github' | 'remote'
  source: ChatSource
  sourceRefId?: string | null
  kind: ChatKind
  parentChatId?: string | null
  parentProjectId?: string | null
  pendingInjections: string[]
  changed: boolean
  deleted: boolean

  constructor(data: Partial<ChatSessionData> = {}) {
    this.id = data.id || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    this.name = data.name || `Chat ${new Date().toLocaleTimeString()}`
    this.dataConnectionName = data.dataConnectionName || ''
    this.dataConnectionId = data.dataConnectionId || ''
    this.llmConnectionName = data.llmConnectionName || ''
    this.messages = data.messages || []
    this.artifacts = data.artifacts || []
    this.activeArtifactIndex = data.activeArtifactIndex ?? -1
    this.imports = data.imports || []
    this.createdAt = data.createdAt || new Date()
    this.updatedAt = data.updatedAt || new Date()
    this.storage = data.storage || 'local'
    this.source = data.source || 'user'
    this.sourceRefId = data.sourceRefId ?? null
    this.kind = data.kind || 'user'
    this.parentChatId = data.parentChatId ?? null
    this.parentProjectId = data.parentProjectId ?? null
    this.pendingInjections = data.pendingInjections || []
    this.changed = data.changed ?? true
    this.deleted = data.deleted ?? false
  }

  setName(name: string): void {
    if (this.name !== name) {
      this.name = name
      this.updatedAt = new Date()
      this.changed = true
    }
  }

  setDataConnection(connectionName: string, connectionId: string = ''): void {
    if (
      this.dataConnectionName !== connectionName ||
      (connectionId && this.dataConnectionId !== connectionId)
    ) {
      this.dataConnectionName = connectionName
      this.dataConnectionId = connectionId
      this.updatedAt = new Date()
      this.changed = true
    }
  }

  addMessage(message: ChatMessage): void {
    this.messages.push(message)
    this.updatedAt = new Date()
    this.changed = true
  }

  addArtifact(artifact: ChatArtifact): number {
    // Ensure artifact has an ID
    if (!artifact.id) {
      artifact.id = generateArtifactId()
    }
    this.artifacts.push(artifact)
    this.activeArtifactIndex = this.artifacts.length - 1 // Auto-expand new artifact
    this.updatedAt = new Date()
    this.changed = true
    return this.activeArtifactIndex
  }

  getArtifactById(id: string): ChatArtifact | null {
    return this.artifacts.find((a) => a.id === id) || null
  }

  updateArtifact(id: string, updates: Partial<Pick<ChatArtifact, 'data' | 'config'>>): boolean {
    const artifact = this.artifacts.find((a) => a.id === id)
    if (!artifact) return false
    if (updates.data !== undefined) artifact.data = updates.data
    if (updates.config !== undefined) artifact.config = { ...artifact.config, ...updates.config }
    this.updatedAt = new Date()
    this.changed = true
    return true
  }

  removeArtifact(id: string): boolean {
    const index = this.artifacts.findIndex((a) => a.id === id)
    if (index === -1) return false
    this.artifacts.splice(index, 1)
    // Adjust active index
    if (this.activeArtifactIndex >= this.artifacts.length) {
      this.activeArtifactIndex = this.artifacts.length - 1
    }
    this.updatedAt = new Date()
    this.changed = true
    return true
  }

  hideArtifact(id: string): boolean {
    const artifact = this.artifacts.find((a) => a.id === id)
    if (!artifact) return false
    artifact.hidden = true
    // Deselect if the hidden artifact was active
    const index = this.artifacts.indexOf(artifact)
    if (this.activeArtifactIndex === index) {
      this.activeArtifactIndex = -1
    }
    this.updatedAt = new Date()
    this.changed = true
    return true
  }

  unhideArtifact(id: string): boolean {
    const artifact = this.artifacts.find((a) => a.id === id)
    if (!artifact) return false
    artifact.hidden = false
    this.updatedAt = new Date()
    this.changed = true
    return true
  }

  setActiveArtifact(index: number): void {
    if (index >= -1 && index < this.artifacts.length) {
      this.activeArtifactIndex = index
    }
  }

  getActiveArtifact(): ChatArtifact | null {
    if (this.activeArtifactIndex >= 0 && this.activeArtifactIndex < this.artifacts.length) {
      return this.artifacts[this.activeArtifactIndex]
    }
    return null
  }

  clearMessages(): void {
    this.messages = []
    this.artifacts = []
    this.activeArtifactIndex = -1
    this.updatedAt = new Date()
    this.changed = true
  }

  // Import management
  addImport(imp: ChatImport): boolean {
    if (this.imports.some((i) => i.id === imp.id)) return false
    this.imports.push(imp)
    this.updatedAt = new Date()
    this.changed = true
    return true
  }

  removeImport(importId: string): boolean {
    const index = this.imports.findIndex((i) => i.id === importId)
    if (index === -1) return false
    this.imports.splice(index, 1)
    this.updatedAt = new Date()
    this.changed = true
    return true
  }

  setImports(imports: ChatImport[]): void {
    this.imports = imports
    this.updatedAt = new Date()
    this.changed = true
  }

  getLastMessage(): ChatMessage | null {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null
  }

  getVisibleMessages(): ChatMessage[] {
    return this.messages.filter((m) => !m.hidden)
  }

  serialize(): object {
    return {
      id: this.id,
      name: this.name,
      dataConnectionName: this.dataConnectionName,
      dataConnectionId: this.dataConnectionId,
      llmConnectionName: this.llmConnectionName,
      messages: this.messages,
      artifacts: this.artifacts,
      activeArtifactIndex: this.activeArtifactIndex,
      imports: this.imports,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      storage: this.storage,
      source: this.source,
      sourceRefId: this.sourceRefId ?? null,
      kind: this.kind,
      parentChatId: this.parentChatId ?? null,
      parentProjectId: this.parentProjectId ?? null,
      pendingInjections: this.pendingInjections,
    }
  }

  static fromSerialized(data: any): Chat {
    return new Chat({
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      changed: false,
    })
  }
}
