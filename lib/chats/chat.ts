import type { LLMMessage } from '../llm'

// Import for data sources in chat
export interface ChatImport {
  id: string // Editor ID
  name: string // Display name (dot notation: 'folder.editor')
  alias: string // Optional alias
}

// Re-export types that match LLMChat.vue interface
export interface ChatArtifact {
  type: 'results' | 'chart' | 'code' | 'custom'
  data: any
  config?: any
}

export interface ChatMessage extends LLMMessage {
  artifact?: ChatArtifact
  modelInfo?: {
    totalTokens: number
  }
}

export interface ChatSessionData {
  id: string
  name: string
  dataConnectionName: string // Data connection for query execution
  llmConnectionName: string // LLM provider connection (includes model info)
  messages: ChatMessage[]
  artifacts: ChatArtifact[] // Stored separately for right panel display
  activeArtifactIndex: number // Currently expanded artifact (-1 = none)
  imports: ChatImport[] // Data source imports for this chat
  createdAt: Date
  updatedAt: Date
  storage: 'local' | 'github' | 'remote'
  changed: boolean
  deleted: boolean
}

export class Chat implements ChatSessionData {
  id: string
  name: string
  dataConnectionName: string
  llmConnectionName: string
  messages: ChatMessage[]
  artifacts: ChatArtifact[]
  activeArtifactIndex: number
  imports: ChatImport[]
  createdAt: Date
  updatedAt: Date
  storage: 'local' | 'github' | 'remote'
  changed: boolean
  deleted: boolean

  constructor(data: Partial<ChatSessionData> = {}) {
    this.id = data.id || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    this.name = data.name || `Chat ${new Date().toLocaleTimeString()}`
    this.dataConnectionName = data.dataConnectionName || ''
    this.llmConnectionName = data.llmConnectionName || ''
    this.messages = data.messages || []
    this.artifacts = data.artifacts || []
    this.activeArtifactIndex = data.activeArtifactIndex ?? -1
    this.imports = data.imports || []
    this.createdAt = data.createdAt || new Date()
    this.updatedAt = data.updatedAt || new Date()
    this.storage = data.storage || 'local'
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

  setDataConnection(connectionName: string): void {
    if (this.dataConnectionName !== connectionName) {
      this.dataConnectionName = connectionName
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
    this.artifacts.push(artifact)
    this.activeArtifactIndex = this.artifacts.length - 1 // Auto-expand new artifact
    this.updatedAt = new Date()
    this.changed = true
    return this.activeArtifactIndex
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
      llmConnectionName: this.llmConnectionName,
      messages: this.messages,
      artifacts: this.artifacts,
      activeArtifactIndex: this.activeArtifactIndex,
      imports: this.imports,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      storage: this.storage,
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
