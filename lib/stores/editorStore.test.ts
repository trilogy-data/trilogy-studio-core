import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import useEditorStore from './editorStore'
import { EditorTag } from '../editors'

describe('editorStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('getEditorByName prefers live editors over deleted same-named ones', () => {
    const editorStore = useEditorStore()
    const original = editorStore.newEditor('sales', 'preql', 'conn-a', 'select 1;')
    editorStore.removeEditor(original.id)
    const replacement = editorStore.newEditor('sales', 'preql', 'conn-a', 'select 2;')

    // Soft-deleted editors stay in the map; they must not shadow the live
    // editor recreated with the same name (chat tools resolve by name).
    expect(editorStore.getEditorByName('sales')?.id).toBe(replacement.id)
  })

  describe('refinement sessions', () => {
    it('startRefinementSession snapshots content and chart config', () => {
      const editorStore = useEditorStore()
      const editor = editorStore.newEditor('q', 'preql', 'conn-a', 'select 1;')
      editor.setChartConfig({ chartType: 'bar' } as any)

      editorStore.startRefinementSession(editor.id, {
        selectedText: 'select 1;',
        selectionRange: { start: 0, end: 9 },
      })

      const session = editor.refinementSession!
      expect(session.originalContent).toBe('select 1;')
      expect(session.originalChartConfig).toEqual({ chartType: 'bar' })
      expect(session.selectionRange).toEqual({ start: 0, end: 9 })
    })

    it('acceptRefinement keeps the agent-edited content and clears the session', () => {
      const editorStore = useEditorStore()
      const editor = editorStore.newEditor('q', 'preql', 'conn-a', 'select 1;')
      editorStore.startRefinementSession(editor.id)
      editor.setContent('select 42;')

      const onFinish = vi.fn()
      editorStore.acceptRefinement(editor.id, { onFinish })

      expect(editor.contents).toBe('select 42;')
      expect(editor.hasActiveRefinement()).toBe(false)
      expect(onFinish).toHaveBeenCalled()
    })

    it('discardRefinement restores content AND chart config', () => {
      const editorStore = useEditorStore()
      const editor = editorStore.newEditor('q', 'preql', 'conn-a', 'select 1;')
      editor.setChartConfig({ chartType: 'bar' } as any)
      editorStore.startRefinementSession(editor.id)

      // Agent edits both during the session.
      editor.setContent('select 42;')
      editor.setChartConfig({ chartType: 'line' } as any)

      editorStore.discardRefinement(editor.id)

      expect(editor.contents).toBe('select 1;')
      expect(editor.chartConfig).toEqual({ chartType: 'bar' })
      expect(editor.hasActiveRefinement()).toBe(false)
    })
  })

  it('keeps duplicate editor names and only suffixes ids', () => {
    const editorStore = useEditorStore()

    const first = editorStore.newEditor('shared-name', 'preql', 'conn-a', 'select 1;')
    const second = editorStore.newEditor('shared-name', 'preql', 'conn-b', 'select 2;')

    expect(first.name).toBe('shared-name')
    expect(second.name).toBe('shared-name')
    expect(first.id).not.toBe(second.id)
    expect(second.id).toBe('shared-name#1')
  })

  it('keeps remote editor names stable and suffixes only duplicate ids', () => {
    const editorStore = useEditorStore()

    const first = editorStore.newEditor('raw/core', 'preql', 'conn-a', 'select 1;', {
      storage: 'remote',
      remoteStoreId: 'store-a',
      remotePath: 'raw/core.preql',
    })
    const second = editorStore.newEditor('raw/core', 'preql', 'conn-b', 'select 2;', {
      storage: 'remote',
      remoteStoreId: 'store-a',
      remotePath: 'raw/core.preql',
    })

    expect(first.name).toBe('raw/core.preql')
    expect(second.name).toBe('raw/core.preql')
    expect(first.id).toBe('remote:store-a:raw%2Fcore.preql')
    expect(second.id).toBe('remote:store-a:raw%2Fcore.preql#1')
  })

  it('getConnectionEditors scopes by connection id so local and remote scripts stay apart', () => {
    // Regresses a bug where importing a remote that shared a connection name
    // with an existing local connection ran BOTH startup scripts on connect.
    const editorStore = useEditorStore()

    const localStartup = editorStore.newEditor('local-startup', 'preql', 'shared-name', 'local;', {
      storage: 'local',
    })
    localStartup.tags = [EditorTag.STARTUP_SCRIPT]

    const remoteStartup = editorStore.newEditor(
      'remote-startup',
      'preql',
      'shared-name',
      'remote;',
      { storage: 'remote', remoteStoreId: 'store-a', remotePath: 'remote-startup.preql' },
    )
    remoteStartup.tags = [EditorTag.STARTUP_SCRIPT]

    const localOnly = editorStore.getConnectionEditors('local:shared-name', [
      EditorTag.STARTUP_SCRIPT,
    ])
    expect(localOnly).toHaveLength(1)
    expect(localOnly[0].id).toBe(localStartup.id)

    const remoteOnly = editorStore.getConnectionEditors('remote:store-a:shared-name', [
      EditorTag.STARTUP_SCRIPT,
    ])
    expect(remoteOnly).toHaveLength(1)
    expect(remoteOnly[0].id).toBe(remoteStartup.id)

    // A different remote store with the same connection name must not pick
    // this store's scripts up.
    const otherStore = editorStore.getConnectionEditors('remote:store-b:shared-name', [
      EditorTag.STARTUP_SCRIPT,
    ])
    expect(otherStore).toHaveLength(0)
  })

  it('normalizes remote python editor paths with a .py suffix', () => {
    const editorStore = useEditorStore()

    const editor = editorStore.newEditor('raw/loaders/boston_loader', 'python', 'conn-a', '', {
      storage: 'remote',
      remoteStoreId: 'store-a',
    })

    expect(editor.name).toBe('raw/loaders/boston_loader.py')
    expect(editor.remotePath).toBe('raw/loaders/boston_loader.py')
    expect(editor.id).toBe('remote:store-a:raw%2Floaders%2Fboston_loader.py')
  })
})
