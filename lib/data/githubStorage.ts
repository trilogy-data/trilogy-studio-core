import EditorInterface from '../editors/editor'
import { ModelConfig } from '../models'
import {
  BigQueryOauthConnection,
  DuckDBConnection,
  MotherDuckConnection,
  SnowflakeJwtConnection,
} from '../connections'
import { LLMProvider, OpenAIProvider, AnthropicProvider } from '../llm'
import { reactive } from 'vue'
import AbstractStorage from './storage'
import { DashboardModel } from '../dashboards'
import { Chat } from '../chats/chat'

interface GitHubConfig {
  token: string
  owner: string
  repo: string
  branch: string
  path: string // Subdirectory path
}

export default class GitHubStorage extends AbstractStorage {
  private editorStorageFile: string
  private connectionStorageFile: string
  private llmConnectionStorageFile: string
  private modelStorageFile: string
  private userSettingsStorageFile: string
  private config: GitHubConfig
  public type: string

  constructor(config: GitHubConfig, prefix: string = '') {
    super()
    this.config = config
    this.editorStorageFile = prefix + 'editors.json'
    this.connectionStorageFile = prefix + 'connections.json'
    this.llmConnectionStorageFile = prefix + 'llmConnections.json'
    this.modelStorageFile = prefix + 'modelConfig.json'
    this.userSettingsStorageFile = prefix + 'userSettings.json'
    this.type = 'github'
  }

  private async fetchFile(filePath: string): Promise<any> {
    try {
      const fullPath = `${this.config.path ? this.config.path + '/' : ''}${filePath}`
      const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${fullPath}?ref=${this.config.branch}`

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (response.status === 404) {
        return null // File doesn't exist yet
      }

      const data = await response.json()
      if (data.content) {
        const content = atob(data.content)
        return {
          content: JSON.parse(content),
          sha: data.sha,
        }
      }
      return null
    } catch (error) {
      console.error(`Error fetching file ${filePath}:`, error)
      return null
    }
  }

  private async saveFile(filePath: string, content: any): Promise<boolean> {
    try {
      const fullPath = `${this.config.path ? this.config.path + '/' : ''}${filePath}`
      const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${fullPath}`

      // Check if file exists to get its SHA
      const existing = await this.fetchFile(filePath)
      const sha = existing?.sha

      const body: any = {
        message: `Update ${filePath}`,
        content: btoa(JSON.stringify(content, null, 2)),
        branch: this.config.branch,
      }

      if (sha) {
        body.sha = sha
      }

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify(body),
      })

