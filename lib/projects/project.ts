/**
 * Project model — a bundle of editors and chats that share context.
 *
 * Project's unique value is the multi-chat grouping plus a collection of
 * editor references. It does NOT own its own file abstraction: files live
 * in EditorStore (lib/editors/editor.ts) and Project just references them
 * by id, the same way ChatImport / DashboardImport do.
 *
 * Trilogy semantics are NOT duplicated here. When .preql editors in a
 * project are parsed, a ModelConfig is created/updated as a side effect.
 * ModelConfig stays the source of truth for "what concepts exist" — Project
 * stays the source of truth for "what's in this workspace."
 *
 * Lives in lib/ so studio can adopt projects later. Persistence flows
 * through AbstractStorage exactly like Editors, Dashboards, and Chats.
 */

export interface ProjectData {
  id: string
  name: string
  description: string
  dataConnectionId: string
  llmConnectionName: string
  /** Ids of editors (lib/editors/editor.ts) belonging to this project. */
  editorIds: string[]
  /** Ids of subchats (architect/analyst) the overseer has spawned for this
   *  project. The overseer chat itself is global to the host app, not per
   *  project — see explorer's main.ts for the singleton it boots. */
  subchatIds: string[]
  /** Optional absolute path to a directory the project is anchored at.
   *  When set, the host can re-scan it on demand to import new files
   *  without manual re-attachment. Only meaningful in the Tauri shell. */
  directoryPath: string
  createdAt: Date
  updatedAt: Date
  storage: 'local' | 'github' | 'remote'
  changed: boolean
  deleted: boolean
}

function genProjectId(): string {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export class Project implements ProjectData {
  id: string
  name: string
  description: string
  dataConnectionId: string
  llmConnectionName: string
  editorIds: string[]
  subchatIds: string[]
  directoryPath: string
  createdAt: Date
  updatedAt: Date
  storage: 'local' | 'github' | 'remote'
  changed: boolean
  deleted: boolean

  constructor(data: Partial<ProjectData> = {}) {
    this.id = data.id || genProjectId()
    this.name = data.name || 'Untitled project'
    this.description = data.description || ''
    this.dataConnectionId = data.dataConnectionId || ''
    this.llmConnectionName = data.llmConnectionName || ''
    this.editorIds = data.editorIds || []
    this.subchatIds = data.subchatIds || []
    this.directoryPath = data.directoryPath || ''
    this.createdAt = data.createdAt || new Date()
    this.updatedAt = data.updatedAt || new Date()
    this.storage = data.storage || 'local'
    this.changed = data.changed ?? true
    this.deleted = data.deleted ?? false
  }

  setName(name: string): void {
    if (this.name === name) return
    this.name = name
    this.touch()
  }

  setDescription(description: string): void {
    if (this.description === description) return
    this.description = description
    this.touch()
  }

  setDirectoryPath(path: string): void {
    if (this.directoryPath === path) return
    this.directoryPath = path
    this.touch()
  }

  addSubchat(chatId: string): boolean {
    if (this.subchatIds.includes(chatId)) return false
    this.subchatIds.push(chatId)
    this.touch()
    return true
  }

  removeSubchat(chatId: string): boolean {
    const idx = this.subchatIds.indexOf(chatId)
    if (idx === -1) return false
    this.subchatIds.splice(idx, 1)
    this.touch()
    return true
  }

  addEditor(editorId: string): boolean {
    if (this.editorIds.includes(editorId)) return false
    this.editorIds.push(editorId)
    this.touch()
    return true
  }

  removeEditor(editorId: string): boolean {
    const idx = this.editorIds.indexOf(editorId)
    if (idx === -1) return false
    this.editorIds.splice(idx, 1)
    this.touch()
    return true
  }

  private touch(): void {
    this.updatedAt = new Date()
    this.changed = true
  }

  serialize(): object {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      dataConnectionId: this.dataConnectionId,
      llmConnectionName: this.llmConnectionName,
      editorIds: this.editorIds,
      subchatIds: this.subchatIds,
      directoryPath: this.directoryPath,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      storage: this.storage,
    }
  }

  static fromSerialized(data: any): Project {
    return new Project({
      ...data,
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
      changed: false,
    })
  }
}
