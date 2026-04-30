import { reactive } from 'vue'
import AbstractStorage from './storage'
import Editor, { EditorTag } from '../editors/editor'
import type { EditorInterface } from '../editors/editor'
import { ModelConfig, ModelSource } from '../models'
import type { DashboardModel } from '../dashboards'
import type { Chat } from '../chats/chat'
import type { LLMProvider } from '../llm'
import type { GenericModelStore, StoreConnectionSpec } from '../remotes/models'
import type { CommunityApiStoreType } from '../stores/communityApiStore'
import type Connection from '../connections/base'
import {
  DuckDBConnection,
  BigQueryOauthConnection,
  SnowflakeJwtConnection,
  SQLiteConnection,
  RemoteProjectConnection,
} from '../connections'
import { fetchFromStore, fetchGenericStoreIndex } from '../remotes/storeService'
import {
  createStoreFile,
  deleteStoreFile,
  fetchStoreFileContent,
  fetchStoreFiles,
  updateStoreFile,
} from '../remotes/jobsService'
import {
  buildGenericStoreConnectionName,
  buildGenericStoreModelName,
  buildGenericStoreResourceName,
} from '../remotes/genericStoreMetadata'
import {
  getEditorTypeForPath,
  getFileExtension,
  supportsEditorSourceTag,
} from '../editors/fileTypes'

export interface RemoteStoreSnapshot {
  editors: Record<string, Editor>
  connections: Record<string, Connection>
  models: Record<string, ModelConfig>
}

const pathWithoutExtension = (path: string): string => path.replace(/\.[^.]+$/, '')

const flattenStoreFileTargets = (directories: { directory: string; files: string[] }[]): string[] =>
  directories.flatMap((entry) =>
    entry.files.map((fileName) => (entry.directory ? `${entry.directory}/${fileName}` : fileName)),
  )

export default class RemoteStoreStorage extends AbstractStorage {
  public type: string
  private communityStore: CommunityApiStoreType

  constructor(communityStore: CommunityApiStoreType) {
    super()
    this.communityStore = communityStore
    this.type = 'remote'
  }

  private getGenericStores(): GenericModelStore[] {
    return this.communityStore.stores.filter(
      (store): store is GenericModelStore => store.type === 'generic',
    )
  }

  private getStoreById(storeId: string): GenericModelStore | null {
    return this.getGenericStores().find((store) => store.id === storeId) || null
  }

  private buildEditorId(store: GenericModelStore, path: string): string {
    return `remote:${store.id}:${encodeURIComponent(path)}`
  }

  // Fallback engine used purely to populate RemoteProjectConnection.query_type
  // when we couldn't determine anything better. Does NOT cause a real
  // queryable connection to be fabricated.
  private async detectEngineForFallback(store: GenericModelStore): Promise<string> {
    try {
      const result = await fetchFromStore(store)
      return result.files[0]?.engine || 'duck_db'
    } catch {
      return 'duck_db'
    }
  }

  private buildRuntimeConnection(
    store: GenericModelStore,
    connectionName: string,
    modelName: string,
    spec: StoreConnectionSpec | null | undefined,
    fallbackEngine: string,
  ): Connection {
    const options = spec?.options || {}
    let connection: Connection

    // Wire values are pytrilogy `Dialects` enum members. Remap to the
    // client's in-process connection constructors. Dialects the client can't
    // construct (postgres/presto/trino/sql_server/dataframe) fall through to
    // the browse-only default. MotherDuck isn't a Dialects value; it's only
    // reachable via client-local connection setup, not remote advertisement.
    switch (spec?.type) {
      case 'duck_db':
        connection = new DuckDBConnection(connectionName, modelName)
        break
      case 'sqlite':
        connection = new SQLiteConnection(connectionName, modelName)
        break
      case 'bigquery':
        // Per docs/remote-store-contract.md: the server emits the coarse
        // `bigquery` type; the client defaults to OAuth. Service-account
        // from a remote store isn't a real use case today.
        connection = new BigQueryOauthConnection(
          connectionName,
          (options.projectId as string) || '',
          modelName,
        )
        break
      case 'snowflake':
        connection = new SnowflakeJwtConnection(
          connectionName,
          {
            account: (options.account as string) || '',
            username: (options.username as string) || '',
            privateKey: '',
            warehouse: (options.warehouse as string) || '',
            role: options.role as string | undefined,
            database: options.database as string | undefined,
            schema: options.schema as string | undefined,
          },
          modelName,
        )
        break
      default:
        // No runtime connection advertised, or an unknown type the client
        // can't construct (e.g. postgres / presto / sql_server). Keep the
        // store browse-only. Surfacing a warning here so maintainers notice.
        if (spec?.type) {
          console.warn(
            `Remote store "${store.name}" advertised unknown connection type "${spec.type}". Falling back to browse-only RemoteProjectConnection.`,
          )
        }
        return new RemoteProjectConnection(connectionName, store.id, fallbackEngine, modelName)
    }

    ;(connection as Connection & { remoteStoreId?: string | null }).remoteStoreId = store.id
    connection.storage = 'remote'
    connection.recomputeId()
    connection.model = modelName
    return connection
  }

