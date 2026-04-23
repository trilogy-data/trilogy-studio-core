import EditorInterface from '../editors/editor'
import { ModelConfig } from '../models'
import type Connection from '../connections/base'
import {
  BigQueryOauthConnection,
  DuckDBConnection,
  MotherDuckConnection,
  SnowflakeJwtConnection,
  SQLiteConnection,
} from '../connections'
import {
  LLMProvider,
  OpenAIProvider,
  AnthropicProvider,
  GoogleProvider,
  OpenRouterProvider,
  DemoProvider,
} from '../llm'
import { reactive } from 'vue'
import AbstractStorage from './storage'
import { DashboardModel } from '../dashboards/base'
import { Chat } from '../chats/chat'
import { idbGet, idbSet, idbDel, idbKeys, idbSize } from './idbKv'

// Buckets moved to IndexedDB because their serialized payloads can exceed the
// ~5 MB localStorage quota (chats carry artifact data, editors/modelConfig can
// grow). Small, high-write-frequency buckets (connections, llmConnections,
// userSettings) stay in localStorage for sync read access.
const IDB_BUCKETS = ['editors', 'modelConfig', 'dashboards', 'chats'] as const
type IdbBucket = (typeof IDB_BUCKETS)[number]

export default class LocalStorage extends AbstractStorage {
  private editorStorageKey: string
  private connectionStorageKey: string
  private llmConnectionStorageKey: string
  private modelStorageKey: string
  private userSettingsStorageKey: string
  private dashboardStorageKey: string
  private chatStorageKey: string
  private migrated = new Set<string>()
  public type: string

  constructor(prefix: string = '') {
    super()
    this.editorStorageKey = prefix + 'editors'
    this.connectionStorageKey = prefix + 'connections'
    this.llmConnectionStorageKey = prefix + 'llmConnections'
    this.modelStorageKey = prefix + 'modelConfig'
    this.userSettingsStorageKey = prefix + 'userSettings'
    this.dashboardStorageKey = prefix + 'dashboards'
    this.chatStorageKey = prefix + 'chats'
    this.type = 'local'
  }

  // Reads a bucket stored in IndexedDB. On first read per process, migrates
  // any pre-existing localStorage payload over to IDB and evicts the old key.
  private async readIdb(key: string): Promise<string | null> {
    if (!this.migrated.has(key)) {
      this.migrated.add(key)
      const existing = await idbGet(key)
      if (existing === null) {
        const legacy = localStorage.getItem(key)
        if (legacy !== null) {
          await idbSet(key, legacy)
          localStorage.removeItem(key)
          return legacy
        }
      } else {
        // Already migrated in a previous session; clean up any stale copy
        // left in localStorage (e.g. partial migration).
        if (localStorage.getItem(key) !== null) localStorage.removeItem(key)
      }
    }
    return idbGet(key)
  }

  private async writeIdb(key: string, value: string): Promise<void> {
    this.migrated.add(key)
    await idbSet(key, value)
  }

  async saveEditor(editor: EditorInterface): Promise<void> {
    const editors = await this.loadEditors()
    editors[editor.name] = editor
    await this.saveEditors(Object.values(editors))
  }

  async saveEditors(editorsList: EditorInterface[]): Promise<void> {
    const editors = await this.loadEditors()
    // override editors we've changed
    editorsList.forEach((editor) => {
      if (editor.changed) {
        editors[editor.id] = editor
        editor.changed = false
      }
      if (editor.deleted) {
        delete editors[editor.id]
      }
    })
    await this.writeIdb(
      this.editorStorageKey,
      JSON.stringify(Object.values(editors).map((editor) => editor.toJSON())),
    )
  }

  async loadEditors(): Promise<Record<string, EditorInterface>> {
    const storedData = await this.readIdb(this.editorStorageKey)
    let raw = storedData ? JSON.parse(storedData) : []
    // map the raw array to a Record<string, EditorInterface> with the editorInterface wrapped in reactive
    return raw.reduce((acc: Record<string, EditorInterface>, editor: EditorInterface) => {
      acc[editor.id] = reactive(EditorInterface.fromJSON(editor))
      acc[editor.id].storage = 'local'
      return acc
    }, {})
  }

