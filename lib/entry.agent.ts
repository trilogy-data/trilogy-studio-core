// Lean, framework-free agent core: LLM providers that call their APIs straight
// from the browser, and the provider-agnostic tool loop. Nothing here imports
// vue, pinia, DuckDB, Monaco or the Trilogy prompt material, so an app that
// only wants to drive its own tools (e.g. trilogy-cloud's assistant) can take
// this subpath without the rest of the studio. `./llm` re-exports all of it.
export { LLMProvider } from './llm/base'
export type {
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  LLMToolCall,
  LLMToolResult,
  LLMToolDefinition,
  RateLimitBackoffCallback,
} from './llm/base'
export {
  AnthropicProvider,
  parseAnthropicModelVersion,
  compareAnthropicModels,
} from './llm/anthropic'
export { OpenAIProvider } from './llm/openai'
export { OpenRouterProvider } from './llm/openrouter'
export { DeepSeekProvider, parseDeepSeekModel, compareDeepSeekModels } from './llm/deepseek'
export {
  runToolLoop,
  providerAdapter,
  formatToolResultText,
  stripPromptWrapperTags,
  SYSTEM_INPUT_START,
  SYSTEM_INPUT_END,
} from './llm/toolLoopCore'
export type {
  LLMAdapter,
  MessagePersistence,
  ToolExecutorFactory,
  ExecutionStateUpdater,
  ToolLoopConfig,
  ToolLoopResult,
} from './llm/toolLoopCore'
export { RETURN_TO_USER_TOOL } from './llm/returnToUserTool'
export type { ToolCallResult } from './llm/sharedToolHelpers'
export type { ChatMessage, ChatArtifact, ChatToolCall } from './chats/chat'
