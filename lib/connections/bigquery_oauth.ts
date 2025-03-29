import BaseConnection from './base'
import { Database, Table, Column } from './base'
import { Results, ColumnType } from '../editors/results'
import type { ResultColumn } from '../editors/results'
import { DateTime } from 'luxon'

declare var google: any

function parseTimestamp(value: string): DateTime {
  return DateTime.fromMillis(parseFloat(value) * 1000)
}

function arrayToObject(array: any[]): Record<string, any> {
  return array.reduce((obj, item, index) => {
    obj[index] = item
    return obj
  }, {})
}

const reauthException = 'Request had invalid authentication credentials.'
// @ts-ignore
export default class BigQueryOauthConnection extends BaseConnection {
  // @ts-ignore
  private accessToken: string
  public projectId: string

  constructor(name: string, projectId: string, model?: string) {
    super(name, 'bigquery-oauth', false), model
    this.projectId = projectId
    this.query_type = 'bigquery'
  }

  toJSON(): object {
    return {
      name: this.name,
      type: this.type,
      model: this.model,
      projectId: this.projectId,
    }
  }

  static fromJSON(fields: {
    name: string
    projectId: string
    model: string | null
  }): BigQueryOauthConnection {
    let base = new BigQueryOauthConnection(fields.name, fields.projectId)
    if (fields.model) {
      base.model = fields.model
    }
    return base
  }
  async connect(): Promise<boolean> {
    return new Promise((resolve, _) => {
      try {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: '734709568634-3u732kjmtp8e4bi6te0g7uo9278k104i.apps.googleusercontent.com',
          // @ts-ignore
          callback: (response) => {
            this.accessToken = response.access_token

            return resolve(true)
          },
          // @ts-ignore
          error_callback: (error) => {
            console.error('BigQuery OAuth error', error)
            resolve(false)
          },
          scope: 'https://www.googleapis.com/auth/bigquery',
        })

        tokenClient.requestAccessToken()
      } catch (error) {
        console.error('Error connecting to BigQuery with OAuth', error)
        return false
      }
    })
  }

  async fetchEndpoint(endpoint: string, args: any, method: string): Promise<any> {
    let response = null
    if (method == 'GET') {
      response = await fetch(
        `https://bigquery.googleapis.com/bigquery/v2/projects/${this.projectId}/${endpoint}`,
        {
          method: method,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      )
    } else if (method == 'POST') {
      response = await fetch(
        `https://bigquery.googleapis.com/bigquery/v2/projects/${this.projectId}/${endpoint}`,
        {
          method: method,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: args ? JSON.stringify(args) : null,
        },
      )
    } else {
      throw new Error(`Unsupported method ${method}`)
    }
    if (!response.ok) {
      const errorResponse = await response.json()
      // check for partial match to error patterns that mean we need to reath
      if (errorResponse.error.message.includes(reauthException)) {
        this.connected = false
      }
      throw new Error(`BigQuery request failed: ${errorResponse.error.message}`)
    }
    return await response.json()
  }

  async getDatabases(): Promise<Database[]> {
    try {
      const data = await this.fetchEndpoint('datasets', {}, 'GET')
      const databases: Database[] = []

      for (const dataset of data.datasets || []) {
        const datasetId = dataset.datasetReference.datasetId
        // const tables = await this.getTables(datasetId);
        const tables: Table[] = []
        databases.push(new Database(datasetId, tables))
      }

      return databases
    } catch (error) {
      console.error('Error fetching databases:', error)
      throw error
    }
  }

  async getTables(database: string): Promise<Table[]> {
    try {
      const data = await this.fetchEndpoint(`datasets/${database}/tables`, {}, 'GET')

      const tables: Table[] = []

      for (const table of data.tables || []) {
        const tableId = table.tableReference.tableId
        const columns: Column[] = []
        tables.push(new Table(tableId, columns))
      }

      return tables
    } catch (error) {
      console.error(`Error fetching tables for database ${database}:`, error)
      throw error
    }
  }

  async getTableSample(database: string, table: string, limit: number = 100) {
    const sql = `SELECT * FROM \`${database}.${table}\` LIMIT ${limit}`
    return this.query(sql)
  }

  async getTable(database: string, table: string): Promise<Table> {
    try {
      const columns = await this.getColumns(database, table)
      return new Table(table, columns)
    } catch (error) {
      console.error(`Error fetching table ${database}.${table}:`, error)
      throw error
    }
  }

  async getColumns(database: string, table: string): Promise<Column[]> {
    try {
      const tableData = await this.fetchEndpoint(`datasets/${database}/tables/${table}`, {}, 'GET')

      if (!tableData.schema || !tableData.schema.fields) {
        return []
      }

      return tableData.schema.fields.map((field: any) => {
        // Mapping BigQuery schema fields to Column objects
        const isPrimary =
          field.mode === 'REQUIRED' &&
          (field.name.toLowerCase() === 'id' || field.name.toLowerCase().endsWith('_id'))

        const isUnique = isPrimary // Assuming primary keys are unique

        return new Column(
          field.name,
          field.type,
          this.mapBigQueryTypeToColumnType(field.type, field.mode),
          field.mode !== 'REQUIRED', // nullable if not REQUIRED
          isPrimary,
          isUnique,
          null, // BigQuery doesn't expose default values through this API
          false, // BigQuery doesn't have autoincrement in the same way as SQL databases
        )
      })
    } catch (error) {
      console.error(`Error fetching columns for ${database}.${table}:`, error)
      throw error
    }
  }

  fieldToResultColumn(field: any, modeOverride: string | null = null): ResultColumn {
    let type = this.mapBigQueryTypeToColumnType(field.type, modeOverride || field.mode)
    let mode = modeOverride || field.mode
    if (type === ColumnType.ARRAY) {
      let rval = {
        name: field.name,
        type: ColumnType.ARRAY,
        children: new Map([
          ['v', this.fieldToResultColumn(field, 'NOT_REPEATED')] as [string, ResultColumn],
        ]),
      }
      return rval
    }
    return {
      name: mode == 'NOT_REPEATED' ? 'v' : field.name,
      type: this.mapBigQueryTypeToColumnType(field.type, mode),
      children: field.fields
        ? new Map(
            field.fields.map(
              (f: any) => [f.name, this.fieldToResultColumn(f)] as [string, ResultColumn],
            ),
          )
        : undefined,
    }
  }

  processRow(row: any, headers: Map<string, ResultColumn>): any {
    let processedRow: Record<string, any> = {}
    const keys = Object.keys(row)
    const headerKeys = Array.from(headers.keys())
    keys.forEach((key, index) => {
      let column = headers.get(headerKeys[index])
      let label = headerKeys[index]
      let value = row[key].v
      if (column) {
        switch (column.type) {
          case ColumnType.INTEGER:
            processedRow[label] = value ? Number(value) : null
            break
          case ColumnType.FLOAT:
            const scale = column.scale || 0
            // Convert integer to float by dividing by 10^scale
            if (value !== null && value !== undefined) {
              const scaleFactor = Math.pow(10, scale)
              processedRow[label] = Number(value) / scaleFactor
            }
            break
          case ColumnType.DATE:
            processedRow[label] = value ? DateTime.fromISO(value) : null
            break
          case ColumnType.DATETIME:
            processedRow[label] = value ? parseTimestamp(value) : null
            break
          case ColumnType.ARRAY:
            const newv = value.map((item: any) => {
              // l i sthe constant returned by duckdb for the array
              return this.processRow({ v: item }, column.children!)
            })
            processedRow[label] = newv
            break
          case ColumnType.STRUCT:
            processedRow[label] = value
              ? this.processRow(arrayToObject(value.f), column.children!)
              : null
            break
          default:
            processedRow[label] = value
            break
        }
      }
    })
    return processedRow
  }
  async query_core(sql: string): Promise<Results> {
    try {
      const result = await this.fetchEndpoint(
        'queries',
        {
          query: sql,
          useLegacySql: false,
        },
        'POST',
      )

      // Map schema to headers
      const headers = new Map(
        result.schema.fields.map((field: any) => [field.name, this.fieldToResultColumn(field)]),
      ) as Map<string, ResultColumn>

      if (!result.rows) {
        return new Results(headers, [])
      }

      const rows = result.rows.map((row: any) => {
        return this.processRow(row.f, headers)
      })
      return new Results(headers, rows)
    } catch (error) {
      throw error
    }
  }

  private mapBigQueryTypeToColumnType(type: string, mode: string): ColumnType {
    if (mode === 'REPEATED') {
      return ColumnType.ARRAY
    }
    switch (type.toLowerCase()) {
      case 'record':
        return ColumnType.STRUCT
      case 'string':
      case 'bytes':
        return ColumnType.STRING
      case 'integer':
      case 'int64':
        return ColumnType.INTEGER
      case 'float':
      case 'float64':
        return ColumnType.FLOAT
      case 'boolean':
      case 'bool':
        return ColumnType.BOOLEAN
      case 'timestamp':
        return ColumnType.TIMESTAMP
      case 'datetime':
        return ColumnType.DATETIME
      case 'date':
        return ColumnType.DATE
      case 'time':
        return ColumnType.TIME
      default:
        return ColumnType.UNKNOWN
    }
  }
}
