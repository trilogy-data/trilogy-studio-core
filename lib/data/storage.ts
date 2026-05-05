import type { EditorInterface } from '../editors/editor'
import { ModelConfig } from '../models'
import { DashboardModel } from '../dashboards'
import type Connection from '../connections/base'
import { LLMProvider } from '../llm'
import { Chat } from '../chats/chat'
import { Project } from '../projects/project'
export default abstract class AbstractStorage {
  public type: string

  constructor() {
    this.type = 'abstract'
  }

  abstract saveEditor(editor: EditorInterface): Promise<void>
  abstract saveEditors(editorsList: EditorInterface[]): Promise<void>
  abstract loadEditors(): Promise<Record<string, EditorInterface>>
  abstract deleteEditor(name: string): Promise<void>
  abstract clearEditors(): Promise<void>

  abstract saveConnections(connections: Array<Connection>): Promise<void>
  abstract loadConnections(): Promise<Record<string, Connection>>
  abstract deleteConnection(name: string): Promise<void>

  abstract loadModelConfig(): Promise<Record<string, ModelConfig>>
  abstract saveModelConfig(modelConfig: ModelConfig[]): Promise<void>
  abstract clearModelConfig(): void

  abstract saveLLMConnections(connections: Array<LLMProvider>): Promise<void>
  abstract loadLLMConnections(): Promise<Record<string, LLMProvider>>
  abstract deleteLLMConnection(name: string): Promise<void>

  abstract saveDashboards(dashboards: DashboardModel[]): Promise<void>
  abstract loadDashboards(): Promise<Record<string, DashboardModel>>
  abstract deleteDashboard(name: string): Promise<void>
  abstract clearDashboards(): Promise<void>

  abstract saveChats(chats: Chat[]): Promise<void>
  abstract loadChats(): Promise<Record<string, Chat>>
  abstract deleteChat(id: string): Promise<void>
  abstract clearChats(): Promise<void>

  // Project persistence — concrete defaults so storages that don't yet
  // support projects keep compiling. Explorer's LocalStorage overrides these.
  // Studio doesn't currently use projects; if it adopts them later,
  // GitHubStorage and RemoteStoreStorage can implement these too.
  async saveProjects(_projects: Project[]): Promise<void> {
    /* default no-op */
  }
  async loadProjects(): Promise<Record<string, Project>> {
    return {}
  }
  async deleteProject(_id: string): Promise<void> {
    /* default no-op */
  }
  async clearProjects(): Promise<void> {
    /* default no-op */
  }
}
