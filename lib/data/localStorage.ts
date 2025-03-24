import EditorInterface from '../editors/editor'
import { ModelConfig } from '../models'
import {
  BigQueryOauthConnection,
  DuckDBConnection,
  MotherDuckConnection,
  SnowflakeConnection,
} from '../connections'
import { LLMProvider, OpenAIProvider, MistralProvider, AnthropicProvider } from '../llm'
import { reactive } from 'vue'
import AbstractStorage from './storage'

export default class LocalStorage extends AbstractStorage {
  private editorStorageKey: string
  private connectionStorageKey: string
  private llmConnectionStorageKey: string
  private modelStorageKey: string
  private userSettingsStorageKey: string
  public type: string

  constructor(prefix: string = '') {
    super()
    this.editorStorageKey = prefix + 'editors'
    this.connectionStorageKey = prefix + 'connections'
    this.llmConnectionStorageKey = prefix + 'llmConnections'
    this.modelStorageKey = prefix + 'modelConfig'
    this.userSettingsStorageKey = prefix + 'userSettings'
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
        editors[editor.name] = editor
        editor.changed = false
      }
      if (editor.deleted) {
        delete editors[editor.name]
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
      acc[editor.name] = reactive(EditorInterface.fromJSON(editor))
      acc[editor.name].storage = 'local'
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

  async hasEditor(name: string): Promise<boolean> {
    const editors = await this.loadEditors()
    // any editor has the property name == name
    return Object.values(editors).some((editor) => editor.name === name)
  }

  async saveConnections(
    connections: Array<BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection>,
  ): Promise<void> {
    localStorage.setItem(this.connectionStorageKey, JSON.stringify(connections))
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
          connections[connection.name] = reactive(SnowflakeConnection.fromJSON(connection))
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
      delete connections[name]
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
    localStorage.setItem(
      this.llmConnectionStorageKey,
      JSON.stringify(connections.map((connection) => connection.toJSON())),
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
          connections[connection.name] = reactive(OpenAIProvider.fromJSON(connection))
          break
        case 'mistral':
          // @ts-ignore
          connections[connection.name] = reactive(MistralProvider.fromJSON(connection))
          break
        case 'anthropic':
          // Handle the async operation properly
          // @ts-ignore
          connections[connection.name] = reactive(AnthropicProvider.fromJSON(connection))
          break

        default:
          console.log(connection.type)
      }
    }

    return connections
  }

  async deleteLLMConnection(name: string): Promise<void> {
    const connections = await this.loadLLMConnections()
    if (connections[name]) {
      delete connections[name]
      this.saveLLMConnections(Object.values(connections))
    }
  }

  async clearLLMConnections(): Promise<void> {
    localStorage.removeItem(this.llmConnectionStorageKey)
  }
}
