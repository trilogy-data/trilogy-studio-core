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
    indent: number
    editor?: any
    connection?: string
    connectionId?: string
    storage?: string
    remoteStoreId?: string | null
  }> = []
  const processedConnections = new Set<string>()

  const connectionLookup = connections.reduce(
    (acc, conn) => {
      acc[conn.id] = conn
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
    const aConnectionId = a.connectionId || a.connection
    const bConnectionId = b.connectionId || b.connection
    const aConn = connectionLookup[aConnectionId]
    const bConn = connectionLookup[bConnectionId]
    const aIsActive = aConn?.connected || false
    const bIsActive = bConn?.connected || false

    if (aIsActive && !bIsActive) return -1
    if (!aIsActive && bIsActive) return 1

    // If both have same active status, fall back to alphabetical
    const connectionComparison = (aConn?.name || a.connection).localeCompare(
      bConn?.name || b.connection,
    )
    if (connectionComparison !== 0) return connectionComparison

    // Finally sort by name
    return a.name.localeCompare(b.name)
  })

  // Group editors by storage and connection for clearer organization
  const storageGroups: Record<
    string,
    Record<
      string,
      {
        label: string
        editors: Editor[]
        remoteStoreId?: string | null
      }
    >
  > = {}
  // first, collect all connections
  connections.forEach((conn) => {
    if (!storageGroups[conn.storage]) {
      storageGroups[conn.storage] = {}
    }
    if (!storageGroups[conn.storage][conn.id]) {
      storageGroups[conn.storage][conn.id] = {
        label: conn.name,
        editors: [],
        remoteStoreId: (conn as unknown as { remoteStoreId?: string | null }).remoteStoreId ?? null,
      }
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
    const connectionId = editor.connectionId || editor.connection
    if (!storageGroups[editor.storage][connectionId]) {
      storageGroups[editor.storage][connectionId] = {
        label: connectionLookup[connectionId]?.name || editor.connection,
        editors: [],
        remoteStoreId: editor.remoteStoreId ?? null,
      }
    }
    storageGroups[editor.storage][connectionId].editors.push(editor)
  })

  // Helper function to build folder structure for a connection
  function buildFolderStructure(
    editors: Editor[],
    storage: string,
    connectionId: string,
    connectionLabel: string,
    baseIndent: number,
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
    function addToList(tree: Record<string, any>, currentIndent: number, pathPrefix: string = '') {
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
          const folderKey = `f-${storage}-${connectionId}-${folderPath}`

          list.push({
            key: folderKey,
            objectKey: folderPath,
            label: key,
            type: 'folder',
            indent: currentIndent,
            connection: connectionLabel,
            connectionId,
            storage,
            remoteStoreId:
              storage === 'remote'
                ? (editors.find((editor) => editor.remoteStoreId)?.remoteStoreId ?? null)
                : null,
          })

          // If folder is not collapsed, add its contents
          if (!collapsed[folderKey]) {
            addToList(node.children, currentIndent + 1, folderPath)
          }
        } else if (node.type === 'editor') {
          const editorKey = `e-${storage}-${connectionId}-${node.editor.id}`
          list.push({
            objectKey: node.editor.id,
            key: editorKey,
            label: node.displayName,
            type: 'editor',
            indent: currentIndent,
            editor: node.editor,
            storage,
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
      label: storage === 'remote' ? 'Remote Storage' : 'Browser Storage',
      type: 'storage',
      indent: 0,
    })

    // If storage is not collapsed, add connections and editors
    if (!collapsed[storageKey]) {
      // Sort connections to show active ones first
      const sortedConnections = Object.entries(connections).sort(([connA], [connB]) => {
        const aIsActive = connectionLookup[connA]?.connected || false
        const bIsActive = connectionLookup[connB]?.connected || false

        if (aIsActive && !bIsActive) return -1
        if (!aIsActive && bIsActive) return 1

        const aLabel = connections[connA].label
        const bLabel = connections[connB].label
        return aLabel.localeCompare(bLabel)
      })

      sortedConnections.forEach(([connectionId, group]) => {
        const connectionKey = `c-${storage}-${connectionId}`
        // Add connection item if not already processed
        if (!processedConnections.has(connectionKey)) {
          list.push({
            key: connectionKey,
            objectKey: connectionId,
            label: group.label,
            type: 'connection',
            indent: 1,
            connectionId,
            storage,
            remoteStoreId:
              storage === 'remote'
                ? (group.editors.find((editor) => editor.remoteStoreId)?.remoteStoreId ?? null)
                : null,
          })
          processedConnections.add(connectionKey)

          // If connection is not collapsed, add folder structure
          if (!collapsed[connectionKey]) {
            buildFolderStructure(group.editors, storage, connectionId, group.label, 2)
          }
        }
      })
    }
  })
  return list
}