  async deleteEditor(name: string): Promise<void> {
    const editors = await this.loadEditors()
    if (editors[name]) {
      delete editors[name]
      await this.writeIdb(
        this.editorStorageKey,
        JSON.stringify(Object.values(editors).map((editor) => editor.toJSON())),
      )
    }
  }

  async clearEditors(): Promise<void> {
    await idbDel(this.editorStorageKey)
    this.migrated.add(this.editorStorageKey)
  }

  async hasEditor(id: string): Promise<boolean> {
    const editors = await this.loadEditors()
    // any editor has the property name == name
    return Object.values(editors).some((editor) => editor.id === id)
  }

  async saveConnections(connections: Array<Connection>): Promise<void> {
    const current = await this.loadConnections()
    connections.forEach((connection) => {
      if (connection.changed || !(connection.name in current)) {
        current[connection.name] = connection
        connection.changed = false
      }
      if (connection.deleted) {
        delete current[connection.name]
      }
    })
    localStorage.setItem(this.connectionStorageKey, JSON.stringify(Object.values(current)))
  }

  async loadConnections(): Promise<Record<string, Connection>> {
    const storedData = localStorage.getItem(this.connectionStorageKey)
    const raw = storedData ? JSON.parse(storedData) : []
    const connections: Record<string, Connection> = {}

    // Process each connection sequentially
    for (const connection of raw) {
      switch (connection.type) {
        case 'bigquery-oauth':
          // @ts-ignore
          connections[connection.name] = reactive(BigQueryOauthConnection.fromJSON(connection))
          break
        case 'duckdb':
          // @ts-ignore
          connections[connection.name] = reactive(DuckDBConnection.fromJSON(connection))
          break
        case 'sqlite':
          // @ts-ignore
          connections[connection.name] = reactive(SQLiteConnection.fromJSON(connection))
          break
        case 'motherduck':
          // Handle the async operation properly
          // @ts-ignore
          connections[connection.name] = reactive(await MotherDuckConnection.fromJSON(connection))
          break
        case 'snowflake':
          // @ts-ignore
          connections[connection.name] = reactive(SnowflakeJwtConnection.fromJSON(connection))
          break
        // Uncomment if needed:
        // case "sqlserver":
        //   connections[connection.name] = reactive(SQLServerConnection.fromJSON(connection));
        //   break;
      }
    }

    return connections
  }

  async deleteConnection(name: string): Promise<void> {
    const connections = await this.loadConnections()
    if (connections[name]) {
      connections[name].deleted = true
      this.saveConnections(Object.values(connections))
    }
  }

  // model config storage

  async loadModelConfig(): Promise<Record<string, ModelConfig>> {
    const storedData = await this.readIdb(this.modelStorageKey)
    let raw = storedData ? JSON.parse(storedData) : []
    let modelConfigList: Record<string, ModelConfig> = {}
    raw.forEach((modelConfig: ModelConfig) => {
      modelConfigList[modelConfig.name] = reactive(ModelConfig.fromJSON(modelConfig))
    })
    return modelConfigList
  }

  async saveModelConfig(modelConfig: ModelConfig[]): Promise<void> {
    const current = await this.loadModelConfig()
    modelConfig.forEach((model) => {
      if (model.changed || !(model.name in current)) {
        current[model.name] = model
        model.changed = false
      }
      if (model.deleted) {
        delete current[model.name]
      }
    })
    await this.writeIdb(this.modelStorageKey, JSON.stringify(Object.values(current)))
  }

  clearModelConfig(): void {
    // Fire-and-forget; IDB is async but the interface is sync.
    void idbDel(this.modelStorageKey)
    this.migrated.add(this.modelStorageKey)
  }

  // user Setting Storage

  loadUserSettings(): Record<string, any> {
    const storedData = localStorage.getItem(this.userSettingsStorageKey)
    let raw = storedData ? JSON.parse(storedData) : {}
    return reactive(raw)
  }

  saveUserSettings(settings: Record<string, any>): void {
    localStorage.setItem(this.userSettingsStorageKey, JSON.stringify(settings))
  }

