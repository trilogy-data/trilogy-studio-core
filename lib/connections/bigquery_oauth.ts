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

  // Store active query jobs for potential cancellation
  private activeJobs: Map<string, string> = new Map() // Maps identifier to jobId

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
    return this.query(sql, {}, `sample_${database}_${table}`)
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

      // FIXED: Use the correct endpoint for getting query results
      // Adding query parameters for timeoutMs to optimize waiting time
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

  async query_core(
    sql: string,
    parameters: Record<string, any> | null = null,
    identifier: string | null = null,
  ): Promise<Results> {
    //@ts-ignore
    let _ = parameters
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
        const headers = new Map(
          initialResult.schema.fields.map((field: any) => [
            field.name,
            this.fieldToResultColumn(field),
          ]),
        ) as Map<string, ResultColumn>

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
      default:
        return ColumnType.UNKNOWN
    }
  }
}
