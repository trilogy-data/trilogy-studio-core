import EditorInterface from '../editors/editor'
import { ModelConfig } from '../models'
import { DashboardModel } from '../dashboards'
import {
  BigQueryOauthConnection,
  DuckDBConnection,
  MotherDuckConnection,
  SnowflakeBasicAuthConnection,
  SnowflakeJwtConnection,
} from '../connections'
import { LLMProvider } from '../llm'
export default abstract class AbstractStorage {
  public type: string

  constructor() {
    this.type = 'abstract'
  }

  abstract saveEditor(editor: EditorInterface): void
  abstract saveEditors(editorsList: EditorInterface[]): void
  abstract loadEditors(): Promise<Record<string, EditorInterface>>
  abstract deleteEditor(name: string): Promise<void>
  abstract clearEditors(): Promise<void>

  abstract saveConnections(
    connections: Array<
      | BigQueryOauthConnection
      | DuckDBConnection
      | MotherDuckConnection
      | SnowflakeJwtConnection
      | SnowflakeBasicAuthConnection
    >,
  ): Promise<void>
  abstract loadConnections(): Promise<
    Record<
      string,
      | BigQueryOauthConnection
      | DuckDBConnection
      | MotherDuckConnection
      | SnowflakeJwtConnection
      | SnowflakeBasicAuthConnection
    >
  >
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
}