  async saveLLMConnections(connections: Array<LLMProvider>): Promise<void> {
    const current: Record<string, LLMProvider> = await this.loadLLMConnections()
    connections.forEach((connection) => {
      if (connection.changed || !(connection.name in current)) {
        current[connection.name] = connection
        connection.changed = false
      }
      if (connection.deleted) {
        delete current[connection.name]
      }
    })
    localStorage.setItem(
      this.llmConnectionStorageKey,
      JSON.stringify(Object.values(current).map((connection) => connection.toJSON())),
    )
  }

  async loadLLMConnections(): Promise<Record<string, LLMProvider>> {
    const storedData = localStorage.getItem(this.llmConnectionStorageKey)
    const raw = storedData ? JSON.parse(storedData) : []
    const connections: Record<string, LLMProvider> = {}
    // Process each connection sequentially
    for (const connection of raw) {
      switch (connection.type) {
        case 'openai':
          // @ts-ignore
          connections[connection.name] = reactive(await OpenAIProvider.fromJSON(connection))
          break
        case 'anthropic':
          // Handle the async operation properly
          // @ts-ignore
          connections[connection.name] = reactive(await AnthropicProvider.fromJSON(connection))
          break
        case 'google':
          // Handle the async operation properly
          // @ts-ignore
          connections[connection.name] = reactive(await GoogleProvider.fromJSON(connection))
          break
        case 'openrouter':
          // @ts-ignore
          connections[connection.name] = reactive(await OpenRouterProvider.fromJSON(connection))
          break
        case 'demo':
          // @ts-ignore
          connections[connection.name] = reactive(await DemoProvider.fromJSON(connection))
          break
        default:
          console.warn(`Unknown LLM connection type: ${connection.type}`)
      }
    }

    return connections
  }

  async deleteLLMConnection(name: string): Promise<void> {
    const connections = await this.loadLLMConnections()
    if (connections[name]) {
      connections[name].deleted = true

      await this.saveLLMConnections(Object.values(connections))
    }
  }

  async clearLLMConnections(): Promise<void> {
    localStorage.removeItem(this.llmConnectionStorageKey)
  }

  // Dashboard methods implementation
  async saveDashboard(dashboard: DashboardModel): Promise<void> {
    const dashboards = await this.loadDashboards()
    dashboards[dashboard.id] = dashboard
    await this.saveDashboards(Object.values(dashboards))
  }

  async saveDashboards(dashboardsList: DashboardModel[]): Promise<void> {
    const dashboards = await this.loadDashboards()

    dashboardsList.forEach((dashboard) => {
      if (dashboard.changed) {
        dashboards[dashboard.id] = dashboard
        dashboard.changed = false
      } else {
        // If no changed flag, always update
        dashboards[dashboard.id] = dashboard
      }

      if (dashboard.deleted) {
        delete dashboards[dashboard.id]
      }
    })

    await this.writeIdb(
      this.dashboardStorageKey,
      JSON.stringify(
        Object.values(dashboards).map((dashboard) => {
          return dashboard.serialize()
        }),
      ),
    )
  }

  async loadDashboards(): Promise<Record<string, DashboardModel>> {
    const storedData = await this.readIdb(this.dashboardStorageKey)
    let raw = storedData ? JSON.parse(storedData) : []

    return raw.reduce((acc: Record<string, DashboardModel>, dashboard: any) => {
      // Instantiate as DashboardModel if possible
      if (DashboardModel && typeof DashboardModel.fromSerialized === 'function') {
        acc[dashboard.id] = reactive(DashboardModel.fromSerialized(dashboard))
      } else {
        // Fallback to basic reactive object
        acc[dashboard.id] = reactive(dashboard)
      }

      // Ensure storage property is set to 'local'
      acc[dashboard.id].storage = 'local'

      return acc
    }, {})
  }

  async deleteDashboard(id: string): Promise<void> {
    const dashboards = await this.loadDashboards()
    if (dashboards[id]) {
      delete dashboards[id]
      await this.writeIdb(
        this.dashboardStorageKey,
        JSON.stringify(
          Object.values(dashboards).map((dashboard) => {
            // Ensure we're saving a serializable version
            if (typeof (dashboard as any).serialize === 'function') {
              return (dashboard as any).serialize()
            }
            return dashboard
          }),
        ),
      )
    }
  }

  async clearDashboards(): Promise<void> {
    await idbDel(this.dashboardStorageKey)
    this.migrated.add(this.dashboardStorageKey)
  }

