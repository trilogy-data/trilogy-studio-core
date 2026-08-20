import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ChatMessage } from '../../chats/chat'
import { SYSTEM_INPUT_START, SYSTEM_INPUT_END } from '../../llm/toolLoopCore'
import LLMChat from './LLMChat.vue'

const summaryMessage = (summary: string): ChatMessage => ({
  role: 'user',
  hidden: true,
  compaction: true,
  content: `${SYSTEM_INPUT_START}[Conversation compacted. Summary of the earlier conversation:]\n\n${summary}${SYSTEM_INPUT_END}`,
})

/** A compacted conversation: two archived turns, the summary marker, then live
 *  history — the shape `compactChat` leaves behind. */
const compactedMessages = (summary = '## Goal\nShip the report.'): ChatMessage[] => [
  { role: 'user', content: 'old question', archived: true },
  { role: 'assistant', content: 'old answer', archived: true },
  summaryMessage(summary),
  { role: 'user', content: 'new question' },
  { role: 'assistant', content: 'new answer' },
]

const mountChat = (messages: ChatMessage[]) =>
  mount(LLMChat, {
    props: { messages, showHeader: false, sendHandler: async () => {} },
  })

describe('LLMChat compaction divider', () => {
  it('renders a divider where the conversation was compacted', () => {
    const wrapper = mountChat(compactedMessages())

    const divider = wrapper.find('[data-testid^="compaction-divider-"]')
    expect(divider.exists()).toBe(true)
    // The count comes from the archived run preceding the marker.
    expect(divider.text()).toContain('2 earlier messages summarized')
    wrapper.unmount()
  })

  it('keeps archived messages readable but marks them out of context', () => {
    const wrapper = mountChat(compactedMessages())

    const archived = wrapper.findAll('.message.archived')
    expect(archived).toHaveLength(2)
    expect(archived[0].text()).toContain('old question')
    expect(archived[0].attributes('title')).toContain("no longer in the agent's context")

    // Live messages carry no such marking.
    expect(wrapper.findAll('.message').length).toBe(4)
    wrapper.unmount()
  })

  it('reveals the summary the agent actually sees, without the wrapper tags', async () => {
    const wrapper = mountChat(compactedMessages())

    expect(wrapper.find('[data-testid^="compaction-summary-"]').exists()).toBe(false)

    await wrapper.find('[data-testid^="compaction-toggle-"]').trigger('click')

    const summary = wrapper.find('[data-testid^="compaction-summary-"]')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('Ship the report.')
    // Neither the machine preamble nor the prompt wrapper leaks into the UI.
    expect(summary.text()).not.toContain('system_input')
    expect(summary.text()).not.toContain('Conversation compacted.')

    await wrapper.find('[data-testid^="compaction-toggle-"]').trigger('click')
    expect(wrapper.find('[data-testid^="compaction-summary-"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('counts each compaction separately when a chat is compacted twice', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'first', archived: true },
      { role: 'assistant', content: 'first answer', archived: true },
      { ...summaryMessage('first summary'), archived: true },
      { role: 'user', content: 'second', archived: true },
      summaryMessage('second summary'),
      { role: 'user', content: 'live' },
    ]
    const wrapper = mountChat(messages)

    const dividers = wrapper.findAll('[data-testid^="compaction-divider-"]')
    expect(dividers).toHaveLength(2)
    expect(dividers[0].text()).toContain('2 earlier messages summarized')
    // The archived first summary counts toward the second compaction's run.
    expect(dividers[1].text()).toContain('1 earlier message summarized')
    wrapper.unmount()
  })

  it('leaves ordinary conversations untouched', () => {
    const wrapper = mountChat([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: '', hidden: true, toolResults: [] },
    ])

    expect(wrapper.find('[data-testid^="compaction-divider-"]').exists()).toBe(false)
    expect(wrapper.findAll('.message')).toHaveLength(2) // hidden tool-result message stays hidden
    wrapper.unmount()
  })
})