  async loadStore(storeId: string): Promise<RemoteStoreSnapshot> {
    const store = this.getStoreById(storeId)
    if (!store) {
      return { editors: {}, connections: {}, models: {} }
    }

    const snapshot: RemoteStoreSnapshot = {
      editors: {},
      connections: {},
      models: {},
    }

    const [indexResult, filesResponse] = await Promise.all([
      fetchGenericStoreIndex(store).catch((err) => {
        console.warn(`Failed to fetch /index.json for store "${store.name}":`, err)
        return null
      }),
      fetchStoreFiles(store),
    ])

    const connectionSpec = indexResult?.connection ?? null
    const connectionName = buildGenericStoreConnectionName(store)
    const modelName = buildGenericStoreModelName(store)
    const startupScripts = new Set(indexResult?.startup_scripts ?? [])

    const targets = flattenStoreFileTargets(filesResponse.directories)
    const editorTargets = targets.filter((path) => getEditorTypeForPath(path) !== null)

    const contentsByPath = await Promise.all(
      editorTargets.map(async (path) => ({
        path,
        content: await fetchStoreFileContent(store, path),
      })),
    )

    contentsByPath.forEach(({ path, content }) => {
      const type = getEditorTypeForPath(path)
      if (!type) {
        return
      }

      const tags: EditorTag[] = []
      if (supportsEditorSourceTag(type)) tags.push(EditorTag.SOURCE)
      if (startupScripts.has(path)) tags.push(EditorTag.STARTUP_SCRIPT)

      const editor = reactive(
        new Editor({
          id: this.buildEditorId(store, path),
          name: path,
          type,
          connection: connectionName,
          storage: 'remote',
          contents: content,
          tags,
          remoteStoreId: store.id,
          remotePath: path,
          remotePersisted: true,
        }),
      )
      editor.changed = false
      snapshot.editors[editor.id] = editor
    })

    let runtimeConnection: Connection
    if (connectionSpec && connectionSpec.type) {
      runtimeConnection = this.buildRuntimeConnection(
        store,
        connectionName,
        modelName,
        connectionSpec,
        connectionSpec.type,
      )
    } else {
      // No `connection` on /index.json → browse-only. Warn if the
      // discovered model manifest declares a non-duckdb engine: that
      // implies the server owner forgot to advertise a runtime
      // connection and queries will fail.
      const fallbackEngine = await this.detectEngineForFallback(store)
      if (fallbackEngine && fallbackEngine !== 'duck_db' && fallbackEngine !== 'duckdb') {
        console.warn(
          `Remote store "${store.name}" did not declare a runtime connection but its model engine is "${fallbackEngine}". Queries will not run until /index.json includes a connection block.`,
        )
      }
      runtimeConnection = new RemoteProjectConnection(
        connectionName,
        store.id,
        fallbackEngine,
        modelName,
      )
    }

    const reactiveConnection = reactive(runtimeConnection)
    reactiveConnection.changed = false
    snapshot.connections[connectionName] = reactiveConnection

    const model = reactive(
      new ModelConfig({
        name: modelName,
        storage: 'remote',
        description: `${buildGenericStoreResourceName(store)} remote project`,
        sources: targets
          .filter((path) => getFileExtension(path) === '.preql')
          .map(
            (path) =>
              new ModelSource(this.buildEditorId(store, path), pathWithoutExtension(path), [], []),
          ),
      }),
    )
    model.changed = false
    snapshot.models[model.name] = model

    return snapshot
  }

