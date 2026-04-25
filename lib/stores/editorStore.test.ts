import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import useEditorStore from './editorStore'
import { EditorTag } from '../editors'

describe('editorStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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

    const localStartup = editorStore.newEditor(
      'local-startup',
      'preql',
      'shared-name',
      'local;',
      { storage: 'local' },
    )
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