      return response.ok
    } catch (error) {
      console.error(`Error saving file ${filePath}:`, error)
      return false
    }
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
        editors[editor.name] = editor
        editor.changed = false
      }
    })
    await this.saveFile(
      this.editorStorageFile,
      Object.values(editors).map((editor) => editor.toJSON()),
    )
  }

  async loadEditors(): Promise<Record<string, EditorInterface>> {
    const response = await this.fetchFile(this.editorStorageFile)
    let raw = response?.content || []
    // map the raw array to a Record<string, EditorInterface> with the editorInterface wrapped in reactive
    return raw.reduce((acc: Record<string, EditorInterface>, editor: EditorInterface) => {
      acc[editor.name] = reactive(EditorInterface.fromJSON(editor))
      acc[editor.name].storage = 'github'
      return acc
    }, {})
  }

  async deleteEditor(name: string): Promise<void> {
    const editors = await this.loadEditors()
    if (editors[name]) {
      delete editors[name]
      await this.saveFile(
        this.editorStorageFile,
        Object.values(editors).map((editor) => editor.toJSON()),
      )
    }
  }

  async clearEditors(): Promise<void> {
    // Create an empty file instead of deleting it
    await this.saveFile(this.editorStorageFile, [])
  }

  async hasEditor(name: string): Promise<boolean> {
    const editors = await this.loadEditors()
    // any editor has the property name == name
    return Object.values(editors).some((editor) => editor.name === name)
  }

  async saveConnections(
    connections: Array<
      BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection | SnowflakeJwtConnection
    >,
  ): Promise<void> {
    await this.saveFile(this.connectionStorageFile, connections)
  }

  async loadConnections(): Promise<
    Record<
      string,
      BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection | SnowflakeJwtConnection
    >
  > {
    const response = await this.fetchFile(this.connectionStorageFile)
    const raw = response?.content || []
    const connections: Record<
      string,
      BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection | SnowflakeJwtConnection
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
          // @ts-ignore
          connections[connection.name] = reactive(await MotherDuckConnection.fromJSON(connection))
          break
        case 'snowflake':
          // @ts-ignore
          connections[connection.name] = reactive(SnowflakeConnection.fromJSON(connection))
          break
      }
    }

    return connections
  }

  async deleteConnection(name: string): Promise<void> {
    const connections = await this.loadConnections()
    if (connections[name]) {
      delete connections[name]
      await this.saveConnections(Object.values(connections))
    }
  }

  // model config storage
  async loadModelConfig(): Promise<Record<string, ModelConfig>> {
    const response = await this.fetchFile(this.modelStorageFile)
    let raw = response?.content || []
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
      }
    })
    await this.saveFile(this.modelStorageFile, Object.values(current))
  }

  async clearModelConfig(): Promise<void> {
    await this.saveFile(this.modelStorageFile, [])
  }

  // user Setting Storage
  async loadUserSettings(): Promise<Record<string, any>> {
    const response = await this.fetchFile(this.userSettingsStorageFile)
    let raw = response?.content || {}
    return reactive(raw)
  }

  async saveUserSettings(settings: Record<string, any>): Promise<void> {
    await this.saveFile(this.userSettingsStorageFile, settings)
  }

  async saveLLMConnections(connections: Array<LLMProvider>): Promise<void> {
    await this.saveFile(
      this.llmConnectionStorageFile,
      connections.map((connection) => connection.toJSON()),
    )
  }

  async loadLLMConnections(): Promise<Record<string, LLMProvider>> {
    const response = await this.fetchFile(this.llmConnectionStorageFile)
    const raw = response?.content || []
    const connections: Record<string, LLMProvider> = {}

    // Process each connection sequentially
    for (const connection of raw) {
      switch (connection.type) {
        case 'openai':
          // @ts-ignore
          connections[connection.name] = reactive(OpenAIProvider.fromJSON(connection))
          break
        case 'anthropic':
          // @ts-ignore
          connections[connection.name] = reactive(AnthropicProvider.fromJSON(connection))
          break
        default:
          console.log(`Unknown LLM provider type: ${connection.type}`)
      }
    }

    return connections
  }

  async deleteLLMConnection(name: string): Promise<void> {
    const connections = await this.loadLLMConnections()
    if (connections[name]) {
      delete connections[name]
      await this.saveLLMConnections(Object.values(connections))
    }
  }

  async clearLLMConnections(): Promise<void> {
    await this.saveFile(this.llmConnectionStorageFile, [])
  }

  async saveDashboards(dashboards: DashboardModel[]): Promise<void> {
    await this.saveFile('dashboards.json', dashboards)
  }
  async loadDashboards(): Promise<Record<string, DashboardModel>> {
    const response = await this.fetchFile('dashboards.json')
    let raw = response?.content || []
    return raw.map((dashboard: DashboardModel) =>
      reactive(DashboardModel.fromSerialized(dashboard)),
    )
  }
  async deleteDashboard(name: string): Promise<void> {
    const dashboards = await this.loadDashboards()
    if (dashboards[name]) {
      delete dashboards[name]
      await this.saveDashboards(Object.values(dashboards))
    }
  }

  async clearDashboards(): Promise<void> {
    await this.saveFile('dashboards.json', [])
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

    await this.saveFile(
      'chats.json',
      Object.values(chats).map((chat) => chat.serialize()),
    )
  }

  async loadChats(): Promise<Record<string, Chat>> {
    const response = await this.fetchFile('chats.json')
    let raw = response?.content || []

    return raw.reduce((acc: Record<string, Chat>, chatData: any) => {
      const chat = Chat.fromSerialized(chatData)
      acc[chat.id] = reactive(chat) as Chat
      acc[chat.id].storage = 'github'
      return acc
    }, {})
  }

  async deleteChat(id: string): Promise<void> {
    const chats = await this.loadChats()
    if (chats[id]) {
      delete chats[id]
      await this.saveChats(Object.values(chats))
    }
  }

  async clearChats(): Promise<void> {
    await this.saveFile('chats.json', [])
  }
}
