import { describe, expect, it } from 'vitest'
import type { ChatMessage, ChatToolCall } from '../../chats/chat'
import {
  condenseToolCalls,
  getToolDisplayName,
  mergeContiguousToolCallMessages,
} from './toolCallDisplay'

function buildToolCall(id: string, name: string, success = true): ChatToolCall {
  return {
    id,
    name,
    input: {},
    result: {
      success,
    },
  }
}

describe('toolCallDisplay', () => {
  it('capitalizes mapped and fallback tool labels', () => {
    expect(getToolDisplayName('select_active_import')).toBe('Selected active import')
    expect(getToolDisplayName('return_to_user')).toBe('Returned to user')
    expect(getToolDisplayName('custom_tool_name')).toBe('Custom tool name')
  })

  it('merges contiguous tool-only assistant messages', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        executedToolCalls: [buildToolCall('1', 'run_trilogy_query')],
      },
      {
        role: 'assistant',
        content: '',
        executedToolCalls: [buildToolCall('2', 'update_artifact')],
      },
      {
        role: 'assistant',
        content: 'Final answer',
      },
    ]

    const merged = mergeContiguousToolCallMessages(messages)

    expect(merged).toHaveLength(2)
    expect(merged[0].executedToolCalls).toHaveLength(2)
    expect(merged[1].content).toBe('Final answer')
  })

  it('condenses contiguous repeated tool calls into a counted badge', () => {
    const calls = [
      buildToolCall('1', 'update_artifact'),
      buildToolCall('2', 'update_artifact'),
      buildToolCall('3', 'update_artifact'),
      buildToolCall('4', 'return_to_user'),
    ]
    const condensed = condenseToolCalls(calls)

    expect(condensed).toEqual([
      {
        key: '1',
        label: 'Updated artifact',
        count: 3,
        success: true,
        error: undefined,
        calls: [calls[0], calls[1], calls[2]],
      },
      {
        key: '4',
        label: 'Returned to user',
        count: 1,
        success: true,
        error: undefined,
        calls: [calls[3]],
      },
    ])
  })
})
