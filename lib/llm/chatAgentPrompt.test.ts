import { describe, it, expect } from 'vitest'
import { CHAT_TOOLS, buildChatAgentSystemPrompt, filterDisabledTools } from './chatAgentPrompt'

const baseOptions = {
  dataConnectionName: 'duckdb',
  availableConnections: ['duckdb'],
}

describe('filterDisabledTools', () => {
  it('returns the same array when nothing is disabled', () => {
    // The shared registry's toolset identity is part of its cache contract.
    expect(filterDisabledTools(CHAT_TOOLS, undefined)).toBe(CHAT_TOOLS)
    expect(filterDisabledTools(CHAT_TOOLS, [])).toBe(CHAT_TOOLS)
  })

  it('drops only the named tools, in order', () => {
    const names = filterDisabledTools(CHAT_TOOLS, ['reorder_artifacts']).map((t) => t.name)
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

  it('leaves the prompt byte-identical for an empty list', () => {
    expect(buildChatAgentSystemPrompt({ ...baseOptions, disabledTools: [] })).toBe(
      buildChatAgentSystemPrompt(baseOptions),
    )
  })
})
