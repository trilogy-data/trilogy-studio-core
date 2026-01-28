import { describe, it, expect } from 'vitest'
import { OpenAIProvider, parseOpenAIModelVersion, compareOpenAIModels } from './openai'
import { AnthropicProvider, parseAnthropicModelVersion, compareAnthropicModels } from './anthropic'
import { GoogleProvider, parseGoogleModelVersion, compareGoogleModels } from './googlev2'

/**
 * Tests for model filtering and default selection logic across all providers.
 */

describe('OpenAI Model Filtering', () => {
  describe('parseOpenAIModelVersion', () => {
    it('should parse gpt-5.2 correctly', () => {
      const result = parseOpenAIModelVersion('gpt-5.2')
      expect(result).toEqual({ major: 5, minor: 2, variant: null })
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
