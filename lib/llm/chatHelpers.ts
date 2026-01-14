import type { LLMMessage } from './base'

/**
 * Creates a prompt for generating a concise chat name based on conversation content.
 * Designed to work with fast/lightweight models.
 */
export function createChatNamePrompt(messages: LLMMessage[]): string {
  // Filter out system messages and hidden messages, take recent messages for context
  const visibleMessages = messages
    .filter((m) => m.role !== 'system' && !m.hidden)
    .slice(0, 10) // Limit to first 10 messages for efficiency

  if (visibleMessages.length === 0) {
    return 'Generate a short, descriptive name for a new chat conversation. Return only the name, nothing else. Maximum 5 words.'
  }

  // Create a summary of the conversation
  const conversationSummary = visibleMessages
    .map((m) => {
      const role = m.role === 'user' ? 'User' : 'Assistant'
      // Truncate long messages
      const content = m.content.length > 200 ? m.content.substring(0, 200) + '...' : m.content
      return `${role}: ${content}`
    })
    .join('\n')

  return `Based on the following conversation, generate a short, descriptive name (3-5 words max) that captures the main topic or purpose. Return ONLY the name, nothing else. No quotes, no explanation.

Conversation:
${conversationSummary}

Chat name:`
}

/**
 * Extracts a clean chat name from an LLM response.
 * Handles various response formats and cleans up the output.
 */
export function extractChatName(response: string): string {
  // Remove common wrapper patterns
  let name = response.trim()

  // Remove quotes if present
  name = name.replace(/^["']|["']$/g, '')

  // Remove "Chat name:" or similar prefixes
  name = name.replace(/^(chat name|name|title):\s*/i, '')

  // Take only the first line if multiple lines
  name = name.split('\n')[0].trim()

  // Limit length
  if (name.length > 50) {
    name = name.substring(0, 47) + '...'
  }

  // Fallback if empty
  if (!name) {
    name = `Chat ${new Date().toLocaleTimeString()}`
  }

  return name
}
