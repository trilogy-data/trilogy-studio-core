import { describe, it, expect } from 'vitest'
import { OpenAIProvider, parseOpenAIModelVersion, compareOpenAIModels } from './openai'
import { AnthropicProvider, parseAnthropicModelVersion, compareAnthropicModels } from './anthropic'
import { GoogleProvider, parseGoogleModelVersion, compareGoogleModels } from './googlev2'
import {
  OpenRouterProvider,
  parseOpenRouterModelId,
  getModelTier,
  extractModelVersion,
  compareOpenRouterModels,
} from './openrouter'

/**
 * Tests for model filtering and default selection logic across all providers.
 */

describe('OpenAI Model Filtering', () => {
  describe('parseOpenAIModelVersion', () => {
    it('should parse gpt-5.2 correctly', () => {
      const result = parseOpenAIModelVersion('gpt-5.2')
      expect(result).toEqual({ major: 5, minor: 2, variant: null })
    })

    it('should parse gpt-5.3 correctly', () => {
      const result = parseOpenAIModelVersion('gpt-5.3')
      expect(result).toEqual({ major: 5, minor: 3, variant: null })
    })

    it('should parse gpt-5.2-mini correctly', () => {
      const result = parseOpenAIModelVersion('gpt-5.2-mini')
      expect(result).toEqual({ major: 5, minor: 2, variant: 'mini' })
    })

    it('should parse gpt-4o correctly', () => {
      const result = parseOpenAIModelVersion('gpt-4o')
      expect(result).toEqual({ major: 4, minor: null, variant: 'o' })
    })

    it('should parse gpt-4o-mini correctly', () => {
      const result = parseOpenAIModelVersion('gpt-4o-mini')
      expect(result).toEqual({ major: 4, minor: null, variant: 'o-mini' })
    })

    it('should parse future gpt-6.0 correctly', () => {
      const result = parseOpenAIModelVersion('gpt-6.0')
      expect(result).toEqual({ major: 6, minor: 0, variant: null })
    })

    it('should return null for non-gpt models', () => {
      expect(parseOpenAIModelVersion('davinci-002')).toBeNull()
      expect(parseOpenAIModelVersion('text-embedding-3-large')).toBeNull()
    })
  })

  describe('compareOpenAIModels', () => {
    it('should sort higher major versions first', () => {
      const result = compareOpenAIModels('gpt-4.0', 'gpt-5.0')
      expect(result).toBeGreaterThan(0) // gpt-5.0 should come first
    })

    it('should sort higher minor versions first', () => {
      const result = compareOpenAIModels('gpt-5.1', 'gpt-5.2')
      expect(result).toBeGreaterThan(0) // gpt-5.2 should come first
    })

    it('should prefer non-variant models over variants', () => {
      const result = compareOpenAIModels('gpt-5.2-mini', 'gpt-5.2')
      expect(result).toBeGreaterThan(0) // gpt-5.2 should come first
    })
  })

  describe('OpenAIProvider.filterModels', () => {
    it('should filter to only gpt-5.x+ models', () => {
      const models = [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-5.1',
        'gpt-5.2',
        'gpt-5.2-mini',
        'davinci-002',
        'text-embedding-3-large',
      ]
      const filtered = OpenAIProvider.filterModels(models)

      expect(filtered).toContain('gpt-5.1')
      expect(filtered).toContain('gpt-5.2')
      expect(filtered).toContain('gpt-5.2-mini')
      expect(filtered).not.toContain('gpt-4o')
      expect(filtered).not.toContain('gpt-4o-mini')
      expect(filtered).not.toContain('davinci-002')
      expect(filtered).not.toContain('text-embedding-3-large')
    })

    it('should include gpt-5.3 and future models automatically', () => {
      const models = ['gpt-5.2', 'gpt-5.3', 'gpt-5.3-mini', 'gpt-6.0', 'gpt-4o']
      const filtered = OpenAIProvider.filterModels(models)

      expect(filtered).toContain('gpt-5.3')
      expect(filtered).toContain('gpt-5.3-mini')
      expect(filtered).toContain('gpt-6.0')
      expect(filtered).not.toContain('gpt-4o')
    })

    it('should sort filtered models by version (descending)', () => {
      const models = ['gpt-5.1', 'gpt-5.2-mini', 'gpt-5.2', 'gpt-5.0']
      const filtered = OpenAIProvider.filterModels(models)

      // gpt-5.2 should come before gpt-5.2-mini, both before gpt-5.1
      expect(filtered[0]).toBe('gpt-5.2')
      expect(filtered[1]).toBe('gpt-5.2-mini')
      expect(filtered[2]).toBe('gpt-5.1')
      expect(filtered[3]).toBe('gpt-5.0')
    })
  })

  describe('OpenAIProvider.getDefaultModel', () => {
    it('should return the latest non-mini model', () => {
      const models = ['gpt-5.2', 'gpt-5.2-mini', 'gpt-5.1', 'gpt-5.1-mini']
      const defaultModel = OpenAIProvider.getDefaultModel(models)
      expect(defaultModel).toBe('gpt-5.2')
    })

    it('should skip mini variants and select non-variant', () => {
      const models = ['gpt-5.2-mini', 'gpt-5.1-mini', 'gpt-5.1']
      const defaultModel = OpenAIProvider.getDefaultModel(models)
      expect(defaultModel).toBe('gpt-5.1')
    })

    it('should fall back to first model if all are variants', () => {
      const models = ['gpt-5.2-mini', 'gpt-5.1-mini']
      const defaultModel = OpenAIProvider.getDefaultModel(models)
      expect(defaultModel).toBe('gpt-5.2-mini')
    })

    it('should return empty string for empty array', () => {
      const defaultModel = OpenAIProvider.getDefaultModel([])
      expect(defaultModel).toBe('')
    })
  })
})

