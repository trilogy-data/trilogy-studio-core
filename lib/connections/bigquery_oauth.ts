import BaseConnection from './base'
import { Database, Schema, Table, Column, EscapePlaceholder } from './base'
import { Results, ColumnType } from '../editors/results'
import type { ResultColumn } from '../editors/results'
import { DateTime } from 'luxon'
import { AssetType } from './base'

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
  public browsingProjectId: string

  // Store active query jobs for potential cancellation
  private activeJobs: Map<string, string> = new Map() // Maps identifier to jobId

  constructor(name: string, projectId: string, model?: string, browsingProjectId?: string) {
    super(name, 'bigquery-oauth', false, model)
    this.projectId = projectId
    this.browsingProjectId = browsingProjectId ? browsingProjectId : projectId
    this.query_type = 'bigquery'
  }

  toJSON(): object {
    return {
      name: this.name,
      type: this.type,
      model: this.model,
      projectId: this.projectId,
      browsingProjectId: this.browsingProjectId,
    }
  }

  static fromJSON(fields: {
    name: string
    projectId: string
    model: string | undefined
    browsingProjectId: string | undefined
  }): BigQueryOauthConnection {
    let base = new BigQueryOauthConnection(
      fields.name,
      fields.projectId,
      fields.model,
      fields.browsingProjectId,
    )
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
        throw error
      }
    })
  }

  async fetchEndpoint(endpoint: string, args: any, method: string): Promise<any> {
    let projectId = this.projectId
    if (endpoint.startsWith('datasets')) {
      // If the endpoint is for datasets, use the browsing project ID
      projectId = this.browsingProjectId
    }
    let response = null
    if (method == 'GET') {
      response = await fetch(
        `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/${endpoint}`,
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
        `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/${endpoint}`,
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
    // TODO: support multiple BQ projects
    try {
      const databases: Database[] = [new Database(this.browsingProjectId, [])]
      this.databases = databases // Store in the connection instance
      console.log('Fetched databases:', databases)
      return new Promise((resolve) => resolve(databases))
    } catch (error) {
      console.error('Error fetching databases:', error)
      throw error
    }
  }

  async getSchemas(database: string): Promise<Schema[]> {
    try {
      const data = await this.fetchEndpoint(`datasets`, {}, 'GET')
      const schemas: Schema[] = []
      for (const schema of data.datasets || []) {
        const schemaId = schema.datasetReference.datasetId
        const tables: Table[] = []
        schemas.push(new Schema(schemaId, tables, this.browsingProjectId))
      }
      return schemas
    } catch (error) {
      console.error(`Error fetching schemas for database ${database}:`, error)
      throw error
    }
  }

  async getTables(database: string, schema: string): Promise<Table[]> {
    try {
      const tables: Table[] = []
      let pageToken: string | undefined = undefined

      // Continue fetching tables until there are no more pages
      do {
        // Add pageToken to the endpoint if available
        const endpoint = pageToken
          ? `datasets/${schema}/tables?pageToken=${pageToken}`
          : `datasets/${schema}/tables`

        const data = await this.fetchEndpoint(endpoint, {}, 'GET')

        // Process tables from current page
        for (const table of data.tables || []) {
          const tableId = table.tableReference.tableId
          const columns: Column[] = []
          tables.push(
            new Table(
              tableId,
              schema,
              database,
              columns,
              '',
              table.type === 'VIEW' ? AssetType.VIEW : AssetType.TABLE,
            ),
          )
        }

        // Update pageToken for next iteration
        pageToken = data.nextPageToken
      } while (pageToken)

      return tables
    } catch (error) {
      console.error(`Error fetching tables for database ${database}:`, error)
      throw error
    }
  }

  async getTableSample(database: string, schema: string, table: string, limit: number = 100) {
    const sql = `SELECT * FROM \`${database}.${schema}.${table}\` LIMIT ${limit}`
    return this.query(sql, {}, `sample_${database}_${table}`)
  }

  async getTable(database: string, schema: string, table: string): Promise<Table> {
    try {
      return await this.getTableData(database, schema, table)
    } catch (error) {
      console.error(`Error fetching table ${database}.${schema}.${table}:`, error)
      throw error
    }
  }

  private tableToColumns(tableData: any): Column[] {
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
        field.description || '', // Assuming description is available in the schema
      )
    })
  }

  private async getTableData(database: string, schema: string, table: string): Promise<Table> {
    const tableData = await this.fetchEndpoint(`datasets/${schema}/tables/${table}`, {}, 'GET')
    const columns = this.tableToColumns(tableData)
    const assetType = tableData.type === 'VIEW' ? AssetType.VIEW : AssetType.TABLE
    return new Table(table, schema, database, columns, tableData.description, assetType)
  }

  async getColumns(database: string, schema: string, table: string): Promise<Column[]> {
    return this.getTable(database, schema, table).then((t) => {
      return t.columns
    })
  }

  fieldToResultColumn(field: any, modeOverride: string | null = null): ResultColumn {
    let type = this.mapBigQueryTypeToColumnType(field.type, modeOverride || field.mode)
    let mode = modeOverride || field.mode
    if (type === ColumnType.ARRAY) {
      let rval = {
        name: field.name,
        type: ColumnType.ARRAY,
        scale: field.scale ? Number.parseInt(field.scale) : undefined,
        precision: field.precision ? Number.parseInt(field.precision) : undefined,
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
          case ColumnType.TIMESTAMP:
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

  // Method to wait for job completion using exponential backoff
  private async pollJobCompletion(jobId: string, location: string = 'US'): Promise<any> {
    let currentPollingIntervalMs = this.initialPollingIntervalMs
    let totalWaitTimeMs = 0
    let lastTimePolled = Date.now()
    let pollCount = 0

    while (totalWaitTimeMs < this.maxTotalWaitTimeMs) {
      // Calculate actual time waited since last poll
      const actualTimeWaited = Date.now() - lastTimePolled
      totalWaitTimeMs += actualTimeWaited

      // Check job status
      console.log(
        `Polling job ${jobId} - poll #${++pollCount}, waited ${currentPollingIntervalMs}ms`,
      )

      let endpoint = `queries/${jobId}?timeoutMs=10000`
      if (location && location !== 'US') {
        endpoint += `&location=${location}`
      }

      const jobDetails = await this.fetchEndpoint(endpoint, null, 'GET')

      // Record time after polling
      lastTimePolled = Date.now()

      if (jobDetails.jobComplete) {
        if (jobDetails.errors && jobDetails.errors.length > 0) {
          throw new Error(`Query failed: ${jobDetails.errors[0].message}`)
        }

        console.log(
          `Job ${jobId} completed successfully after ${pollCount} polls (${totalWaitTimeMs / 1000} seconds total)`,
        )
        // Return the results directly
        return jobDetails
      }

      // Get job progress if available
      if (
        jobDetails.statistics &&
        jobDetails.statistics.query &&
        jobDetails.statistics.query.totalBytesProcessed
      ) {
        const bytesProcessed = parseInt(jobDetails.statistics.query.totalBytesProcessed)
        const formattedBytes =
          bytesProcessed >= 1024 * 1024 * 1024
            ? `${(bytesProcessed / (1024 * 1024 * 1024)).toFixed(2)} GB`
            : bytesProcessed >= 1024 * 1024
              ? `${(bytesProcessed / (1024 * 1024)).toFixed(2)} MB`
              : `${(bytesProcessed / 1024).toFixed(2)} KB`

        console.log(`Job ${jobId} in progress - ${formattedBytes} processed so far`)
      }

      // Calculate next polling interval with exponential backoff
      currentPollingIntervalMs = Math.min(
        currentPollingIntervalMs * this.backoffFactor,
        this.maxPollingIntervalMs,
      )

      // Wait for the next polling interval
      await this.sleep(currentPollingIntervalMs)
    }

    throw new Error(
      `Query timed out after ${totalWaitTimeMs / 1000} seconds (${pollCount} polling attempts)`,
    )
  }

  // Helper method to implement sleep/delay
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  replaceEscapedStrings(sql: string): string {
    // Replace escaped single quote placeholder with the language appropriate escape path
    return sql.replace(new RegExp(EscapePlaceholder, 'g'), "\\'")
  }

  async query_core(
    sql: string,
    parameters: Record<string, any> | null = null,
    identifier: string | null = null,
  ): Promise<Results> {
    //@ts-ignore
    let _ = parameters

    if (!this.projectId) {
      throw new Error('Cannot run BigQuery queries without a billing project set.')
    }
    const queryId =
      identifier || `query_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    try {
      // Initial query submission
      const initialResult = await this.fetchEndpoint(
        'queries',
        {
          query: sql,
          useLegacySql: false,
        },
        'POST',
      )

      // Store the job ID with the query identifier for potential cancellation
      if (initialResult.jobReference && initialResult.jobReference.jobId) {
        this.activeJobs.set(queryId, initialResult.jobReference.jobId)
        console.log(`Registered query ${queryId} with job ID ${initialResult.jobReference.jobId}`)
      }

      // Check if the query completed immediately
      if (initialResult.jobComplete) {
        // Process results as before if job completed immediately
        let headers = new Map() as Map<string, ResultColumn>
        if (initialResult.schema) {
          headers = new Map(
            initialResult.schema.fields.map((field: any) => [
              field.name,
              this.fieldToResultColumn(field),
            ]),
          ) as Map<string, ResultColumn>
        }

        if (!initialResult.rows) {
          return new Results(headers, [])
        }

        const rows = initialResult.rows.map((row: any) => {
          return this.processRow(row.f, headers)
        })

        return new Results(headers, rows)
      } else {
        // Query is running - need to poll for completion
        console.log(`Query running as job ${initialResult.jobReference.jobId}`)

        // Poll until job completes
        const completedResult = await this.pollJobCompletion(
          initialResult.jobReference.jobId,
          initialResult.jobReference.location,
        )

        // Process results after polling
        const headers = new Map(
          completedResult.schema.fields.map((field: any) => [
            field.name,
            this.fieldToResultColumn(field),
          ]),
        ) as Map<string, ResultColumn>

        if (!completedResult.rows) {
          return new Results(headers, [])
        }

        const rows = completedResult.rows.map((row: any) => {
          return this.processRow(row.f, headers)
        })

        return new Results(headers, rows)
      }
    } catch (error) {
      console.error('Error executing query:', error)
      throw error
    } finally {
      // Remove the job from active jobs
      this.activeJobs.delete(queryId)
    }
  }

  // Add a new method for cancelling a running query
  async cancelQuery(identifier: string): Promise<boolean> {
    const jobId = this.activeJobs.get(identifier)
    if (!jobId) {
      console.log(`No active job found for query identifier ${identifier}`)
      return false
    }

    try {
      await this.fetchEndpoint(`jobs/${jobId}/cancel`, {}, 'POST')
      console.log(`Successfully requested cancellation for job ${jobId}`)
      this.activeJobs.delete(identifier)
      return true
    } catch (error) {
      console.error(`Error cancelling job ${jobId}:`, error)
      return false
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
      case 'numeric':
      case 'decimal':
      case 'bignumeric':
        return ColumnType.NUMERIC
      default:
        return ColumnType.UNKNOWN
    }
  }
}
