import { describe, expect, it } from 'vitest'
import {
  buildJobsDirectoryKey,
  buildJobsFileKey,
  buildJobsTree,
  type StoreFilesResponse,
} from './jobs'
import type { GenericModelStore } from './models'

const store: GenericModelStore = {
  type: 'generic',
  id: 'jobs-test-store',
  name: 'Jobs Test Store',
  baseUrl: 'http://localhost:8100',
}

const filesResponse: StoreFilesResponse = {
  directories: [
    {
      directory: '',
      files: ['core_local.preql', 'debug.preql'],
    },
    {
      directory: 'raw',
      files: ['core.preql'],
    },
    {
      directory: 'raw/boston',
      files: ['boston_tree_info.preql'],
    },
    {
      directory: 'raw/nyc',
      files: ['nyc_tree_info.preql'],
    },
  ],
}

describe('buildJobsTree', () => {
  it('builds nested directory nodes instead of flattening directory paths', () => {
    const tree = buildJobsTree(
      {
        [store.id]: false,
        [buildJobsDirectoryKey(store.id, 'raw')]: false,
      },
      [store],
      { [store.id]: filesResponse },
    )

    expect(tree.map((node) => [node.type, node.label, node.indent])).toEqual([
      ['store', 'Jobs Test Store', 0],
      ['file', 'core_local.preql', 1],
      ['file', 'debug.preql', 1],
      ['directory', 'raw', 1],
      ['file', 'core.preql', 2],
      ['directory', 'boston', 2],
      ['file', 'boston_tree_info.preql', 3],
      ['directory', 'nyc', 2],
      ['file', 'nyc_tree_info.preql', 3],
    ])

    expect(tree.find((node) => node.label === 'boston')?.target).toBe('raw/boston')
    expect(tree.find((node) => node.label === 'nyc')?.target).toBe('raw/nyc')
  })

  it('respects collapsed state for nested directories', () => {
    const tree = buildJobsTree(
      {
        [store.id]: false,
        [buildJobsDirectoryKey(store.id, 'raw')]: true,
      },
      [store],
      { [store.id]: filesResponse },
    )

    expect(tree.map((node) => node.key)).toEqual([
      store.id,
      buildJobsFileKey(store.id, 'core_local.preql'),
      buildJobsFileKey(store.id, 'debug.preql'),
      buildJobsDirectoryKey(store.id, 'raw'),
    ])
  })

  it('creates intermediate directories when only nested paths are present', () => {
    const tree = buildJobsTree(
      {
        [store.id]: false,
        [buildJobsDirectoryKey(store.id, 'raw')]: false,
      },
      [store],
      {
        [store.id]: {
          directories: [
            {
              directory: 'raw/burlington',
              files: ['burlington_tree_info.preql'],
            },
          ],
        },
      },
    )

    expect(tree.map((node) => [node.type, node.label, node.indent])).toEqual([
      ['store', 'Jobs Test Store', 0],
      ['directory', 'raw', 1],
      ['directory', 'burlington', 2],
      ['file', 'burlington_tree_info.preql', 3],
    ])
  })
})
