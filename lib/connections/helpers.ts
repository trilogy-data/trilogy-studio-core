import { Connection } from '.'
import { KeySeparator } from '../data/constants'
import { Table } from './base'

export function buildConnectionTree(
  connections: Connection[],
  collapsed: Record<string, boolean>,
  isLoading: Record<string, boolean>,
  isErrored: Record<string, string>,
): Array<{
  id: string
  name: string
  indent: number
  count: number
  type: string
  searchPath: string
  connection: any | undefined
}> {
  const list: Array<{
    id: string
    name: string
    indent: number
    count: number
    type: string
    searchPath: string
    connection: any | undefined
    object?: any
  }> = []
  const sorted = Object.values(connections).sort((a, b) => {
    if (a.connected && !b.connected) {
      return -1
    } else if (!a.connected && b.connected) {
      return 1
    } else {
      return a.name.localeCompare(b.name)
    }
  })
  sorted.forEach((connection) => {
    let databases = connection.databases ? connection.databases : []
    list.push({
      id: connection.name,
      name: connection.name,
      indent: 0,
      count: databases.length,
      type: 'connection',
      searchPath: connection.name,
      connection,
    })

    if (collapsed[connection.name] === false) {
      if (['duckdb'].includes(connection.type)) {
        list.push({
          id: `${connection.name}-upload`,
          name: 'Upload',
          indent: 1,
          count: 0,
          type: 'duckdb-upload',
          searchPath: connection.name,
          connection,
        })
      }
      list.push({
        id: `${connection.name}-model`,
        name: 'Model',
        indent: 1,
        count: 0,
        type: 'model',
        searchPath: connection.name,
        connection,
      })

      if (connection.type === 'motherduck') {
        list.push({
          id: `${connection.name}-md-token`,
          name: 'MotherDuck Token',
          indent: 1,
          count: 0,
          type: 'motherduck-token',
          searchPath: connection.name,
          connection,
        })
      }
      if (connection.type === 'bigquery-oauth') {
        list.push({
          id: `${connection.name}-billing-project`,
          name: 'Billing Project',
          indent: 1,
          count: 0,
          type: 'bigquery-project',
          searchPath: connection.name,
          connection,
        })
        list.push({
          id: `${connection.name}-browsing-project`,
          name: 'Browsing Project',
          indent: 1,
          count: 0,
          type: 'bigquery-browsing-project',
          searchPath: connection.name,
          connection,
        })
      }
      if (connection.type === 'snowflake') {
        list.push({
          id: `${connection.name}-private-key`,
          name: 'Private Key',
          indent: 1,
          count: 0,
          type: 'snowflake-private-key',
          searchPath: connection.name,
          connection,
        })
      }
      if (['snowflake', 'motherduck'].includes(connection.type)) {
        list.push({
          id: `${connection.name}-toggle-save-credential`,
          name: 'Toggle Credential Saving',
          indent: 1,
          count: 0,
          type: 'toggle-save-credential',
          searchPath: connection.name,
          connection,
        })
      }

      // list.push({
      //   id: `${connection.name}${KeySeparator}refresh`,
      //   name: 'Refresh Databases',
      //   indent: 1,
      //   count: 0,
      //   type: 'refresh-connection',
      //   searchPath: connection.name,
      //   connection,
      // })
      if (isLoading[connection.name]) {
        list.push({
          id: `${connection.name}-loading`,
          name: 'Loading...',
          indent: 1,
          count: 0,
          type: 'loading',
          searchPath: connection.name,
          connection,
        })
      }
      if (isErrored[connection.name]) {
        list.push({
          id: `${connection.name}-error`,
          name: isErrored[connection.name],
          indent: 1,
          count: 0,
          type: 'error',
          searchPath: connection.name,
          connection,
        })
      }
      databases.forEach((db) => {
        let dbId = `${connection.name}${KeySeparator}${db.name}`
        list.push({
          id: dbId,
          name: db.name,
          indent: 1,
          count: db.schemas.length,
          type: 'database',
          searchPath: `${db.name}`,
          connection,
        })

        if (!collapsed[dbId]) {
          // list.push({
          //   id: `${dbId}${KeySeparator}refresh`,
          //   name: 'Refresh Schemas',
          //   indent: 1,
          //   count: 0,
          //   type: 'refresh-database',
          //   searchPath: `${db.name}`,
          //   connection,
          // })
          if (isLoading[dbId]) {
            list.push({
              id: `${connection.name}-loading`,
              name: 'Loading...',
              indent: 1,
              count: 0,
              type: 'loading',
              searchPath: `${db.name}`,
              connection,
            })
          }

          // Add all schemas
          db.schemas.forEach((schema) => {
            const schemaId = `${dbId}${KeySeparator}${schema.name}`
            list.push({
              id: schemaId,
              name: schema.name,
              indent: 2,
              count: schema.tables.length,
              type: 'schema',
              searchPath: `${db.name}.${schema.name}`,
              connection,
            })

            // If this schema is not collapsed, add all its tables
            if (!collapsed[schemaId]) {
              // list.push({
              //   id: `${schemaId}${KeySeparator}refresh`,
              //   name: 'Refresh Tables',
              //   indent: 2,
              //   count: 0,
              //   type: 'refresh-schema',
              //   searchPath: `${db.name}.${schema.name}}`,
              //   connection,
              // })
              if (isLoading[schemaId]) {
                list.push({
                  id: `${schemaId}-loading`,
                  name: 'Loading...',
                  indent: 2,
                  count: 0,
                  type: 'loading',
                  searchPath: `${db.name}.${schema.name}`,
                  connection,
                })
              }
              schema.tables.forEach((table: Table) => {
                const tableId = `${dbId}${KeySeparator}${schema.name}${KeySeparator}${table.name}`
                list.push({
                  id: tableId,
                  name: table.name,
                  indent: 3,
                  count: 0,
                  type: 'table',
                  searchPath: `${db.name}.${schema.name}.${table.name}`,
                  connection,
                  object: table,
                })
              })
            }
          })
        }
      })
    }
  })
  return list
}

