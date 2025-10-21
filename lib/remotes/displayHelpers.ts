// modelTreeBuilder.ts

import { type ModelRoot, type ModelFile } from './models'
import { KeySeparator } from '../data/constants'

export interface TreeNode {
  type: 'root' | 'engine' | 'model'
  label: string
  key: string
  indent: number
  modelRoot: ModelRoot
  model?: ModelFile
}

/**
 * Build a nested tree structure with model roots, engines, and models
 * @param modelRoots Array of model roots to include
 * @param allFiles All model files organized by model root
 * @param collapsed Object tracking which nodes are collapsed
 * @returns Tree structure with nested hierarchy
 */
export const buildCommunityModelTree = (
  modelRoots: ModelRoot[] = [],
  allFiles: Record<string, ModelFile[]> = {},
  collapsed: Record<string, boolean> = {}
): TreeNode[] => {
  const tree: TreeNode[] = []

  modelRoots.forEach((modelRoot) => {
    const rootKey = `${modelRoot.owner}-${modelRoot.repo}-${modelRoot.branch}`
    const rootDisplayName = modelRoot.displayName || `${modelRoot.owner}/${modelRoot.repo}:${modelRoot.branch}`

    // Add the model root node
    tree.push({
      type: 'root',
      label: rootDisplayName,
      key: rootKey,
      indent: 0,
      modelRoot
    })

    // If this root is not collapsed, add its engines and models
    console.log('Checking collapsed for rootKey:', rootKey, collapsed[rootKey])
    if (!collapsed[rootKey]) {
      const files = allFiles[rootKey] || []
      const engines: Record<string, ModelFile[]> = {}

      // Group files by engine
      files.forEach((file) => {
        if (!engines[file.engine]) {
          engines[file.engine] = []
        }
        engines[file.engine].push(file)
      })

      // Add engine nodes
      Object.keys(engines).sort().forEach((engine) => {
        const engineKey = `${rootKey}${KeySeparator}${engine}`
        tree.push({
          type: 'engine',
          label: engine,
          key: engineKey,
          indent: 1,
          modelRoot
        })
        console.log('Checking collapsed for engineKey:', engineKey, collapsed[engineKey])

        // If this engine is not collapsed, add its models
        if (!collapsed[engineKey]) {
          engines[engine].forEach((file) => {
            tree.push({
              type: 'model',
              label: file.name,
              key: `${engineKey}${KeySeparator}${file.name}`,
              indent: 2,
              model: file,
              modelRoot
            })
          })
        }
      })
    }
  })

  return tree
}

/**
 * Generate a unique key for a model root
 * @param modelRoot The model root to generate a key for
 * @returns Unique string key
 */
export const generateRootKey = (modelRoot: ModelRoot): string => {
  return `${modelRoot.owner}-${modelRoot.repo}-${modelRoot.branch}`
}

/**
 * Generate a unique key for an engine within a model root
 * @param modelRoot The model root
 * @param engine The engine name
 * @returns Unique string key
 */
export const generateEngineKey = (modelRoot: ModelRoot, engine: string): string => {
  const rootKey = generateRootKey(modelRoot)
  return `${rootKey}${KeySeparator}${engine}`
}

/**
 * Generate a unique key for a model within an engine and model root
 * @param modelRoot The model root
 * @param engine The engine name
 * @param modelName The model name
 * @returns Unique string key
 */
export const generateModelKey = (modelRoot: ModelRoot, engine: string, modelName: string): string => {
  const engineKey = generateEngineKey(modelRoot, engine)
  return `${engineKey}${KeySeparator}${modelName}`
}

/**
 * Get all expandable node keys for a given set of model roots and files
 * @param modelRoots Array of model roots
 * @param allFiles All model files organized by model root
 * @returns Array of keys that can be expanded/collapsed
 */
export const getExpandableKeys = (
  modelRoots: ModelRoot[] = [],
  allFiles: Record<string, ModelFile[]> = {}
): string[] => {
  const expandableKeys: string[] = []

  modelRoots.forEach((modelRoot) => {
    const rootKey = generateRootKey(modelRoot)
    expandableKeys.push(rootKey)

    const files = allFiles[rootKey] || []
    const engines = new Set<string>()

    // Collect unique engines
    files.forEach((file) => {
      engines.add(file.engine)
    })

    // Add engine keys
    engines.forEach((engine) => {
      const engineKey = generateEngineKey(modelRoot, engine)
      expandableKeys.push(engineKey)
    })
  })

  return expandableKeys
}

