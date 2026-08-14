import { describe, it, expect } from 'vitest'
import { AnthropicProvider } from './anthropic'
import { DemoProvider } from './demo'
import { DEFAULT_COMPACTION_THRESHOLD_TOKENS } from './consts'

describe('per-connection compaction threshold', () => {
  it('defaults to the shared threshold until overridden', () => {
    const provider = new AnthropicProvider('anthropic', 'key', 'claude-opus-5')
    expect(provider.compactionThresholdTokens).toBeNull()
    expect(provider.getCompactionThresholdTokens()).toBe(DEFAULT_COMPACTION_THRESHOLD_TOKENS)
  })

  it('clamps and marks the connection changed so it gets persisted', () => {
    const provider = new AnthropicProvider('anthropic', 'key', 'claude-opus-5')
    provider.changed = false

    provider.setCompactionThresholdTokens(120_000.7)
    expect(provider.compactionThresholdTokens).toBe(120_000)
    expect(provider.getCompactionThresholdTokens()).toBe(120_000)
    expect(provider.changed).toBe(true)

    provider.changed = false
    provider.setCompactionThresholdTokens(120_000)
    expect(provider.changed).toBe(false) // no-op writes don't dirty the connection

    provider.setCompactionThresholdTokens(-5)
    expect(provider.compactionThresholdTokens).toBe(0) // 0 = disabled, never negative

    provider.setCompactionThresholdTokens(null)
    expect(provider.compactionThresholdTokens).toBeNull()
    expect(provider.getCompactionThresholdTokens()).toBe(DEFAULT_COMPACTION_THRESHOLD_TOKENS)
  })

  it('survives a serialization round trip', async () => {
    const provider = new AnthropicProvider('anthropic', 'key', 'claude-opus-5')
    provider.setCompactionThresholdTokens(80_000)

    const restored = await AnthropicProvider.fromJSON(JSON.stringify(provider.toJSON()))
    expect(restored.compactionThresholdTokens).toBe(80_000)
  })

  it('round trips on the demo provider too (separate toJSON/fromJSON)', async () => {
    const provider = new DemoProvider('demo', 'model')
    provider.setCompactionThresholdTokens(0)

    const restored = await DemoProvider.fromJSON(provider.toJSON() as Record<string, any>)
    expect(restored.compactionThresholdTokens).toBe(0)
    expect(restored.getCompactionThresholdTokens()).toBe(0) // disabled, not defaulted
  })

  it('falls back to the default for connections persisted before the setting existed', async () => {
    const legacy = { name: 'anthropic', model: 'claude-opus-5', type: 'anthropic', apiKey: null }
    const restored = await AnthropicProvider.fromJSON(legacy as any)
    expect(restored.compactionThresholdTokens).toBeNull()
    expect(restored.getCompactionThresholdTokens()).toBe(DEFAULT_COMPACTION_THRESHOLD_TOKENS)
  })
})
