import { reactive } from 'vue'
import AbstractStorage from './storage'
import Editor, { EditorTag } from '../editors/editor'
import type { EditorInterface } from '../editors/editor'
import { ModelConfig, ModelSource } from '../models'
import type { DashboardModel } from '../dashboards'
import type { Chat } from '../chats/chat'
import type { LLMProvider } from '../llm'
import type { GenericModelStore } from '../remotes/models'
import type { CommunityApiStoreType } from '../stores/communityApiStore'
import type Connection from '../connections/base'
import RemoteProjectConnection from '../connections/remoteProject'
import { fetchFromStore } from '../remotes/storeService'
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
  editors: Record<string, EditorInterface>
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

  private async detectEngine(store: GenericModelStore): Promise<string> {
    try {
      const result = await fetchFromStore(store)
      return result.files[0]?.engine || 'duckdb'
    } catch {
      return 'duckdb'
    }
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

    const filesResponse = await fetchStoreFiles(store)
    const remoteEngine = await this.detectEngine(store)
    const connectionName = buildGenericStoreConnectionName(store)
    const modelName = buildGenericStoreModelName(store)

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

      const editor = reactive(
        new Editor({
          id: this.buildEditorId(store, path),
          name: path,
          type,
          connection: connectionName,
          storage: 'remote',
          contents: content,
          tags: supportsEditorSourceTag(type) ? [EditorTag.SOURCE] : [],
          remoteStoreId: store.id,
          remotePath: path,
          remotePersisted: true,
        }),
      )
      editor.changed = false
      snapshot.editors[editor.id] = editor
    })

    const remoteConnection = reactive(
      new RemoteProjectConnection(connectionName, store.id, remoteEngine, modelName),
    )
    remoteConnection.changed = false
    snapshot.connections[connectionName] = remoteConnection

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

  async loadEditors(): Promise<Record<string, EditorInterface>> {
    const editors: Record<string, EditorInterface> = {}
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
