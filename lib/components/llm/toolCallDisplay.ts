import type { ChatMessage, ChatToolCall } from '../../chats/chat'

export interface CondensedToolCallDisplay {
  key: string
  label: string
  count: number
  success: boolean
  error?: string
  /** The underlying tool calls grouped into this pill (preserved for inspection UI). */
  calls: ChatToolCall[]
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  validate_query: 'Validated query',
  run_query: 'Ran query',
  run_active_editor_query: 'Ran editor query',
  format_query: 'Formatted query',
  edit_chart_config: 'Updated chart',
  edit_editor: 'Updated editor',
  request_close: 'Requested close',
  close_session: 'Closed session',
  connect_data_connection: 'Connected',
  run_trilogy_query: 'Ran query',
  chart_trilogy_query: 'Ran chart query',
  add_import: 'Added import',
  remove_import: 'Removed import',
  select_active_import: 'Selected active import',
  list_available_imports: 'Listed imports',
  create_markdown: 'Created markdown',
  list_artifacts: 'Listed artifacts',
  get_artifact: 'Got artifact',
  get_artifact_rows: 'Got artifact rows',
  update_artifact: 'Updated artifact',
  remove_artifact: 'Removed artifact',
  hide_artifact: 'Hidden artifact',
  reorder_artifacts: 'Reordered artifacts',
  return_to_user: 'Returned to user',
  set_dashboard_title: 'Set dashboard title',
  capture_dashboard_screenshot: 'Captured dashboard screenshot',
  add_dashboard_item: 'Added dashboard item',
  update_dashboard_item: 'Updated dashboard item',
  remove_dashboard_item: 'Removed dashboard item',
  move_dashboard_item: 'Moved dashboard item',
  list_dashboard_items: 'Listed dashboard items',
  get_dashboard_item: 'Got dashboard item',
  get_dashboard_info: 'Got dashboard info',
  update_dashboard_info: 'Updated dashboard info',
}

export function getToolDisplayName(toolName: string): string {
  const label = TOOL_DISPLAY_NAMES[toolName]
  if (label) return label

  const normalized = toolName.replace(/_/g, ' ').trim()
  if (!normalized) return ''

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function isToolOnlyAssistantMessage(message: ChatMessage): boolean {
  return (
    message.role === 'assistant' &&
    !!message.executedToolCalls?.length &&
    !message.content?.trim() &&
    !message.artifact
  )
}

export function mergeContiguousToolCallMessages(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = []

  for (const message of messages) {
    if (!isToolOnlyAssistantMessage(message)) {
      merged.push(message)
      continue
    }

    const lastMessage = merged[merged.length - 1]
    if (lastMessage && isToolOnlyAssistantMessage(lastMessage)) {
      lastMessage.executedToolCalls = [
        ...(lastMessage.executedToolCalls || []),
        ...(message.executedToolCalls || []),
      ]
      lastMessage.toolCalls = [...(lastMessage.toolCalls || []), ...(message.toolCalls || [])]
      continue
    }

    merged.push({
      ...message,
      executedToolCalls: [...(message.executedToolCalls || [])],
      toolCalls: [...(message.toolCalls || [])],
    })
  }

  return merged
}

export function condenseToolCalls(toolCalls: ChatToolCall[]): CondensedToolCallDisplay[] {
  const condensed: CondensedToolCallDisplay[] = []

  for (const toolCall of toolCalls) {
    const label = getToolDisplayName(toolCall.name)
    const success = !!toolCall.result?.success
    const error = toolCall.result?.error
    const previous = condensed[condensed.length - 1]

    if (
      previous &&
      previous.label === label &&
      previous.success === success &&
      previous.error === error
    ) {
      previous.count += 1
      previous.calls.push(toolCall)
      continue
    }

    condensed.push({
      key: toolCall.id,
      label,
      count: 1,
      success,
      error,
      calls: [toolCall],
    })
  }

  return condensed
}
