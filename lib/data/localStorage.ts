import EditorInterface from '../editors/editor'
import { ModelConfig } from '../models'
import {
  BigQueryOauthConnection,
  DuckDBConnection,
  MotherDuckConnection,
  SnowflakeJwtConnection,
} from '../connections'
import {
  LLMProvider,
  OpenAIProvider,
  AnthropicProvider,
  GoogleProvider,
} from '../llm'
import { reactive } from 'vue'
import AbstractStorage from './storage'
import { DashboardModel } from '../dashboards/base'
import { Chat } from '../chats/chat'

export default class LocalStorage extends AbstractStorage {
  private editorStorageKey: string
  private connectionStorageKey: string
  private llmConnectionStorageKey: string
  private modelStorageKey: string
  private userSettingsStorageKey: string
  private dashboardStorageKey: string
  private chatStorageKey: string
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

  async saveEditor(editor: EditorInterface): Promise<void> {
    const editors = await this.loadEditors()
    editors[editor.name] = editor
    this.saveEditors(Object.values(editors))
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
    localStorage.setItem(
      this.editorStorageKey,
      JSON.stringify(Object.values(editors).map((editor) => editor.toJSON())),
    )
  }

  async loadEditors(): Promise<Record<string, EditorInterface>> {
    const storedData = localStorage.getItem(this.editorStorageKey)
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
      localStorage.setItem(
        this.editorStorageKey,
        JSON.stringify(Object.values(editors).map((editor) => editor.toJSON())),
      )
    }
  }

  async clearEditors(): Promise<void> {
    localStorage.removeItem(this.editorStorageKey)
  }

  async hasEditor(id: string): Promise<boolean> {
    const editors = await this.loadEditors()
    // any editor has the property name == name
    return Object.values(editors).some((editor) => editor.id === id)
  }

  async saveConnections(
    connections: Array<BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection>,
  ): Promise<void> {
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

  async loadConnections(): Promise<
    Record<string, BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection>
  > {
    const storedData = localStorage.getItem(this.connectionStorageKey)
    const raw = storedData ? JSON.parse(storedData) : []
    const connections: Record<
      string,
      BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection
    > = {}

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
    const storedData = localStorage.getItem(this.modelStorageKey)
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
    localStorage.setItem(this.modelStorageKey, JSON.stringify(Object.values(current)))
  }

  clearModelConfig(): void {
    localStorage.removeItem(this.modelStorageKey)
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

    localStorage.setItem(
      this.dashboardStorageKey,
      JSON.stringify(
        Object.values(dashboards).map((dashboard) => {
          return dashboard.serialize()
        }),
      ),
    )
  }

  async loadDashboards(): Promise<Record<string, DashboardModel>> {
    const storedData = localStorage.getItem(this.dashboardStorageKey)
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
      localStorage.setItem(
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
    localStorage.removeItem(this.dashboardStorageKey)
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

    localStorage.setItem(
      this.chatStorageKey,
      JSON.stringify(Object.values(chats).map((chat) => chat.serialize())),
    )
  }

  async loadChats(): Promise<Record<string, Chat>> {
    const storedData = localStorage.getItem(this.chatStorageKey)
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
      localStorage.setItem(
        this.chatStorageKey,
        JSON.stringify(Object.values(chats).map((chat) => chat.serialize())),
      )
    }
  }

  async clearChats(): Promise<void> {
    localStorage.removeItem(this.chatStorageKey)
  }

  async hasChat(id: string): Promise<boolean> {
    const chats = await this.loadChats()
    return id in chats
  }
}
