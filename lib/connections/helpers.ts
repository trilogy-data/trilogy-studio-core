import { Connection } from '.'
import { KeySeparator } from '../data/constants'

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
          db.tables.forEach((table) => {
            let tableId = `${dbId}${KeySeparator}${table.name}`
            list.push({
              id: tableId,
              name: table.name,
              indent: 2,
              count: 0,
              type: 'table',
              connection,
              object: table,
            })
            if (isLoading[tableId]) {
              list.push({
                id: `${connection.name}-loading`,
                name: 'Loading...',
                indent: 1,
                count: 0,
                type: 'loading',
                connection,
              })
            }
            if (!collapsed[tableId]) {
              table.columns.forEach((column) => {
                list.push({
                  id: `${tableId}${KeySeparator}${column.name}`,
                  name: column.name,
                  indent: 3,
                  count: 0,
                  type: 'column',
                  connection,
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
