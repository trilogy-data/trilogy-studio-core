import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import useEditorStore from './editorStore'

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
})
