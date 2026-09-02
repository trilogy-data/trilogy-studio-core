import { describe, it, expect } from 'vitest'
import {
  CHAT_TOOLS,
  buildChatAgentSystemPrompt,
  filterDisabledTools,
  mergeExtraTools,
  type HostChatTool,
} from './chatAgentPrompt'

const baseOptions = {
  dataConnectionName: 'duckdb',
  availableConnections: ['duckdb'],
}

describe('filterDisabledTools', () => {
  it('returns the same array when nothing is disabled', () => {
    // The shared registry's toolset identity is part of its cache contract.
    const tools = [...CHAT_TOOLS]
    expect(filterDisabledTools(tools, undefined)).toBe(tools)
    expect(filterDisabledTools(tools, [])).toBe(tools)
  })

  it('drops only the named tools, in order', () => {
    const names = filterDisabledTools([...CHAT_TOOLS], ['reorder_artifacts']).map((t) => t.name)
    expect(names).not.toContain('reorder_artifacts')
    expect(names).toEqual(CHAT_TOOLS.map((t) => t.name).filter((n) => n !== 'reorder_artifacts'))
  })
})

describe('buildChatAgentSystemPrompt disabledTools', () => {
  it('keeps every artifact instruction when nothing is disabled', () => {
    const prompt = buildChatAgentSystemPrompt(baseOptions)
    expect(prompt).toContain('4. Reorder artifacts for maximum impact')
    expect(prompt).toContain('5. The artifact panel should tell a coherent story')
    expect(prompt).toContain('- Use hide_artifact to remove stale')
  })

  it('drops the guidance for a disabled tool and renumbers the curation steps', () => {
    const prompt = buildChatAgentSystemPrompt({
      ...baseOptions,
      disabledTools: ['reorder_artifacts'],
    })
    expect(prompt).not.toContain('reorder_artifacts')
    expect(prompt).not.toContain('Reorder artifacts')
    // The step after the dropped one takes its number, so the list stays
    // contiguous and the model is not told to look for a missing step 4.
    expect(prompt).toContain('4. The artifact panel should tell a coherent story')
    const curation = prompt.slice(
      prompt.indexOf('ARTIFACT CURATION'),
      prompt.indexOf('COMPLETING YOUR RESPONSE'),
    )
    expect(curation).not.toContain('5. ')
    // Untouched guidance stays.
    expect(prompt).toContain('1. Call list_artifacts')
    expect(prompt).toContain('- Use hide_artifact to remove stale')
  })

  it('drops every line that asks for a disabled tool, wherever it appears', () => {
    const prompt = buildChatAgentSystemPrompt({
      ...baseOptions,
      disabledTools: ['create_markdown'],
    })
    expect(prompt).not.toContain('create_markdown')
    expect(prompt).not.toContain('template expressions')
    expect(prompt).toContain('1. Call list_artifacts')
  })

  it('drops the whole documentation section when both docs tools are disabled', () => {
    expect(buildChatAgentSystemPrompt(baseOptions)).toContain(
      'DOCUMENTATION:\n- When you are unsure',
    )
    const prompt = buildChatAgentSystemPrompt({
      ...baseOptions,
      disabledTools: ['search_docs', 'read_doc'],
    })
    expect(prompt).not.toContain('DOCUMENTATION:')
    expect(prompt).not.toContain('search_docs')
    expect(prompt).not.toContain('read_doc')
  })

  it('leaves the prompt byte-identical for an empty list', () => {
    expect(buildChatAgentSystemPrompt({ ...baseOptions, disabledTools: [] })).toBe(
      buildChatAgentSystemPrompt(baseOptions),
    )
  })
})

describe('buildChatAgentSystemPrompt connect_data_connection', () => {
  it('tells the model to connect when the tool is available', () => {
    const prompt = buildChatAgentSystemPrompt({ ...baseOptions, isDataConnectionActive: false })
    expect(prompt).toContain('NOT CONNECTED - use connect_data_connection tool')
    expect(prompt).toContain('8. If the data connection is not active, use connect_data_connection')
  })

  it('never names the tool when the host withholds it', () => {
    // A host that opens its own connection disables the tool; a model told to
    // call it anyway goes looking for it (search_docs, retries) rather than
    // reporting the problem.
    const prompt = buildChatAgentSystemPrompt({
      ...baseOptions,
      isDataConnectionActive: false,
      disabledTools: ['connect_data_connection'],
    })
    expect(prompt).not.toContain('connect_data_connection')
    expect(prompt).toContain(
      'NOT CONNECTED - queries will fail; tell the user the data connection is not available and call return_to_user',
    )
    expect(prompt).not.toContain('\n8. ')
  })
})

describe('buildChatAgentSystemPrompt return-control guidance', () => {
  // A model with no exit rule for failure re-runs a broken query with small
  // edits until the loop's iteration cap. The prompt has to say when to stop.
  it('caps query retries and tells the model to return with the error', () => {
    const prompt = buildChatAgentSystemPrompt(baseOptions)
    expect(prompt).toContain('at most twice')
    expect(prompt).toContain(
      'If the third attempt also fails, stop: call return_to_user with the error',
    )
  })

  it('tells the model to return rather than explore when stuck or already done', () => {
    const prompt = buildChatAgentSystemPrompt(baseOptions)
    expect(prompt).toContain('A simple question is one query and a return_to_user')
    expect(prompt).toContain('If you are stuck')
    expect(prompt).toContain('rather than retrying or searching further')
  })
})

describe('mergeExtraTools', () => {
  const hostTool = (name: string): HostChatTool => ({
    definition: {
      name,
      description: `host ${name}`,
      input_schema: { type: 'object', properties: {} },
    },
    execute: async () => ({ success: true, message: 'ok' }),
  })

  it('returns the same array when there is nothing to add', () => {
    const tools = [...CHAT_TOOLS]
    expect(mergeExtraTools(tools, undefined)).toBe(tools)
    expect(mergeExtraTools(tools, [])).toBe(tools)
  })

  it('inserts host tools after the built-ins and ahead of return_to_user', () => {
    const names = mergeExtraTools([...CHAT_TOOLS], [hostTool('show_in_view')]).map((t) => t.name)
    expect(names.at(-1)).toBe('return_to_user')
    expect(names.at(-2)).toBe('show_in_view')
    expect(names.slice(0, -2)).toEqual(
      CHAT_TOOLS.map((t) => t.name).filter((n) => n !== 'return_to_user'),
    )
  })

  it('appends when the toolset has no return_to_user', () => {
    const names = mergeExtraTools([{ name: 'a' }], [hostTool('b')]).map((t) => t.name)
    expect(names).toEqual(['a', 'b'])
  })

  it('refuses a host tool that shadows a built-in or repeats a name', () => {
    expect(() => mergeExtraTools([...CHAT_TOOLS], [hostTool('run_trilogy_query')])).toThrow(
      /shadows/,
    )
    expect(() => mergeExtraTools([...CHAT_TOOLS], [hostTool('x'), hostTool('x')])).toThrow(/twice/)
  })
})
