import EditorInterface from '../editors/editor'
import { ModelConfig } from '../models'
import { BigQueryOauthConnection, DuckDBConnection, MotherDuckConnection } from '../connections'
import { MistralProvider, OpenAIProvider, AnthropicProvider } from '../llm'
export default abstract class AbstractStorage {
  public type: string

  constructor() {
    this.type = 'abstract'
  }

  abstract saveEditor(editor: EditorInterface): void
  abstract saveEditors(editorsList: EditorInterface[]): void
  abstract loadEditors(): Record<string, EditorInterface>
  abstract deleteEditor(name: string): void
  abstract clearEditors(): void
  abstract hasEditor(name: string): boolean

  abstract saveConnections(
    connections: Array<BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection>,
  ): void
  abstract loadConnections(): Promise<
    Record<string, BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection>
  >
  abstract deleteConnection(name: string): void

  abstract loadModelConfig(): Record<string, ModelConfig>
  abstract saveModelConfig(modelConfig: ModelConfig[]): void
  abstract clearModelConfig(): void

  abstract saveLLMConnections(
    connections: Array<OpenAIProvider | AnthropicProvider | MistralProvider>,
  ):void
  abstract loadLLMConnections(
  ): Promise<Record<string, OpenAIProvider | AnthropicProvider | MistralProvider>>
  abstract deleteLLMConnection(name:string) : void
}
