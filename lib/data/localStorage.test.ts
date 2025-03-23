import { describe, it, expect, beforeEach, vi } from 'vitest'
import LocalStorage from './localStorage'
import Editor from '../editors/editor'
import { ModelConfig, ModelSource } from '../models'
import type { LLMRequestOptions, LLMResponse } from '../llm'
import { LLMProvider } from '../llm'

vi.mock('../connections', () => ({
  BigQueryOauthConnection: {
    fromJSON: vi.fn().mockImplementation((data) => ({ ...data })),
  },
  DuckDBConnection: {
    fromJSON: vi.fn().mockImplementation((data) => ({ ...data })),
  },
  MotherDuckConnection: {
    fromJSON: vi.fn().mockImplementation((data) => ({ ...data })),
  },
}))

class MockLLMProvider extends LLMProvider {
  type: string = 'openai'
  // @ts-ignore
  async generateCompletion(options: LLMRequestOptions): Promise<LLMResponse> {
    return {
      text: 'Mock response',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    }
  }

  async reset() {
    this.connected = true
  }
}

// Mock localStorage globally for the tests
beforeEach(() => {
  const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
      getItem(key: string) {
        return store[key] || null
      },
      setItem(key: string, value: string) {
        store[key] = value
      },
      removeItem(key: string) {
        delete store[key]
      },
      clear() {
        store = {}
      },
    }
  })()
  vi.stubGlobal('localStorage', localStorageMock)
})

