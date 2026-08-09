import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import useConnectionStore from './connectionStore'
import useModelConfigStore from './modelStore'
import useEditorStore from './editorStore'
import { ModelSource } from '../models/model'
import LocalStorage from '../data/localStorage'

/**
 * Store-level contract for the model a connection is bound to. The sidebar
 * ModelSelector is only one writer of `connection.model`; ModelCreator, the
 * import flow, model rename/delete and connection creation all write it too,
 * and every query path reads it back through getConnectionSources. These tests
 * pin the contract independently of any component, so a regression in the
 * wiring is caught even if the UI is rearranged again.
 */
describe('connection <-> model assignment', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  const seedModelWithSource = (modelName: string, connectionName: string, contents: string) => {
    const modelStore = useModelConfigStore()
    const editorStore = useEditorStore()
    if (!modelStore.models[modelName]) {
      modelStore.newModelConfig(modelName)
    }
    const editor = editorStore.newEditor(`${modelName}-source`, 'preql', connectionName, contents)
    modelStore.models[modelName].sources = [new ModelSource(editor.id, 'core', [], [])]
    return editor
  }

  it('creates a connection already bound to a same-named model', () => {
    const connectionStore = useConnectionStore()
    const modelStore = useModelConfigStore()

    const connection = connectionStore.newConnection('analytics', 'duckdb', {})

    expect(connection.model).toBe('analytics')
    expect(modelStore.models['analytics']).toBeDefined()
  })

  it('honours an explicitly supplied model instead of creating one', () => {
    const connectionStore = useConnectionStore()
    const modelStore = useModelConfigStore()
    modelStore.newModelConfig('shared-model')

    const connection = connectionStore.newConnection('analytics', 'duckdb', {
      model: 'shared-model',
    })

    expect(connection.model).toBe('shared-model')
    expect(modelStore.models['analytics']).toBeUndefined()
  })

  it('resolves the assigned model to its editor contents for query execution', () => {
    const connectionStore = useConnectionStore()
    const connection = connectionStore.newConnection('analytics', 'duckdb', {})
    seedModelWithSource('analytics', 'analytics', 'const one <- 1;')

    expect(connectionStore.getConnectionSources(connection.id)).toEqual([
      { alias: 'core', contents: 'const one <- 1;' },
    ])
  })

  it('reads through the new model as soon as setModel repoints the connection', () => {
    const connectionStore = useConnectionStore()
    const connection = connectionStore.newConnection('analytics', 'duckdb', {})
    seedModelWithSource('analytics', 'analytics', 'const one <- 1;')
    seedModelWithSource('other-model', 'analytics', 'const two <- 2;')

    connection.setModel('other-model')

    // No reconnect/reset in between: the selector only assigns, so sources have
    // to be resolved live off the store rather than cached at connect time.
    expect(connectionStore.getConnectionSources(connection.id)).toEqual([
      { alias: 'core', contents: 'const two <- 2;' },
    ])
  })

  it('follows a model rename on every connection bound to it', () => {
    const connectionStore = useConnectionStore()
    const modelStore = useModelConfigStore()
    const first = connectionStore.newConnection('analytics', 'duckdb', {})
    const second = connectionStore.newConnection('reporting', 'duckdb', { model: 'analytics' })
    seedModelWithSource('analytics', 'analytics', 'const one <- 1;')

    modelStore.updateModelName('analytics', 'analytics-renamed')

    expect(first.model).toBe('analytics-renamed')
    expect(second.model).toBe('analytics-renamed')
    expect(connectionStore.getConnectionSources(first.id)).toEqual([
      { alias: 'core', contents: 'const one <- 1;' },
    ])
  })

  it('clears the binding when the model is deleted', () => {
    const connectionStore = useConnectionStore()
    const modelStore = useModelConfigStore()
    const connection = connectionStore.newConnection('analytics', 'duckdb', {})
    seedModelWithSource('analytics', 'analytics', 'const one <- 1;')

    modelStore.removeModelConfig('analytics')

    expect(connection.model).toBeNull()
    expect(connectionStore.getConnectionSources(connection.id)).toEqual([])
  })

  it('degrades to no sources when the bound model never loaded', () => {
    const connectionStore = useConnectionStore()
    const connection = connectionStore.newConnection('analytics', 'duckdb', {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Remote models are not persisted; rehydrateRemoteModel returns false when
    // the backing store is unregistered or unreachable, leaving the name set
    // and the model absent. Every query calls this, so it must not throw.
    connection.setModel('remote-model-that-failed-to-rehydrate')

    expect(() => connectionStore.getConnectionSources(connection.id)).not.toThrow()
    expect(connectionStore.getConnectionSources(connection.id)).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('returns no sources for an unknown or unbound connection', () => {
    const connectionStore = useConnectionStore()
    const connection = connectionStore.newConnection('analytics', 'duckdb', {})
    connection.model = null

    expect(connectionStore.getConnectionSources(connection.id)).toEqual([])
    expect(connectionStore.getConnectionSources('local:does-not-exist')).toEqual([])
  })

  it('survives a save/load round trip through LocalStorage', async () => {
    const connectionStore = useConnectionStore()
    const storage = new LocalStorage('model-assignment-test')
    const connection = connectionStore.newConnection('analytics', 'duckdb', {})
    await storage.saveConnections([connection])

    connection.setModel('other-model')
    await storage.saveConnections([connection])

    // saveConnections only writes back connections flagged as changed, so a
    // plain `connection.model = x` assignment left the previous model on disk
    // and the change vanished on reload.
    const reloaded = await storage.loadConnections()
    expect(reloaded['analytics'].model).toBe('other-model')
  })

  it('flags the connection dirty so the save pass picks the change up', () => {
    const connectionStore = useConnectionStore()
    const connection = connectionStore.newConnection('analytics', 'duckdb', {})
    connection.changed = false

    connection.setModel('other-model')
    expect(connection.changed).toBe(true)

    // Re-picking the same model is not a change and should not dirty the
    // connection (setAttribute short-circuits on equal values).
    connection.changed = false
    connection.setModel('other-model')
    expect(connection.changed).toBe(false)
  })

  it('skips sources whose editor is gone rather than dropping the whole model', () => {
    const connectionStore = useConnectionStore()
    const modelStore = useModelConfigStore()
    const connection = connectionStore.newConnection('analytics', 'duckdb', {})
    const editor = seedModelWithSource('analytics', 'analytics', 'const one <- 1;')
    modelStore.models['analytics'].sources.push(
      new ModelSource('missing-editor-id', 'gone', [], []),
    )

    expect(connectionStore.getConnectionSources(connection.id)).toEqual([
      { alias: 'core', contents: editor.contents },
      { alias: 'gone', contents: '' },
    ])
  })
})
