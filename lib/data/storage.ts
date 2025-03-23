import EditorInterface from '../editors/editor'
import { ModelConfig } from '../models'
import {
  BigQueryOauthConnection,
  DuckDBConnection,
  MotherDuckConnection,
  SnowflakeConnection,
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
      BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection | SnowflakeConnection
    >,
  ): Promise<void>
  abstract loadConnections(): Promise<
    Record<
      string,
      BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection | SnowflakeConnection
    >
  >
  abstract deleteConnection(name: string): Promise<void>

  abstract loadModelConfig(): Promise<Record<string, ModelConfig>>
  abstract saveModelConfig(modelConfig: ModelConfig[]): Promise<void>
  abstract clearModelConfig(): void

  abstract saveLLMConnections(connections: Array<LLMProvider>): Promise<void>
  abstract loadLLMConnections(): Promise<Record<string, LLMProvider>>
  abstract deleteLLMConnection(name: string): Promise<void>
}