  async hasDashboard(id: string): Promise<boolean> {
    const dashboards = await this.loadDashboards()
    return id in dashboards
  }

  // Chat methods implementation
  async saveChats(chatsList: Chat[]): Promise<void> {
    const chats = await this.loadChats()

    chatsList.forEach((chat) => {
      if (chat.changed) {
        chats[chat.id] = chat
        chat.changed = false
      }
      if (chat.deleted) {
        delete chats[chat.id]
      }
    })

    await this.writeIdb(
      this.chatStorageKey,
      JSON.stringify(Object.values(chats).map((chat) => chat.serialize())),
    )
  }

  async loadChats(): Promise<Record<string, Chat>> {
    const storedData = await this.readIdb(this.chatStorageKey)
    let raw = storedData ? JSON.parse(storedData) : []

    return raw.reduce((acc: Record<string, Chat>, chatData: any) => {
      const chat = Chat.fromSerialized(chatData)
      acc[chat.id] = reactive(chat) as Chat
      acc[chat.id].storage = 'local'
      return acc
    }, {})
  }

  async deleteChat(id: string): Promise<void> {
    const chats = await this.loadChats()
    if (chats[id]) {
      delete chats[id]
      await this.writeIdb(
        this.chatStorageKey,
        JSON.stringify(Object.values(chats).map((chat) => chat.serialize())),
      )
    }
  }

  async clearChats(): Promise<void> {
    await idbDel(this.chatStorageKey)
    this.migrated.add(this.chatStorageKey)
  }

  async hasChat(id: string): Promise<boolean> {
    const chats = await this.loadChats()
    return id in chats
  }

  /**
   * Delete chats whose updatedAt is older than `cutoff`. Returns the number
   * of chats removed. Used by the Storage settings panel.
   */
  async pruneChatsOlderThan(cutoff: Date): Promise<number> {
    const storedData = await this.readIdb(this.chatStorageKey)
    if (!storedData) return 0
    const raw = JSON.parse(storedData) as Array<{ updatedAt?: string }>
    const kept = raw.filter((c) => {
      if (!c.updatedAt) return true
      return new Date(c.updatedAt).getTime() >= cutoff.getTime()
    })
    const removed = raw.length - kept.length
    if (removed > 0) {
      await this.writeIdb(this.chatStorageKey, JSON.stringify(kept))
    }
    return removed
  }

  /**
   * Per-key byte usage across both backends. Returns an array sorted by size
   * descending for the Storage settings panel.
   */
  async getStorageUsage(): Promise<
    Array<{ key: string; bytes: number; backend: 'indexeddb' | 'localstorage' }>
  > {
    const out: Array<{ key: string; bytes: number; backend: 'indexeddb' | 'localstorage' }> = []

    // IDB buckets we manage
    for (const bucket of IDB_BUCKETS) {
      const key = this._prefixedKey(bucket)
      const bytes = await idbSize(key)
      out.push({ key, bytes, backend: 'indexeddb' })
    }

    // Any extra IDB keys (e.g. from older versions or other code paths)
    const keys = await idbKeys()
    for (const key of keys) {
      if (IDB_BUCKETS.some((b) => this._prefixedKey(b) === key)) continue
      const bytes = await idbSize(key)
      out.push({ key, bytes, backend: 'indexeddb' })
    }

    // Everything in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      const v = localStorage.getItem(key) ?? ''
      out.push({
        key,
        bytes: new TextEncoder().encode(v).length,
        backend: 'localstorage',
      })
    }

    out.sort((a, b) => b.bytes - a.bytes)
    return out
  }

  /** Delete a single key from whichever backend holds it. */
  async deleteStorageKey(
    key: string,
    backend: 'indexeddb' | 'localstorage',
  ): Promise<void> {
    if (backend === 'indexeddb') {
      await idbDel(key)
      this.migrated.add(key)
    } else {
      localStorage.removeItem(key)
    }
  }

  private _prefixedKey(bucket: IdbBucket): string {
    switch (bucket) {
      case 'editors':
        return this.editorStorageKey
      case 'modelConfig':
        return this.modelStorageKey
      case 'dashboards':
        return this.dashboardStorageKey
      case 'chats':
        return this.chatStorageKey
    }
  }
}
