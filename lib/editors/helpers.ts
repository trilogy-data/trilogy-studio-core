import { Editor } from '.'
import type { Connection } from '../connections'

export function buildEditorTree(
  connections: Connection[],
  editors: Editor[],
  collapsed: Record<string, boolean>,
  hiddenTags: Set<string>,
) {
  const list: Array<{
    key: string
    objectKey: string
    label: string
    type: string
    indent: Array<number>
    editor?: any
  }> = []
  const processedConnections = new Set<string>()

  const connectionLookup = connections.reduce(
    (acc, conn) => {
      acc[conn.name] = conn
      return acc
    },
    {} as Record<string, Connection>,
  )

  // Modified sort logic to prioritize active connections
  const sorted = Object.values(editors).sort((a, b) => {
    // First compare storage
    const storageComparison = a.storage.localeCompare(b.storage)
    if (storageComparison !== 0) return storageComparison

    // Then prioritize active connections
    const aIsActive = connectionLookup[a.connection]?.connected || false
    const bIsActive = connectionLookup[b.connection]?.connected || false

    if (aIsActive && !bIsActive) return -1
    if (!aIsActive && bIsActive) return 1

    // If both have same active status, fall back to alphabetical
    const connectionComparison = a.connection.localeCompare(b.connection)
    if (connectionComparison !== 0) return connectionComparison

    // Finally sort by name
    return a.name.localeCompare(b.name)
  })

  // Group editors by storage and connection for clearer organization
  const storageGroups: Record<string, Record<string, any[]>> = {}
  // first, collect all connections
  connections.forEach((conn) => {
    if (!storageGroups[conn.storage]) {
      storageGroups[conn.storage] = {}
    }
    if (!storageGroups[conn.storage][conn.name]) {
      storageGroups[conn.storage][conn.name] = []
    }
  })

  // First, organize editors into nested groups
  sorted.forEach((editor) => {
    if (editor.deleted) {
      return // Skip deleted editors
    }
    if (!storageGroups[editor.storage]) {
      storageGroups[editor.storage] = {}
    }
    if (!storageGroups[editor.storage][editor.connection]) {
      storageGroups[editor.storage][editor.connection] = []
    }
    storageGroups[editor.storage][editor.connection].push(editor)
  })

  // Helper function to build folder structure for a connection
  function buildFolderStructure(
    editors: Editor[],
    storage: string,
    connection: string,
    baseIndent: number[],
  ) {
    // Create a tree structure for folders
    const folderTree: Record<string, any> = {}

    // Process each editor and build folder structure
    editors.forEach((editor) => {
      // Skip editors with hidden tags
      if (
        hiddenTags.size > 0 &&
        //@ts-ignore
        editor.tags.some((tag) => hiddenTags.has(tag))
      ) {
        return
      }

      const pathParts = editor.name.split('/')
      let currentLevel = folderTree

      // Build nested folder structure
      for (let i = 0; i < pathParts.length - 1; i++) {
        const folderName = pathParts[i]
        if (!currentLevel[folderName]) {
          currentLevel[folderName] = {
            type: 'folder',
            children: {},
            editors: [],
          }
        }
        currentLevel = currentLevel[folderName].children
      }

      // Add the editor to the final folder or root
      // Use editor ID as key to handle duplicate names, but display the filename
      const fileName = pathParts[pathParts.length - 1]
      currentLevel[editor.id] = {
        type: 'editor',
        editor: editor,
        displayName: fileName,
      }
    })

    // Helper function to recursively add folders and editors to the list
    function addToList(
      tree: Record<string, any>,
      currentIndent: number[],
      pathPrefix: string = '',
    ) {
      // Sort entries: folders first, then editors
      const entries = Object.entries(tree).sort(([aKey, aVal], [bKey, bVal]) => {
        if (aVal.type === 'folder' && bVal.type === 'editor') return -1
        if (aVal.type === 'editor' && bVal.type === 'folder') return 1

        // For folders, sort by folder name
        if (aVal.type === 'folder' && bVal.type === 'folder') {
          return aKey.localeCompare(bKey)
        }

        // For editors, sort by display name
        if (aVal.type === 'editor' && bVal.type === 'editor') {
          return aVal.displayName.localeCompare(bVal.displayName)
        }

        return aKey.localeCompare(bKey)
      })

      entries.forEach(([key, node]) => {
        if (node.type === 'folder') {
          const folderPath = pathPrefix ? `${pathPrefix}/${key}` : key
          const folderKey = `f-${storage}-${connection}-${folderPath}`

          list.push({
            key: folderKey,
            objectKey: folderPath,
            label: key,
            type: 'folder',
            indent: currentIndent,
          })

          // If folder is not collapsed, add its contents
          if (!collapsed[folderKey]) {
            addToList(node.children, [...currentIndent, currentIndent.length], folderPath)
          }
        } else if (node.type === 'editor') {
          const editorKey = `e-${storage}-${connection}-${node.editor.id}`
          list.push({
            objectKey: node.editor.id,
            key: editorKey,
            label: node.displayName,
            type: 'editor',
            indent: currentIndent,
            editor: node.editor,
          })
        }
      })
    }

    addToList(folderTree, baseIndent)
  }

  // Build the main tree structure
  Object.entries(storageGroups).forEach(([storage, connections]) => {
    const storageKey = `s-${storage}`
    // Add storage item
    list.push({
      objectKey: storage,
      key: storageKey,
      label: 'Browser Storage',
      type: 'storage',
      indent: [],
    })

    // If storage is not collapsed, add connections and editors
    if (!collapsed[storageKey]) {
      // Sort connections to show active ones first
      const sortedConnections = Object.entries(connections).sort(([connA], [connB]) => {
        const aIsActive = connectionLookup[connA]?.connected || false
        const bIsActive = connectionLookup[connB]?.connected || false

        if (aIsActive && !bIsActive) return -1
        if (!aIsActive && bIsActive) return 1

        return connA.localeCompare(connB)
      })

      sortedConnections.forEach(([connection, editors]) => {
        const connectionKey = `c-${storage}-${connection}`
        // Add connection item if not already processed
        if (!processedConnections.has(connectionKey)) {
          list.push({
            key: connectionKey,
            objectKey: connection,
            label: connection,
            type: 'connection',
            indent: [0],
          })
          processedConnections.add(connectionKey)

          // If connection is not collapsed, add folder structure
          if (!collapsed[connectionKey]) {
            buildFolderStructure(editors, storage, connection, [0, 1])
          }
        }
      })
    }
  })
  return list
}
