import { describe, expect, it } from 'vitest'
import { buildEditorTree } from './helpers'

describe('buildEditorTree', () => {
  it('keeps same-named local and remote connections in separate sidebar groups', () => {
    const tree = buildEditorTree(
      [
        { id: 'local:shared', name: 'shared', storage: 'local', connected: true },
        {
          id: 'remote:store-a:shared',
          name: 'shared',
          storage: 'remote',
          connected: false,
        },
      ] as any,
      [
        {
          id: 'local-editor',
          name: 'orders.preql',
          storage: 'local',
          connection: 'shared',
          connectionId: 'local:shared',
          deleted: false,
          tags: [],
        },
        {
          id: 'remote-editor',
          name: 'orders.preql',
          storage: 'remote',
          connection: 'shared',
          connectionId: 'remote:store-a:shared',
          remoteStoreId: 'store-a',
          deleted: false,
          tags: [],
        },
      ] as any,
      {
        's-local': false,
        's-remote': false,
        'c-local-local:shared': false,
        'c-remote-remote:store-a:shared': false,
      },
      new Set(),
    )

    const connectionItems = tree.filter((item) => item.type === 'connection')
    expect(connectionItems).toHaveLength(2)
    expect(connectionItems.map((item) => item.objectKey)).toEqual([
      'local:shared',
      'remote:store-a:shared',
    ])
  })
})
