import { describe, it, expect, beforeEach, vi } from 'vitest'
import LocalStorage from './localStorage'
import Editor from '../editors/editor'
import { ModelConfig } from '../models'

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

  it('should save and load an editor', () => {
    const editor: Editor = new Editor({
      name: 'editor1',
      type: 'preql',
      connection: 'test-connection',
      storage: 'abc',
      contents: 'test content',
    })
    expect(editor.name).toBe('editor1')
    localStorage.saveEditor(editor)
    const loadedEditors = localStorage.loadEditors()

    expect(loadedEditors).toHaveProperty('editor1')
    expect(loadedEditors['editor1'].contents).toBe('test content')
  })

  it('should save and clear editors', () => {
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

    localStorage.saveEditors(editors)
    let storedEditors = localStorage.loadEditors()

    expect(Object.keys(storedEditors)).toHaveLength(2)

    localStorage.clearEditors()
    storedEditors = localStorage.loadEditors()

    expect(Object.keys(storedEditors)).toHaveLength(0)

    editors[0].setContent('content3')
    localStorage.saveEditors([new Editor({
      name: 'editor3',
      type: 'preql',
      connection: 'test-connection',
      storage: 'abc',
      contents: 'content4',
    })])
    localStorage.saveEditors(editors)
    storedEditors = localStorage.loadEditors()
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

  it('should check if an editor exists', () => {
    const editor: Editor = new Editor({
      name: 'editor1',
      type: 'preql',
      connection: 'test-connection',
      storage: 'local',
      contents: 'test content',
    })

    localStorage.saveEditor(editor)

    expect(localStorage.hasEditor('editor1')).toBe(true)
    expect(localStorage.hasEditor('editor2')).toBe(false)
  })

  it('should save and load connections', () => {
    const connections = {
      conn1: { type: 'bigquery-oauth', name: 'conn1', storage: 'local' },
      conn2: { type: 'duckdb', name: 'conn2', storage: 'local' },
    }

    // @ts-ignore
    localStorage.saveConnections(Object.values(connections))
    const loadedConnections = localStorage.loadConnections()

    expect(Object.keys(loadedConnections)).toHaveLength(2)
    expect(loadedConnections['conn1'].name).toBe('conn1')
    expect(loadedConnections['conn2'].name).toBe('conn2')
  })

  it('should delete a connection by name', () => {
    const connections = {
      conn1: { type: 'bigquery-oauth', name: 'conn1' },
      conn2: { type: 'duckdb', name: 'conn2' },
    }
    // @ts-ignore
    localStorage.saveConnections(Object.values(connections))
    localStorage.deleteConnection('conn1')

    const loadedConnections = localStorage.loadConnections()
    expect(Object.keys(loadedConnections)).toHaveLength(1)
    expect(loadedConnections['conn2'].name).toBe('conn2')
  })

  it('should save and load model configs', () => {
    let c1 = new ModelConfig({
      name: 'config1',
      storage: 'local',
      sources: [{ editor: 'source1', alias: 'alias1' }],
      parseResults: null,
    })
    let c2 = new ModelConfig({
      name: 'config2',
      storage: 'local',
      sources: [{ editor: 'source2', alias: 'alias2' }],
      parseResults: null,
    })
    const modelConfigList = {
      config1: c1,
      config2: c2,
    }

    localStorage.saveModelConfig(Object.values(modelConfigList))
    const loadedModelConfig = localStorage.loadModelConfig()

    expect(loadedModelConfig).toHaveLength(2)
    expect(loadedModelConfig[0].name).toBe('config1')
    expect(loadedModelConfig[1].name).toBe('config2')
  })

  it('should clear model configs', () => {
    const modelConfig = [new ModelConfig({ name: 'config1', storage: 'local', sources: [], parseResults: null })]

    localStorage.saveModelConfig(modelConfig)
    localStorage.clearModelConfig()

    const loadedModelConfig = localStorage.loadModelConfig()
    expect(loadedModelConfig).toHaveLength(0)
  })
})
