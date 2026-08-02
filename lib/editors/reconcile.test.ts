import { describe, expect, it } from 'vitest'
import Editor from './editor'
import { findRemoteEditors } from './reconcile'

const remoteEditor = (id: string, remoteStoreId: string, remotePath: string): Editor =>
  new Editor({
    id,
    name: remotePath,
    type: 'preql',
    connection: 'store-connection',
    storage: 'remote',
    contents: `-- ${remotePath}`,
    remoteStoreId,
    remotePath,
  })

const localEditor = (id: string): Editor =>
  new Editor({
    id,
    name: id,
    type: 'preql',
    connection: 'local',
    storage: 'local',
    contents: '',
  })

const asRecord = (editors: Editor[]): Record<string, Editor> =>
  Object.fromEntries(editors.map((editor) => [editor.id, editor]))

describe('findRemoteEditors', () => {
  it('finds the editor backing a store path', () => {
    const editors = asRecord([
      remoteEditor('remote:store-1:reporting.preql', 'store-1', 'reporting.preql'),
      remoteEditor('remote:store-1:aircraft.preql', 'store-1', 'aircraft.preql'),
    ])

    const matches = findRemoteEditors(editors, 'store-1', 'reporting.preql')

    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe('remote:store-1:reporting.preql')
  })

  it('matches on store and path rather than a reconstructed id', () => {
    // editorStore suffixes ids on collision, so the id need not be derivable.
    const editors = asRecord([
      remoteEditor('remote:store-1:reporting.preql#1', 'store-1', 'reporting.preql'),
    ])

    expect(findRemoteEditors(editors, 'store-1', 'reporting.preql')[0].id).toBe(
      'remote:store-1:reporting.preql#1',
    )
  })

  it('does not match another store holding the same path', () => {
    const editors = asRecord([remoteEditor('a', 'store-2', 'reporting.preql')])

    expect(findRemoteEditors(editors, 'store-1', 'reporting.preql')).toEqual([])
  })

  it('ignores local editors', () => {
    const editors = asRecord([localEditor('reporting.preql')])

    expect(findRemoteEditors(editors, 'store-1', 'reporting.preql')).toEqual([])
  })

  it('returns every duplicate so callers can prune', () => {
    const editors = asRecord([
      remoteEditor('first', 'store-1', 'reporting.preql'),
      remoteEditor('second', 'store-1', 'reporting.preql'),
    ])

    expect(findRemoteEditors(editors, 'store-1', 'reporting.preql')).toHaveLength(2)
  })
})
