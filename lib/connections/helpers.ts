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
  connection: any | undefined
}> {
  const list: Array<{
    id: string
    name: string
    indent: number
    count: number
    type: string
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
      connection,
    })

    if (collapsed[connection.name] === false) {
      list.push({
        id: `${connection.name}-model`,
        name: 'Model',
        indent: 1,
        count: 0,
        type: 'model',
        connection,
      })

      if (connection.type === 'motherduck') {
        list.push({
          id: `${connection.name}-md-token`,
          name: 'MotherDuck Token',
          indent: 1,
          count: 0,
          type: 'motherduck-token',
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
          connection,
        })
      }
      list.push({
        id: `${connection.name}${KeySeparator}refresh`,
        name: 'Refresh Databases',
        indent: 1,
        count: 0,
        type: 'refresh-connection',
        connection,
      })
      if (isLoading[connection.name]) {
        list.push({
          id: `${connection.name}-loading`,
          name: 'Loading...',
          indent: 1,
          count: 0,
          type: 'loading',
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
          connection,
        })
      }
      databases.forEach((db) => {
        let dbId = `${connection.name}${KeySeparator}${db.name}`
        list.push({
          id: dbId,
          name: db.name,
          indent: 1,
          count: db.tables.length,
          type: 'database',
          connection,
        })

        if (!collapsed[dbId]) {
          list.push({
            id: `${dbId}${KeySeparator}refresh`,
            name: 'Refresh Tables',
            indent: 1,
            count: 0,
            type: 'refresh-database',
            connection,
          })
          if (isLoading[dbId]) {
            list.push({
              id: `${connection.name}-loading`,
              name: 'Loading...',
              indent: 1,
              count: 0,
              type: 'loading',
              connection,
            })
          }

          // Group tables by schema
          const schemaMap = new Map()

          // First, organize tables by schema
          db.tables.forEach((table) => {
            if (table.schema) {
              if (!schemaMap.has(table.schema)) {
                schemaMap.set(table.schema, [])
              }
              schemaMap.get(table.schema).push(table)
            }
          })

          // Process tables with schemas
          if (schemaMap.size > 0) {
            // Add all schemas
            for (const [schema, tables] of schemaMap.entries()) {
              const schemaId = `${dbId}${KeySeparator}${schema}`
              list.push({
                id: schemaId,
                name: schema,
                indent: 2,
                count: tables.length,
                type: 'schema',
                connection,
              })

              // If this schema is not collapsed, add all its tables
              if (!collapsed[schemaId]) {
                tables.forEach((table: Table) => {
                  const tableId = `${dbId}${KeySeparator}${schema}${KeySeparator}${table.name}`
                  list.push({
                    id: tableId,
                    name: table.name,
                    indent: 3,
                    count: 0,
                    type: 'table',
                    connection,
                    object: table,
                  })
                })
              }
            }
          }

          // Process tables without schema
          db.tables.forEach((table) => {
            if (!table.schema) {
              const tableId = `${dbId}${KeySeparator}${table.name}`
              list.push({
                id: tableId,
                name: table.name,
                indent: 2,
                count: 0,
                type: 'table',
                connection,
                object: table,
              })
            }
          })
        }
      })
    }
  })
  return list
}
