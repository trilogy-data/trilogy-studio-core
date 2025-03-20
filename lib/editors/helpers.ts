import { Editor } from '.'

export function buildEditorTree(
    editors: Editor[],
    collapsed: Record<string, boolean>,
    hiddenTags: Set<string>,
    connectionCreatorVisible: Record<string, boolean>,
) {
    const list: Array<{
        key: string
        label: string
        type: string
        indent: Array<number>
        editor?: any
    }> = []

    // Track connections we've already processed for deduplication
    const processedConnections = new Set<string>()

    // sort for rendering
    const sorted = Object.values(editors).sort(
        (a, b) =>
            a.storage.localeCompare(b.storage) ||
            a.connection.localeCompare(b.connection) ||
            a.name.localeCompare(b.name),
    )

    // Group editors by storage and connection for clearer organization
    const storageGroups: Record<string, Record<string, any[]>> = {}

    // First, organize editors into nested groups
    sorted.forEach((editor) => {
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
        list.push({ key: storageKey, label: storage, type: 'storage', indent: [] })

        // If storage is not collapsed, add connections and editors
        if (!collapsed[storageKey]) {
            Object.entries(connections).forEach(([connection, editors]) => {
                const connectionKey = `c-${storage}-${connection}`

                // Add connection item if not already processed
                if (!processedConnections.has(connectionKey)) {
                    list.push({
                        key: connectionKey,
                        label: connection,
                        type: 'connection',
                        indent: [0],
                    })

                    processedConnections.add(connectionKey)

                    // ===================================================
                    // INSERT NEW DATA ELEMENT AFTER CONNECTION HERE
                    // You can inject a new item into the list right after
                    // each connection is added, for example:
                    if (connectionCreatorVisible[connection] === true) {
                        list.push({
                            key: `data-${connectionKey}`,
                            label: connection,
                            type: 'creator',
                            indent: [0],
                        })
                    }
                    // ===================================================

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

                            const editorKey = `e-${storage}-${connection}-${editor.name}`
                            list.push({
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