import { describe, expect, it } from 'vitest'
import { ModelConfig, ModelSource } from './model'

describe('ModelSource', () => {
  it('normalizes file extensions from source aliases', () => {
    expect(new ModelSource('editor-1', 'basic.preql', [], []).alias).toBe('basic')
    expect(new ModelSource('editor-2', 'nested/script.sql', [], []).alias).toBe('nested/script')
    expect(new ModelSource('editor-3', 'nested/loader.py', [], []).alias).toBe('nested/loader')
  })
})

describe('ModelConfig', () => {
  it('stores newly added source aliases without file extensions', () => {
    const model = new ModelConfig({
      name: 'test-model',
      storage: 'local',
      description: '',
      sources: [],
    })

    model.addModelSourceSimple('editor-1', 'basic.preql')

    expect(model.sources[0].alias).toBe('basic')
  })

  it('keeps renamed source aliases extensionless', () => {
    const model = new ModelConfig({
      name: 'test-model',
      storage: 'local',
      description: '',
      sources: [new ModelSource('editor-1', 'basic', [], [])],
    })

    model.updateModelSourceName('editor-1', 'nested/basic.preql')

    expect(model.sources[0].alias).toBe('nested/basic')
  })
})
