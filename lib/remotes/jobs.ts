import { KeySeparator } from '../data/constants'
import type { GenericModelStore } from './models'

export interface StoreDirectoryListing {
  directory: string
  files: string[]
}

export interface StoreFilesResponse {
  directories: StoreDirectoryListing[]
}

export type RemoteJobStatus = 'running' | 'success' | 'error' | 'cancelled'

export interface RemoteJobResponse {
  job_id: string
  status: RemoteJobStatus
  output: string
  error: string
  return_code: number | null
}

export interface LocalStoreJob extends RemoteJobResponse {
  storeId: string
  target: string
  operation: 'run' | 'refresh'
  submittedAt: number
  updatedAt: number
  pollingState?: 'ok' | 'auth-paused' | 'not-found' | 'stopped'
  pollingError?: string | null
}

export interface JobsTreeNode {
  type: 'store' | 'directory' | 'file'
  label: string
  key: string
  indent: number
  storeId: string
  target?: string
  store?: GenericModelStore
}

interface JobsDirectoryTreeNode {
  name: string
  path: string
  files: string[]
  children: Record<string, JobsDirectoryTreeNode>
}

const createDirectoryTreeNode = (name: string, path: string): JobsDirectoryTreeNode => ({
  name,
  path,
  files: [],
  children: {},
})

const sortStrings = (values: string[]): string[] =>
  values.slice().sort((left, right) => left.localeCompare(right))

const ensureDirectoryTreeNode = (
  root: JobsDirectoryTreeNode,
  directoryPath: string,
): JobsDirectoryTreeNode => {
  if (!directoryPath) {
    return root
  }

  const parts = directoryPath.split('/').filter(Boolean)
  let current = root
  let currentPath = ''

  parts.forEach((part) => {
    currentPath = currentPath ? `${currentPath}/${part}` : part
    if (!current.children[part]) {
      current.children[part] = createDirectoryTreeNode(part, currentPath)
    }
    current = current.children[part]
  })

  return current
}

export const buildJobsDirectoryKey = (storeId: string, directory: string): string =>
  `${storeId}${KeySeparator}directory${KeySeparator}${encodeURIComponent(directory)}`

export const buildJobsFileKey = (storeId: string, target: string): string =>
  `${storeId}${KeySeparator}file${KeySeparator}${encodeURIComponent(target)}`

const appendFilesToTree = (
  tree: JobsTreeNode[],
  storeId: string,
  files: string[],
  directory: string,
  indent: number,
): void => {
  sortStrings(files).forEach((fileName) => {
    const target = directory ? `${directory}/${fileName}` : fileName
    tree.push({
      type: 'file',
      label: fileName,
      key: buildJobsFileKey(storeId, target),
      indent,
      storeId,
      target,
    })
  })
}

const appendDirectoryContentsToTree = (
  tree: JobsTreeNode[],
  storeId: string,
  directoryNode: JobsDirectoryTreeNode,
  collapsed: Record<string, boolean>,
  indent: number,
): void => {
  appendFilesToTree(tree, storeId, directoryNode.files, directoryNode.path, indent)

  Object.values(directoryNode.children)
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((child) => {
      const directoryKey = buildJobsDirectoryKey(storeId, child.path)
      tree.push({
        type: 'directory',
        label: child.name,
        key: directoryKey,
        indent,
        storeId,
        target: child.path,
      })

      if (!collapsed[directoryKey]) {
        appendDirectoryContentsToTree(tree, storeId, child, collapsed, indent + 1)
      }
    })
}

export const buildJobsTree = (
  collapsed: Record<string, boolean> = {},
  stores: GenericModelStore[] = [],
  filesByStore: Record<string, StoreFilesResponse> = {},
): JobsTreeNode[] => {
  const tree: JobsTreeNode[] = []

  stores.forEach((store) => {
    tree.push({
      type: 'store',
      label: store.name,
      key: store.id,
      indent: 0,
      storeId: store.id,
      store,
    })

    if (collapsed[store.id]) {
      return
    }

    const root = createDirectoryTreeNode('', '')
    const directories = filesByStore[store.id]?.directories || []

    directories.forEach((entry) => {
      const node = ensureDirectoryTreeNode(root, entry.directory)
      node.files = sortStrings(entry.files)
    })

    appendDirectoryContentsToTree(tree, store.id, root, collapsed, 1)
  })

  return tree
}
