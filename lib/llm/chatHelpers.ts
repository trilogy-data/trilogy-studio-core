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
 * Creates a prompt to evaluate if the LLM should auto-continue after a response.
 * This is used to detect when the LLM has stated an intention to do something
 * but hasn't actually done it (e.g., "I'll execute this query now").
 */
export function createAutoContinuePrompt(lastAssistantMessage: string): string {
  // Truncate very long messages to focus on the ending
  const messageEnd = lastAssistantMessage.length > 1500
    ? lastAssistantMessage.slice(-1500)
    : lastAssistantMessage

  return `Analyze the following assistant message ending. Determine if the assistant has stated an intention to take an action (like executing a query, running code, trying something) but has not yet actually performed that action.

Answer ONLY "YES" if:
- The message ends with phrases like "I'll execute this now", "Let me try this", "I'll run this query", "Let's execute", "I will now execute", etc.
- The assistant has proposed a solution and stated they will test/run/execute it
- The message indicates the assistant is about to take an action but stopped

Answer ONLY "NO" if:
- The message is asking a question to the user
- The message is presenting results or conclusions
- The message ends with a completed thought that doesn't require follow-up action
- The assistant is waiting for user input or confirmation
- The message ends with a tool call that was executed
- The assistant has already executed the action and shown results

Message ending:
"""
${messageEnd}
"""

Answer (YES or NO):`
}

/**
 * Parses the auto-continue evaluation response.
 * Returns true if the LLM should auto-continue.
 */
export function parseAutoContinueResponse(response: string): boolean {
  const normalized = response.trim().toUpperCase()
  // Check for YES at the start of the response
  return normalized === 'YES' || normalized.startsWith('YES')
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
