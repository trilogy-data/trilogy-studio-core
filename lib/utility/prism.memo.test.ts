import { describe, it, expect } from 'vitest'
import { Prism, ensurePrismLanguagesReady } from './prism'

describe('ensurePrismLanguagesReady', () => {
  it('loads languages requested by a later caller', async () => {
    // Mirrors a SQL results pane rendering before any markdown chat message
    // exists. A single memoized "ready" promise would resolve the second call
    // instantly without ever importing python.
    await ensurePrismLanguagesReady(['sql'])
    expect(Prism.languages.sql).toBeTruthy()

    await ensurePrismLanguagesReady(['python'])
    expect(Prism.languages.python).toBeTruthy()
  })

  it('loads implied dependency grammars', async () => {
    await ensurePrismLanguagesReady(['typescript'])
    expect(Prism.languages.typescript).toBeTruthy()
    expect(Prism.languages.javascript).toBeTruthy()
  })

  it('registers the trilogy grammar', async () => {
    await ensurePrismLanguagesReady(['trilogy'])
    expect(Prism.languages.trilogy).toBeTruthy()
    expect(Prism.languages.preql).toBeTruthy()
  })

  it('resolves concurrent requests for different languages', async () => {
    await Promise.all([
      ensurePrismLanguagesReady(['markdown']),
      ensurePrismLanguagesReady(['json']),
      ensurePrismLanguagesReady(['python']),
    ])

    expect(Prism.languages.markdown).toBeTruthy()
    expect(Prism.languages.json).toBeTruthy()
    expect(Prism.languages.python).toBeTruthy()
  })
})