/**
 * Check if a node should be visible based on filter criteria
 * @param node The tree node to check
 * @param searchQuery Text to search for in model names
 * @param selectedEngine Filter by engine type
 * @param importStatus Filter by import status
 * @param modelExistsFn Function to check if a model exists
 * @returns Whether the node should be visible
 */
export const isNodeVisible = (
  node: TreeNode,
  searchQuery: string = '',
  selectedEngine: string = '',
  importStatus: 'all' | 'imported' | 'not-imported' = 'all',
  modelExistsFn: (name: string) => boolean = () => false
): boolean => {
  // Root and engine nodes are always visible if they have visible children
  if (node.type === 'root' || node.type === 'engine') {
    return true
  }

  // For model nodes, apply filters
  if (node.type === 'model' && node.model) {
    const nameMatch = searchQuery === '' ||
      node.model.name.toLowerCase().includes(searchQuery.toLowerCase())

    const engineMatch = selectedEngine === '' || node.model.engine === selectedEngine

    let importMatch = true
    if (importStatus !== 'all') {
      const isImported = modelExistsFn(node.model.name)
      importMatch =
        (importStatus === 'imported' && isImported) ||
        (importStatus === 'not-imported' && !isImported)
    }

    return nameMatch && engineMatch && importMatch
  }

  return true
}

/**
 * Filter tree nodes based on search criteria, maintaining hierarchy
 * @param tree Array of tree nodes
 * @param searchQuery Text to search for in model names
 * @param selectedEngine Filter by engine type
 * @param importStatus Filter by import status
 * @param modelExistsFn Function to check if a model exists
 * @returns Filtered tree maintaining parent-child relationships
 */
export const filterTreeNodes = (
  tree: TreeNode[],
  searchQuery: string = '',
  selectedEngine: string = '',
  importStatus: 'all' | 'imported' | 'not-imported' = 'all',
  modelExistsFn: (name: string) => boolean = () => false
): TreeNode[] => {
  const filteredTree: TreeNode[] = []
  console.log('filteredTreeNodes called with:')
  console.log(tree)
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i]

    if (node.type === 'root') {
      // Check if this root has any visible children
      const hasVisibleChildren = hasVisibleDescendants(tree, i, searchQuery, selectedEngine, importStatus, modelExistsFn)
      if (hasVisibleChildren) {
        filteredTree.push(node)
      }
    } else if (node.type === 'engine') {
      // Check if this engine has any visible models
      const hasVisibleModels = hasVisibleDescendants(tree, i, searchQuery, selectedEngine, importStatus, modelExistsFn)
      if (hasVisibleModels) {
        filteredTree.push(node)
      }
    } else if (node.type === 'model') {
      // Check if this model matches the filters
      if (isNodeVisible(node, searchQuery, selectedEngine, importStatus, modelExistsFn)) {
        filteredTree.push(node)
      }
    }
  }

  return filteredTree
}

/**
 * Check if a node has visible descendants
 * @param tree Complete tree array
 * @param nodeIndex Index of the node to check
 * @param searchQuery Search criteria
 * @param selectedEngine Engine filter
 * @param importStatus Import status filter
 * @param modelExistsFn Function to check model existence
 * @returns Whether the node has visible descendants
 */
const hasVisibleDescendants = (
  tree: TreeNode[],
  nodeIndex: number,
  searchQuery: string,
  selectedEngine: string,
  importStatus: 'all' | 'imported' | 'not-imported',
  modelExistsFn: (name: string) => boolean
): boolean => {
  const node = tree[nodeIndex]
  const nodeIndent = node.indent

  // Look at subsequent nodes that are children of this node
  for (let i = nodeIndex + 1; i < tree.length; i++) {
    const descendant = tree[i]

    // If we've reached a sibling or ancestor, stop looking
    if (descendant.indent <= nodeIndent) {
      break
    }

    // If this is a model node and it's visible, we found a visible descendant
    if (descendant.type === 'model' &&
      isNodeVisible(descendant, searchQuery, selectedEngine, importStatus, modelExistsFn)) {
      return true
    }
  }

  return false
}