describe('Anthropic Model Filtering', () => {
  describe('parseAnthropicModelVersion', () => {
    it('should parse old format claude-3-opus-20240229 correctly', () => {
      const result = parseAnthropicModelVersion('claude-3-opus-20240229')
      expect(result).toEqual({ version: '3', tier: 'opus', date: '20240229' })
    })

    it('should parse old format claude-3-5-sonnet-20240620 correctly', () => {
      const result = parseAnthropicModelVersion('claude-3-5-sonnet-20240620')
      expect(result).toEqual({ version: '3-5', tier: 'sonnet', date: '20240620' })
    })

    it('should parse new format claude-sonnet-4-20250514 correctly', () => {
      const result = parseAnthropicModelVersion('claude-sonnet-4-20250514')
      expect(result).toEqual({ version: '4', tier: 'sonnet', date: '20250514' })
    })

    it('should parse new format claude-opus-4-20250514 correctly', () => {
      const result = parseAnthropicModelVersion('claude-opus-4-20250514')
      expect(result).toEqual({ version: '4', tier: 'opus', date: '20250514' })
    })

    it('should parse claude-opus-4-6-20260514 (opus 4.6) correctly', () => {
      const result = parseAnthropicModelVersion('claude-opus-4-6-20260514')
      expect(result).toEqual({ version: '4-6', tier: 'opus', date: '20260514' })
    })

    it('should parse future claude-sonnet-5-20270101 correctly', () => {
      const result = parseAnthropicModelVersion('claude-sonnet-5-20270101')
      expect(result).toEqual({ version: '5', tier: 'sonnet', date: '20270101' })
    })

    it('should return null for non-claude models', () => {
      expect(parseAnthropicModelVersion('gpt-4o')).toBeNull()
      expect(parseAnthropicModelVersion('some-random-model')).toBeNull()
    })
  })

  describe('compareAnthropicModels', () => {
    it('should sort higher versions first', () => {
      const result = compareAnthropicModels('claude-3-opus-20240229', 'claude-opus-4-20250514')
      expect(result).toBeGreaterThan(0) // claude-opus-4 should come first
    })

    it('should prefer opus over sonnet at same version', () => {
      const result = compareAnthropicModels('claude-sonnet-4-20250514', 'claude-opus-4-20250514')
      expect(result).toBeGreaterThan(0) // opus should come first
    })

    it('should prefer sonnet over haiku at same version', () => {
      const result = compareAnthropicModels('claude-haiku-4-20250514', 'claude-sonnet-4-20250514')
      expect(result).toBeGreaterThan(0) // sonnet should come first
    })

    it('should prefer newer date for same version and tier', () => {
      const result = compareAnthropicModels('claude-3-opus-20240101', 'claude-3-opus-20240229')
      expect(result).toBeGreaterThan(0) // 20240229 should come first
    })
  })

  describe('AnthropicProvider.filterModels', () => {
    it('should filter to only recognized Claude models', () => {
      const models = [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-opus-4-20250514',
        'some-other-model',
        'text-embedding',
      ]
      const filtered = AnthropicProvider.filterModels(models)

      expect(filtered).toContain('claude-3-opus-20240229')
      expect(filtered).toContain('claude-3-sonnet-20240229')
      expect(filtered).toContain('claude-opus-4-20250514')
      expect(filtered).not.toContain('some-other-model')
      expect(filtered).not.toContain('text-embedding')
    })

    it('should include opus 4.6 and sort it above opus 4', () => {
      const models = [
        'claude-opus-4-20250514',
        'claude-opus-4-6-20260514',
        'claude-sonnet-4-20250514',
      ]
      const filtered = AnthropicProvider.filterModels(models)

      expect(filtered).toContain('claude-opus-4-6-20260514')
      // Opus 4.6 should sort before opus 4
      expect(filtered[0]).toBe('claude-opus-4-6-20260514')
      expect(filtered[1]).toBe('claude-opus-4-20250514')
    })

    it('should sort filtered models correctly', () => {
      const models = [
        'claude-3-sonnet-20240229',
        'claude-3-opus-20240229',
        'claude-opus-4-20250514',
        'claude-sonnet-4-20250514',
      ]
      const filtered = AnthropicProvider.filterModels(models)

      // Version 4 opus should be first, then version 4 sonnet, then version 3
      expect(filtered[0]).toBe('claude-opus-4-20250514')
      expect(filtered[1]).toBe('claude-sonnet-4-20250514')
    })
  })

  describe('AnthropicProvider.getDefaultModel', () => {
    it('should return the latest opus model', () => {
      const models = [
        'claude-opus-4-20250514',
        'claude-sonnet-4-20250514',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
      ]
      const defaultModel = AnthropicProvider.getDefaultModel(models)
      expect(defaultModel).toBe('claude-opus-4-20250514')
    })

    it('should return opus 4.6 as default when available', () => {
      const models = [
        'claude-opus-4-6-20260514',
        'claude-opus-4-20250514',
        'claude-sonnet-4-20250514',
      ]
      const defaultModel = AnthropicProvider.getDefaultModel(models)
      expect(defaultModel).toBe('claude-opus-4-6-20260514')
    })

    it('should fall back to first model if no opus found', () => {
      const models = [
        'claude-sonnet-4-20250514',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ]
      const defaultModel = AnthropicProvider.getDefaultModel(models)
      expect(defaultModel).toBe('claude-sonnet-4-20250514')
    })

    it('should return empty string for empty array', () => {
      const defaultModel = AnthropicProvider.getDefaultModel([])
      expect(defaultModel).toBe('')
    })
  })
})

