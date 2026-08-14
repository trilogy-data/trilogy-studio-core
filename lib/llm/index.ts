export { LLMProvider } from './base'
export { DemoProvider } from './demo'
export type { LLMRequestOptions, LLMResponse, LLMMessage } from './base'
export { OpenAIProvider } from './openai'
export { AnthropicProvider } from './anthropic'
export { GoogleProvider } from './googlev2'
export { OpenRouterProvider } from './openrouter'
export type { OpenRouterModel, OpenRouterOAuthConfig } from './openrouter'
export { DeepSeekProvider } from './deepseek'
export { createPrompt, createFilterPrompt, createDashboardPrompt } from './data/prompts'
export { createChatNamePrompt, extractChatName } from './chatHelpers'
export type { ModelConceptInput } from './data/models'

// Chat agent prompt builder
export {
  buildChatAgentSystemPrompt,
  buildCustomTrilogyPrompt,
  CHAT_TOOLS,
  RETURN_TO_USER_TOOL,
} from './chatAgentPrompt'
export type { ChatAgentPromptOptions, TrilogyPromptContext } from './chatAgentPrompt'

// Provider UI helpers
export { PROVIDERS, PROVIDER_LABELS, KEY_PLACEHOLDERS } from './consts'
export type { ProviderValue } from './consts'

// Conversation compaction
export {
  compactHistory,
  compactChat,
  maybeCompactChat,
  shouldCompact,
  DEFAULT_COMPACTION_THRESHOLD_TOKENS,
  DEFAULT_KEEP_RECENT_TOKENS,
} from './compaction'
export type { CompactableHistory, CompactionOptions, CompactionResult } from './compaction'
export { estimateTextTokens, estimateMessageTokens, estimateHistoryTokens } from './tokenEstimate'

// Editor refinement tools
export { EDITOR_REFINEMENT_TOOLS, buildEditorRefinementPrompt } from './editorRefinementTools'
export type { EditorRefinementContext } from './editorRefinementTools'
export { EditorRefinementToolExecutor } from './editorRefinementToolExecutor'
export type { EditorContext } from './editorRefinementToolExecutor'
export type { ToolCallResult } from './sharedToolHelpers'
