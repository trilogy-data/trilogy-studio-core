import { Editor } from '.'

export function buildEditorTree(
  editors: Editor[],
  collapsed: Record<string, boolean>,
  hiddenTags: Set<string>,
  // Add a new parameter to track active connections
  activeConnections: Set<string> = new Set<string>(),
) {
  const list: Array<{
    key: string
    objectKey: string
    label: string
    type: string
    indent: Array<number>
    editor?: any
  }> = []
  // Track connections we've already processed for deduplication
  const processedConnections = new Set<string>()

  // Modified sort logic to prioritize active connections
  const sorted = Object.values(editors).sort((a, b) => {
    // First compare storage
    const storageComparison = a.storage.localeCompare(b.storage)
    if (storageComparison !== 0) return storageComparison

    // Then prioritize active connections
    const aIsActive = activeConnections.has(a.connection)
    const bIsActive = activeConnections.has(b.connection)

    if (aIsActive && !bIsActive) return -1 // a is active, b is not -> a comes first
    if (!aIsActive && bIsActive) return 1 // b is active, a is not -> b comes first

    // If both have same active status, fall back to alphabetical
    const connectionComparison = a.connection.localeCompare(b.connection)
    if (connectionComparison !== 0) return connectionComparison

    // Finally sort by name
    return a.name.localeCompare(b.name)
  })

  // Group editors by storage and connection for clearer organization
  const storageGroups: Record<string, Record<string, any[]>> = {}

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

  // Then, build the list with proper order and indentation
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
        const aIsActive = activeConnections.has(connA)
        const bIsActive = activeConnections.has(connB)

        if (aIsActive && !bIsActive) return -1 // a is active, b is not -> a comes first
        if (!aIsActive && bIsActive) return 1 // b is active, a is not -> b comes first

        // If both have same active status, fall back to alphabetical
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

          // If connection is not collapsed, add editors
          if (!collapsed[connectionKey]) {
            editors.forEach((editor) => {
              // Skip editors with hidden tags
              if (
                hiddenTags.size > 0 &&
                //@ts-ignore
                editor.tags.some((tag) => hiddenTags.has(tag))
              ) {
                return
              }
              const editorKey = `e-${storage}-${connection}-${editor.id}`
              list.push({
                objectKey: editor.id,
                key: editorKey,
                label: editor.name,
                type: 'editor',
                indent: [0, 1],
                editor,
              })
            })
          }
        }
      })
    }
  })
  return list
}
