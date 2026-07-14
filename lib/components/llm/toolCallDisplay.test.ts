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
        subchatIds: [],
      },
      {
        key: '4',
        label: 'Returned to user',
        count: 1,
        success: true,
        error: undefined,
        calls: [calls[3]],
        subchatIds: [],
      },
    ])
  })

  it('collects distinct subchat ids across condensed dispatch calls', () => {
    const calls: ChatToolCall[] = [
      {
        id: '1',
        name: 'spawn_subchat',
        input: { kind: 'architect' },
        result: { success: true, subchatId: 'chat-a' },
      },
      {
        id: '2',
        name: 'spawn_subchat',
        input: { kind: 'analyst' },
        result: { success: true, subchatId: 'chat-b' },
      },
      {
        id: '3',
        name: 'send_to_subchat',
        input: { subchat_id: 'chat-a' },
        result: { success: true, subchatId: 'chat-a' },
      },
    ]
    const condensed = condenseToolCalls(calls)

    expect(condensed).toHaveLength(2)
    expect(condensed[0].label).toBe('Spawned subagent')
    expect(condensed[0].subchatIds).toEqual(['chat-a', 'chat-b'])
    expect(condensed[1].label).toBe('Messaged subagent')
    expect(condensed[1].subchatIds).toEqual(['chat-a'])
  })
})