describe('Google Model Filtering', () => {
  describe('parseGoogleModelVersion', () => {
    it('should parse models/gemini-2.5-flash correctly', () => {
      const result = parseGoogleModelVersion('models/gemini-2.5-flash')
      expect(result).toEqual({ major: 2, minor: 5, variant: 'flash' })
    })

    it('should parse gemini-2.0-pro correctly (without models/ prefix)', () => {
      const result = parseGoogleModelVersion('gemini-2.0-pro')
      expect(result).toEqual({ major: 2, minor: 0, variant: 'pro' })
    })

    it('should parse models/gemini-1.5-pro-latest correctly', () => {
      const result = parseGoogleModelVersion('models/gemini-1.5-pro-latest')
      expect(result).toEqual({ major: 1, minor: 5, variant: 'pro-latest' })
    })

    it('should return null for non-gemini models', () => {
      expect(parseGoogleModelVersion('models/text-bison-001')).toBeNull()
      expect(parseGoogleModelVersion('palm-2')).toBeNull()
    })
  })

  describe('compareGoogleModels', () => {
    it('should sort higher major versions first', () => {
      const result = compareGoogleModels('models/gemini-1.5-pro', 'models/gemini-2.0-pro')
      expect(result).toBeGreaterThan(0) // gemini-2.0 should come first
    })

    it('should sort higher minor versions first', () => {
      const result = compareGoogleModels('models/gemini-2.0-pro', 'models/gemini-2.5-pro')
      expect(result).toBeGreaterThan(0) // gemini-2.5 should come first
    })

    it('should prefer pro over flash at same version', () => {
      const result = compareGoogleModels('models/gemini-2.5-flash', 'models/gemini-2.5-pro')
      expect(result).toBeGreaterThan(0) // pro should come first
    })
  })

  describe('GoogleProvider.filterModels', () => {
    it('should filter to only recognized Gemini models', () => {
      const models = [
        'models/gemini-2.5-flash',
        'models/gemini-2.5-pro',
        'models/gemini-1.5-pro',
        'models/text-bison-001',
        'models/embedding-001',
      ]
      const filtered = GoogleProvider.filterModels(models)

      expect(filtered).toContain('models/gemini-2.5-flash')
      expect(filtered).toContain('models/gemini-2.5-pro')
      expect(filtered).toContain('models/gemini-1.5-pro')
      expect(filtered).not.toContain('models/text-bison-001')
      expect(filtered).not.toContain('models/embedding-001')
    })

    it('should sort filtered models correctly', () => {
      const models = [
        'models/gemini-1.5-pro',
        'models/gemini-2.5-flash',
        'models/gemini-2.5-pro',
        'models/gemini-2.0-flash',
      ]
      const filtered = GoogleProvider.filterModels(models)

      // 2.5-pro should be first, then 2.5-flash, then 2.0, then 1.5
      expect(filtered[0]).toBe('models/gemini-2.5-pro')
      expect(filtered[1]).toBe('models/gemini-2.5-flash')
    })
  })

  describe('GoogleProvider.getDefaultModel', () => {
    it('should return the latest model (preferring pro)', () => {
      const models = [
        'models/gemini-2.5-pro',
        'models/gemini-2.5-flash',
        'models/gemini-2.0-pro',
        'models/gemini-1.5-pro',
      ]
      const defaultModel = GoogleProvider.getDefaultModel(models)
      expect(defaultModel).toBe('models/gemini-2.5-pro')
    })

    it('should return flash if no pro available at highest version', () => {
      const models = ['models/gemini-2.5-flash', 'models/gemini-2.0-pro', 'models/gemini-1.5-pro']
      const defaultModel = GoogleProvider.getDefaultModel(models)
      expect(defaultModel).toBe('models/gemini-2.5-flash')
    })

    it('should return empty string for empty array', () => {
      const defaultModel = GoogleProvider.getDefaultModel([])
      expect(defaultModel).toBe('')
    })
  })
})