  async saveEditor(editor: EditorInterface): Promise<void> {
    await this.saveEditors([editor])
  }

  async saveEditors(editorsList: EditorInterface[]): Promise<void> {
    for (const editor of editorsList) {
      if (!editor.remoteStoreId) {
        continue
      }

      const store = this.getStoreById(editor.remoteStoreId)
      if (!store) {
        continue
      }

      const currentPath = editor.remotePath || editor.name
      const originalPath = editor.remoteOriginalPath

      if (editor.deleted) {
        if (editor.remotePersisted || originalPath) {
          await deleteStoreFile(store, originalPath || currentPath)
        }
        editor.changed = false
        continue
      }

      if (!editor.changed) {
        continue
      }

      if (originalPath && originalPath !== currentPath) {
        await createStoreFile(store, currentPath, editor.contents)
        await deleteStoreFile(store, originalPath)
      } else if (editor.remotePersisted) {
        await updateStoreFile(store, currentPath, editor.contents)
      } else {
        await createStoreFile(store, currentPath, editor.contents)
      }

      editor.remotePath = currentPath
      editor.remoteOriginalPath = null
      editor.remotePersisted = true
      editor.changed = false
    }
  }

  async loadEditors(): Promise<Record<string, Editor>> {
    const editors: Record<string, Editor> = {}
    const stores = this.getGenericStores()

    await Promise.allSettled(
      stores.map(async (store) => {
        Object.assign(editors, (await this.loadStore(store.id)).editors)
      }),
    )

    return editors
  }

  async deleteEditor(_: string): Promise<void> {
    return
  }

  async clearEditors(): Promise<void> {
    return
  }

  async saveConnections(connections: Array<Connection>): Promise<void> {
    connections.forEach((connection) => {
      connection.changed = false
    })
  }

  async loadConnections(): Promise<Record<string, Connection>> {
    const connections: Record<string, Connection> = {}
    const stores = this.getGenericStores()

    await Promise.allSettled(
      stores.map(async (store) => {
        Object.assign(connections, (await this.loadStore(store.id)).connections)
      }),
    )

    return connections
  }

  async deleteConnection(_: string): Promise<void> {
    return
  }

  async loadModelConfig(): Promise<Record<string, ModelConfig>> {
    const models: Record<string, ModelConfig> = {}
    const stores = this.getGenericStores()

    await Promise.allSettled(
      stores.map(async (store) => {
        Object.assign(models, (await this.loadStore(store.id)).models)
      }),
    )

    return models
  }

  async saveModelConfig(modelConfig: ModelConfig[]): Promise<void> {
    modelConfig.forEach((model) => {
      model.changed = false
    })
  }

  clearModelConfig(): void {
    return
  }

  async saveLLMConnections(_: Array<LLMProvider>): Promise<void> {
    return
  }

  async loadLLMConnections(): Promise<Record<string, LLMProvider>> {
    return {}
  }

  async deleteLLMConnection(_: string): Promise<void> {
    return
  }

  async saveDashboards(_: DashboardModel[]): Promise<void> {
    return
  }

  async loadDashboards(): Promise<Record<string, DashboardModel>> {
    return {}
  }

  async deleteDashboard(_: string): Promise<void> {
    return
  }

  async clearDashboards(): Promise<void> {
    return
  }

  async saveChats(_: Chat[]): Promise<void> {
    return
  }

  async loadChats(): Promise<Record<string, Chat>> {
    return {}
  }

  async deleteChat(_: string): Promise<void> {
    return
  }

  async clearChats(): Promise<void> {
    return
  }
}
