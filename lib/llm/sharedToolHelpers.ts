/**
 * Shared helpers extracted from ChatToolExecutor, DashboardToolExecutor, and
 * EditorRefinementToolExecutor to eliminate duplication across the three tool
 * executor classes.
 */

import type { ChatArtifact } from '../chats/chat'
import type { CompletionItem } from '../stores/resolver'

export interface ToolCallResult {
  success: boolean
  artifact?: ChatArtifact
  artifactId?: string
  error?: string
  message?: string
  executionTime?: number
  query?: string
  generatedSql?: string
  formattedQuery?: string
  triggersSymbolRefresh?: boolean
  terminatesLoop?: boolean
  awaitsUserInput?: boolean
  availableSymbols?: CompletionItem[]
  imageData?: {
    data: string
    mediaType: string
  }
}