export function filterConnectionTree(
  treeNodes: Array<{
    id: string
    name: string
    indent: number
    count: number
    type: string
    searchPath: string
    connection: any | undefined
    object?: any
  }>,
  filterString?: string,
): Array<{
  id: string
  name: string
  indent: number
  count: number
  type: string
  searchPath: string
  connection: any | undefined
  object?: any
}> {
  // If no filter string or empty filter, return the original tree
  if (!filterString || filterString.trim() === '') {
    return treeNodes
  }

  const normalizedFilter = filterString.toLowerCase().trim()

  // First pass: identify nodes that match the filter
  const matchingNodeIds = new Set<string>()
  // Find all nodes that directly match the filter
  treeNodes.forEach((node) => {
    if (node.searchPath.toLowerCase().includes(normalizedFilter)) {
      matchingNodeIds.add(node.id)
    }
  })

  // Second pass: identify all parent nodes of matching nodes
  const parentMap = new Map<string, Set<string>>()

  // Build a map of parent IDs for each node based on indentation and position in the array
  for (let i = 0; i < treeNodes.length; i++) {
    const currentNode = treeNodes[i]

    // Look for potential parent nodes (nodes with smaller indent that appear before this one)
    let parentId: string | null = null

    for (let j = i - 1; j >= 0; j--) {
      const potentialParent = treeNodes[j]
      if (potentialParent.indent < currentNode.indent) {
        parentId = potentialParent.id
        break
      }
    }

    if (parentId) {
      if (!parentMap.has(currentNode.id)) {
        parentMap.set(currentNode.id, new Set<string>())
      }
      parentMap.get(currentNode.id)!.add(parentId)
    }
  }

  // Add all parent nodes of matching nodes to the set of nodes to keep
  const nodesToKeep = new Set<string>(matchingNodeIds)

  // For each matching node, traverse up the parent chain and add all parents
  const addParents = (nodeId: string) => {
    const parents = parentMap.get(nodeId)
    if (parents) {
      for (const parentId of parents) {
        if (!nodesToKeep.has(parentId)) {
          nodesToKeep.add(parentId)
          addParents(parentId)
        }
      }
    }
  }

  // Add parents for all matching nodes
  matchingNodeIds.forEach((nodeId) => {
    addParents(nodeId)
  })

  // Final pass: filter the tree to only include nodes in nodesToKeep
  return treeNodes.filter((node) => nodesToKeep.has(node.id))
}