describe('OpenRouter Model Filtering', () => {
  describe('parseOpenRouterModelId', () => {
    it('should parse anthropic/claude-3-opus correctly', () => {
      const result = parseOpenRouterModelId('anthropic/claude-3-opus')
      expect(result).toEqual({ provider: 'anthropic', modelName: 'claude-3-opus' })
    })

    it('should parse openai/gpt-4o correctly', () => {
      const result = parseOpenRouterModelId('openai/gpt-4o')
      expect(result).toEqual({ provider: 'openai', modelName: 'gpt-4o' })
    })

    it('should parse meta-llama/llama-3.1-405b-instruct correctly', () => {
      const result = parseOpenRouterModelId('meta-llama/llama-3.1-405b-instruct')
      expect(result).toEqual({ provider: 'meta-llama', modelName: 'llama-3.1-405b-instruct' })
    })

    it('should handle models without provider prefix', () => {
      const result = parseOpenRouterModelId('some-model')
      expect(result).toEqual({ provider: '', modelName: 'some-model' })
    })
  })

  describe('getModelTier', () => {
    it('should identify flagship models', () => {
      expect(getModelTier('anthropic/claude-opus-4')).toBe('flagship')
      expect(getModelTier('openai/gpt-5')).toBe('flagship')
      expect(getModelTier('openai/gpt-5.3')).toBe('flagship')
      expect(getModelTier('openai/gpt-6')).toBe('flagship')
      expect(getModelTier('openai/gpt-7.0')).toBe('flagship')
      expect(getModelTier('mistral/mistral-large')).toBe('flagship')
      expect(getModelTier('google/gemini-ultra')).toBe('flagship')
    })

    it('should identify standard models', () => {
      expect(getModelTier('anthropic/claude-sonnet-4')).toBe('standard')
      expect(getModelTier('openai/gpt-4o')).toBe('standard')
      expect(getModelTier('mistral/mistral-medium')).toBe('standard')
      expect(getModelTier('google/gemini-pro')).toBe('standard')
    })

    it('should identify mini/fast models', () => {
      expect(getModelTier('anthropic/claude-haiku-4')).toBe('mini')
      expect(getModelTier('openai/gpt-4o-mini')).toBe('mini')
      expect(getModelTier('google/gemini-flash')).toBe('mini')
      expect(getModelTier('mistral/mistral-small')).toBe('mini')
    })
  })

  describe('extractModelVersion', () => {
    it('should extract version from claude models', () => {
      expect(extractModelVersion('anthropic/claude-3-opus')).toEqual({
        major: 3,
        minor: 0,
        patch: 0,
      })
      expect(extractModelVersion('anthropic/claude-3.5-sonnet')).toEqual({
        major: 3,
        minor: 5,
        patch: 0,
      })
    })

    it('should extract version from gpt models', () => {
      expect(extractModelVersion('openai/gpt-4o')).toEqual({ major: 4, minor: 0, patch: 0 })
      expect(extractModelVersion('openai/gpt-4-turbo')).toEqual({ major: 4, minor: 0, patch: 0 })
    })

    it('should extract version from llama models', () => {
      expect(extractModelVersion('meta-llama/llama-3.1-70b')).toEqual({
        major: 3,
        minor: 1,
        patch: 0,
      })
    })
  })

  describe('compareOpenRouterModels', () => {
    it('should sort by provider priority', () => {
      const result = compareOpenRouterModels('openai/gpt-4o', 'anthropic/claude-3-opus')
      expect(result).toBeGreaterThan(0) // anthropic should come first
    })

    it('should sort by model tier within same provider', () => {
      const result = compareOpenRouterModels('anthropic/claude-sonnet-4', 'anthropic/claude-opus-4')
      expect(result).toBeGreaterThan(0) // opus should come first
    })

    it('should sort by version within same tier', () => {
      const result = compareOpenRouterModels(
        'anthropic/claude-3-sonnet',
        'anthropic/claude-4-sonnet',
      )
      expect(result).toBeGreaterThan(0) // version 4 should come first
    })
  })

  describe('OpenRouterProvider.filterModels', () => {
    it('should filter to only modern models', () => {
      const models = [
        'anthropic/claude-3-opus',
        'anthropic/claude-3-sonnet',
        'openai/gpt-4o',
        'openai/gpt-4o-mini',
        'meta-llama/llama-3.1-70b',
        'some-unknown/random-model',
        'old-provider/legacy-model',
      ]
      const filtered = OpenRouterProvider.filterModels(models)

      expect(filtered).toContain('anthropic/claude-3-opus')
      expect(filtered).toContain('anthropic/claude-3-sonnet')
      expect(filtered).toContain('openai/gpt-4o')
      expect(filtered).toContain('openai/gpt-4o-mini')
      expect(filtered).toContain('meta-llama/llama-3.1-70b')
      expect(filtered).not.toContain('some-unknown/random-model')
      expect(filtered).not.toContain('old-provider/legacy-model')
    })

    it('should include various modern providers', () => {
      const models = [
        'anthropic/claude-opus-4',
        'openai/gpt-5',
        'google/gemini-2.0-flash',
        'mistralai/mistral-large',
        'deepseek/deepseek-chat',
        'qwen/qwen-2-72b',
        'cohere/command-r-plus',
        'x-ai/grok-2',
      ]
      const filtered = OpenRouterProvider.filterModels(models)

      expect(filtered.length).toBe(8) // All should be included
    })

    it('should automatically include next-generation models', () => {
      const futureModels = [
        'anthropic/claude-opus-4-6',
        'anthropic/claude-5-sonnet',
        'openai/gpt-5.3',
        'openai/gpt-6',
        'google/gemini-3.0-pro',
        'google/gemini-4.0-flash',
        'meta-llama/llama-5-70b',
      ]
      const filtered = OpenRouterProvider.filterModels(futureModels)

      expect(filtered).toContain('anthropic/claude-opus-4-6')
      expect(filtered).toContain('anthropic/claude-5-sonnet')
      expect(filtered).toContain('openai/gpt-5.3')
      expect(filtered).toContain('openai/gpt-6')
      expect(filtered).toContain('google/gemini-3.0-pro')
      expect(filtered).toContain('google/gemini-4.0-flash')
      expect(filtered).toContain('meta-llama/llama-5-70b')
    })

    it('should sort filtered models correctly', () => {
      const models = [
        'openai/gpt-4o',
        'anthropic/claude-sonnet-4',
        'anthropic/claude-opus-4',
        'google/gemini-2.0-flash',
      ]
      const filtered = OpenRouterProvider.filterModels(models)

      // Anthropic opus should be first, then sonnet, then OpenAI, then Google
      expect(filtered[0]).toBe('anthropic/claude-opus-4')
      expect(filtered[1]).toBe('anthropic/claude-sonnet-4')
    })
  })

  describe('OpenRouterProvider.getDefaultModel', () => {
    it('should prefer claude-sonnet-4 as default', () => {
      const models = [
        'anthropic/claude-opus-4',
        'anthropic/claude-sonnet-4',
        'openai/gpt-4o',
        'google/gemini-2.0-flash',
      ]
      const defaultModel = OpenRouterProvider.getDefaultModel(models)
      expect(defaultModel).toBe('anthropic/claude-sonnet-4')
    })

    it('should fall back to gpt-4o if no claude-sonnet', () => {
      const models = ['openai/gpt-4o', 'openai/gpt-4o-mini', 'google/gemini-2.0-flash']
      const defaultModel = OpenRouterProvider.getDefaultModel(models)
      expect(defaultModel).toBe('openai/gpt-4o')
    })

    it('should return first model if no preferred defaults', () => {
      const models = ['meta-llama/llama-3.1-70b', 'mistralai/mistral-large']
      const defaultModel = OpenRouterProvider.getDefaultModel(models)
      expect(defaultModel).toBe('meta-llama/llama-3.1-70b')
    })

    it('should return empty string for empty array', () => {
      const defaultModel = OpenRouterProvider.getDefaultModel([])
      expect(defaultModel).toBe('')
    })
  })
})