describe('EditorLocalStorage', () => {
  let localStorage: LocalStorage

  beforeEach(() => {
    localStorage = new LocalStorage('test')
    // localStorage.clear();
  })

  it('should save and load an editor', async () => {
    const editor: Editor = new Editor({
      name: 'editor1',
      type: 'preql',
      connection: 'test-connection',
      storage: 'abc',
      contents: 'test content',
    })
    expect(editor.name).toBe('editor1')
    await localStorage.saveEditor(editor)
    const loadedEditors = await localStorage.loadEditors()

    expect(loadedEditors).toHaveProperty('editor1')
    expect(loadedEditors['editor1'].contents).toBe('test content')
  })

  it('should save and clear editors', async () => {
    const editors: Editor[] = [
      new Editor({
        name: 'editor1',
        type: 'preql',
        connection: 'test-connection',
        storage: 'abc',
        contents: 'content1',
      }),
      new Editor({
        name: 'editor2',
        type: 'preql',
        connection: 'test-connection',
        storage: 'abc',
        contents: 'content2',
      }),
    ]

    await localStorage.saveEditors(editors)
    let storedEditors = await localStorage.loadEditors()

    expect(Object.keys(storedEditors)).toHaveLength(2)

    await localStorage.clearEditors()
    storedEditors = await localStorage.loadEditors()

    expect(Object.keys(storedEditors)).toHaveLength(0)

    editors[0].setContent('content3')
    await localStorage.saveEditors([
      new Editor({
        name: 'editor3',
        type: 'preql',
        connection: 'test-connection',
        storage: 'abc',
        contents: 'content4',
      }),
    ])
    await localStorage.saveEditors(editors)
    storedEditors = await localStorage.loadEditors()
    expect(storedEditors['editor1'].contents).toBe('content3')
    expect(storedEditors['editor3'].contents).toBe('content4')
  })

  it('should delete an editor by name', () => {
    const editor: Editor = new Editor({
      name: 'editor1',
      type: 'preql',
      connection: 'test-connection',
      storage: 'local',
      contents: 'test content',
    })

    localStorage.saveEditor(editor)
    localStorage.deleteEditor('editor1')
    const loadedEditors = localStorage.loadEditors()

    expect(loadedEditors).not.toHaveProperty('editor1')
  })

  it('should check if an editor exists', async () => {
    const editor: Editor = new Editor({
      name: 'editor1',
      type: 'preql',
      connection: 'test-connection',
      storage: 'local',
      contents: 'test content',
    })

    await localStorage.saveEditor(editor)

    expect(await localStorage.hasEditor('editor1')).toBe(true)
    expect(await localStorage.hasEditor('editor2')).toBe(false)
  })

  it('should save and load connections', () => {
    const connections = {
      conn1: { type: 'bigquery-oauth', name: 'conn1', storage: 'local' },
      conn2: { type: 'duckdb', name: 'conn2', storage: 'local' },
    }

    // @ts-ignore
    localStorage.saveConnections(Object.values(connections))
    localStorage.loadConnections().then((loadedConnections) => {
      expect(Object.keys(loadedConnections)).toHaveLength(2)
      expect(loadedConnections['conn1'].name).toBe('conn1')
      expect(loadedConnections['conn2'].name).toBe('conn2')
    })
  })

  it('should delete a connection by name', () => {
    const connections = {
      conn1: { type: 'bigquery-oauth', name: 'conn1' },
      conn2: { type: 'duckdb', name: 'conn2' },
    }
    // @ts-ignore
    localStorage.saveConnections(Object.values(connections))
    localStorage.deleteConnection('conn1').then(() => {
      localStorage.loadConnections().then((loadedConnections) => {
        expect(Object.keys(loadedConnections)).toHaveLength(1)
        expect(loadedConnections['conn2'].name).toBe('conn2')
      })
    })
  })

  it('should save and load model configs', async () => {
    let c1 = new ModelConfig({
      name: 'config1',
      storage: 'local',
      description: '',
      sources: [
        ModelSource.fromJSON({ editor: 'source1', alias: 'alias1', concepts: [], datasources: [] }),
      ],
    })
    let c2 = new ModelConfig({
      name: 'config2',
      storage: 'local',
      description: '',
      sources: [
        ModelSource.fromJSON({ editor: 'source2', alias: 'alias2', concepts: [], datasources: [] }),
      ],
    })
    const modelConfigList = {
      config1: c1,
      config2: c2,
    }

    await localStorage.saveModelConfig(Object.values(modelConfigList))
    let loadedModelConfig = await localStorage.loadModelConfig()

    expect(Object.keys(loadedModelConfig)).toHaveLength(2)
    expect(loadedModelConfig['config1'].name).toBe('config1')
    expect(loadedModelConfig['config2'].name).toBe('config2')
  })

  it('should clear model configs', async () => {
    const modelConfig = [
      new ModelConfig({ name: 'config1', storage: 'local', description: '', sources: [] }),
    ]

    await localStorage.saveModelConfig(modelConfig)
    await localStorage.clearModelConfig()

    localStorage.loadModelConfig().then((loadedModelConfig) => {
      expect(Object.keys(loadedModelConfig)).toHaveLength(0)
    })
  })

  it('should save and load LLM connections', async () => {
    const connections = {
      conn1: new MockLLMProvider('conn1', 'mock-api-key', 'gpt-4'),
      conn2: new MockLLMProvider('conn2', 'mock-api-key', 'claude-2'),
    }

    localStorage.saveLLMConnections(Object.values(connections))
    localStorage.loadLLMConnections().then((loadedConnections) => {
      expect(Object.keys(loadedConnections)).toHaveLength(2)
      expect(loadedConnections['conn1'].name).toBe('conn1')
      expect(loadedConnections['conn1'].model).toBe('gpt-4')
      expect(loadedConnections['conn2'].name).toBe('conn2')
      expect(loadedConnections['conn2'].model).toBe('claude-2')
    })
  })

  it('should delete an LLM connection by name', () => {
    const connections = {
      conn1: new MockLLMProvider('conn1', 'mock-api-key', 'gpt-4'),
      conn2: new MockLLMProvider('conn2', 'mock-api-key', 'claude-2'),
    }

    localStorage.saveLLMConnections(Object.values(connections))
    localStorage.deleteLLMConnection('conn1').then(() => {
      localStorage.loadLLMConnections().then((loadedConnections) => {
        expect(Object.keys(loadedConnections)).toHaveLength(1)
        // expect(loadedConnections['conn2'].type).toBe('Anthropic');
        expect(loadedConnections['conn2'].model).toBe('claude-2')
      })
    })
  })

  it('should clear all LLM connections', () => {
    const llmConnections = [new MockLLMProvider('OpenAI', 'mock-api-key', 'gpt-4')]

    localStorage.saveLLMConnections(llmConnections)
    localStorage.clearLLMConnections()

    localStorage.loadLLMConnections().then((loadedConnections) => {
      expect(Object.keys(loadedConnections)).toHaveLength(0)
    })
  })
})
