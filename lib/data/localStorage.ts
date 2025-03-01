import EditorInterface from '../editors/editor'
import { ModelConfig } from '../models'
import { BigQueryOauthConnection, DuckDBConnection, MotherDuckConnection } from '../connections'
import { reactive } from 'vue'
import AbstractStorage from './storage'

export default class LocalStorage extends AbstractStorage {
  private editorStorageKey: string
  private connectionStorageKey: string
  private modelStorageKey: string
  private userSettingsStorageKey: string
  public type: string

  constructor(prefix: string = '') {
    super()
    this.editorStorageKey = prefix + 'editors'
    this.connectionStorageKey = prefix + 'connections'
    this.modelStorageKey = prefix + 'modelConfig'
    this.userSettingsStorageKey = prefix + 'userSettings'
    this.type = 'local'
  }

  saveEditor(editor: EditorInterface): void {
    const editors = this.loadEditors()
    editors[editor.name] = editor
    this.saveEditors(Object.values(editors))
  }

  saveEditors(editorsList: EditorInterface[]): void {
    const editors = this.loadEditors()
    // override editors we've changed
    editorsList.forEach((editor) => {
      if (editor.changed) {
        editors[editor.name] = editor
        editor.changed = false
      }
    })
    localStorage.setItem(
      this.editorStorageKey,
      JSON.stringify(Object.values(editors).map((editor) => editor.toJSON())),
    )
  }

  loadEditors(): Record<string, EditorInterface> {
    const storedData = localStorage.getItem(this.editorStorageKey)
    let raw = storedData ? JSON.parse(storedData) : []
    // map the raw array to a Record<string, EditorInterface> with the editorInterface wrapped in reactive
    return raw.reduce((acc: Record<string, EditorInterface>, editor: EditorInterface) => {
      acc[editor.name] = reactive(EditorInterface.fromJSON(editor))
      acc[editor.name].storage = 'local'
      return acc
    }, {})
  }

  deleteEditor(name: string): void {
    const editors = this.loadEditors()
    if (editors[name]) {
      delete editors[name]
      localStorage.setItem(
        this.editorStorageKey,
        JSON.stringify(Object.values(editors).map((editor) => editor.toJSON())),
      )
    }
  }

  clearEditors(): void {
    localStorage.removeItem(this.editorStorageKey)
  }

  hasEditor(name: string): boolean {
    const editors = this.loadEditors()
    // any editor has the property name == name
    return Object.values(editors).some((editor) => editor.name === name)
  }

  saveConnections(
    connections: Array<BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection>,
  ): void {
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

  loadModelConfig(): Record<string, ModelConfig> {
    const storedData = localStorage.getItem(this.modelStorageKey)
    let raw = storedData ? JSON.parse(storedData) : []
    return raw.map((modelConfig: ModelConfig) => reactive(ModelConfig.fromJSON(modelConfig)))
  }

  saveModelConfig(modelConfig: ModelConfig[]): void {
    const current = this.loadModelConfig()
    modelConfig.forEach((model) => {
      if (model.changed) {
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
    let raw = storedData ? JSON.parse(storedData): {}
    return reactive(raw)
  }

  saveUserSettings(settings: Record<string, any>):void {
    localStorage.setItem(this.userSettingsStorageKey, JSON.stringify(settings))
  }
}
