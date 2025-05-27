import BaseConnection from './base'
import { Database, Schema, Table, Column, AssetType } from './base'
import { Results, ColumnType } from '../editors/results'
import type { ResultColumn } from '../editors/results'
import { DateTime } from 'luxon'
import { SignJWT, importPKCS8 } from 'jose'

// Interface for Snowflake column type information
interface SnowflakeType {
  type: string
  precision?: number
  scale?: number
}

// Base auth interface
interface SnowflakeAuthBase {
  expiresAt?: number
}

// Interface for Snowflake V2 JWT API authentication
interface SnowflakeJwtAuth extends SnowflakeAuthBase {
  accessToken?: string
}

// Base config interface
interface SnowflakeConfigBase {
  account: string
  username: string
  warehouse: string
  role?: string
  database?: string
  schema?: string
}

// Interface for JWT connection config
export interface SnowflakeJwtConfig extends SnowflakeConfigBase {
  privateKey: string
  privateKeyPassphrase?: string
}

// Interface for Basic Auth connection config
export interface SnowflakeBasicConfig extends SnowflakeConfigBase {
  password: string
}

// Interface for statement status response
interface StatementStatus {
  status: 'running' | 'success' | 'failed' | 'aborting' | 'aborted'
  message?: string
  resultSetMetaData?: any
  data?: any[]
  code?: number
}

interface SnowflakeQueryResult {
  statementHandles?: string[]
  resultSetMetaData?: {
    rowType: any[]
  }
  data?: any[]
}

// Base Snowflake connection class
export abstract class SnowflakeConnectionBase extends BaseConnection {
  config: SnowflakeConfigBase
  protected pollingInterval: number = 500 // ms

  constructor(
    name: string,
    type: string,
    account: string,
    model?: string,
    saveCredential: boolean = false,
  ) {
    super(name, type, false, model, saveCredential)
    this.query_type = 'snowflake'
    this.config = {
      account: account,
      username: '',
      warehouse: '',
      role: '',
    }
  }

  // Abstract methods to be implemented by subclasses
  abstract connect(): Promise<boolean>
  protected abstract getAuthHeaders(): Record<string, string>

  baseURL(): string {
    // Return the base URL for the Snowflake API
    return `https://${this.config.account}.snowflakecomputing.com`
  }

  objectToType(obj: any) {
    // Determine the type of the object for mapping to ColumnType
    if (obj === null) {
      return ColumnType.STRING // Default to string for null values
    } else if (typeof obj === 'string') {
      return ColumnType.STRING
    } else if (typeof obj === 'number') {
      return Number.isInteger(obj) ? ColumnType.INTEGER : ColumnType.FLOAT
    } else if (typeof obj === 'boolean') {
      return ColumnType.BOOLEAN
    } else if (obj instanceof Date) {
      return ColumnType.DATETIME
    } else if (Array.isArray(obj)) {
      return ColumnType.ARRAY
    } else if (typeof obj === 'object') {
      return ColumnType.STRUCT
    }
    return ColumnType.UNKNOWN
  }
  columnsFromObject(val: any): Map<string, ResultColumn> {
    // Create a map of columns from an object
    const headers = new Map<string, ResultColumn>()
    if (typeof val !== 'object' || val === null) {
      return headers
    }
    // Iterate over the keys in the object
    Object.keys(val).forEach((key) => {
      let value = val[key]
      let type: ColumnType = ColumnType.UNKNOWN
      let children = undefined

      if (value === null) {
        type = ColumnType.STRING // Default to string for null values
      } else if (typeof value === 'string') {
        type = ColumnType.STRING
      } else if (typeof value === 'number') {
        type = Number.isInteger(value) ? ColumnType.INTEGER : ColumnType.FLOAT
      } else if (typeof value === 'boolean') {
        type = ColumnType.BOOLEAN
      } else if (value instanceof Date) {
        type = ColumnType.DATETIME
      } else if (Array.isArray(value)) {
        // Handle arrays
        type = ColumnType.ARRAY
        const child_type = value.length > 0 ? this.objectToType(value[0].v) : ColumnType.STRING
        let child_type_children = undefined
        if (child_type === ColumnType.STRUCT) {
          // If the array contains objects, process the first object to determine the structure
          // Use the first element to determine the type of the children
          child_type_children = this.columnsFromObject(value[0].v)
        }
        children = new Map([['v', { name: 'v', type: child_type, children: child_type_children }]]) // Assuming array of objects or primitives, use the first element to determine type
      } else if (typeof value === 'object') {
        type = ColumnType.STRUCT
        children = this.columnsFromObject(value) // Process the object to get its structure
      }

      headers.set(key, {
        name: key,
        type: type,
        description: '',
        children: children,
      })
    })
    return headers
  }

  processRawJSON(val: any): any {
    // turn any array values into an array of objects with a single key 'v' to match the expected format for arrays

    if (Array.isArray(val)) {
      return val.map((item) => {
        // Process each item in the array
        return { v: this.processRawJSON(item) } // Wrap each item in an object with key 'v'
      })
    } else if (typeof val === 'object' && val !== null) {
      const processedObj: any = {}
      Object.keys(val).forEach((key) => {
        processedObj[key] = this.processRawJSON(val[key])
      })
      return processedObj
    }
    return val // Return the value as-is if it's not an array or object
  }

  processValue(val: any, column: ResultColumn) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!val) {
      return val
    } else if (column.type === ColumnType.DATE) {
      return DateTime.fromMillis(val * 1000, { zone: tz })
    } else if (column.type === ColumnType.DATETIME) {
      return DateTime.fromMillis(val * 1000, { zone: tz })
    } else if (column.type === ColumnType.ARRAY) {
      let base = JSON.parse(val.replace(/undefined/g, 'null'))
      return this.processRawJSON(base)
    } else if (column.type === ColumnType.INTEGER) {
      return Number(val)
    } else if (column.type === ColumnType.FLOAT) {
      return Number(val)
    } else if (column.type === ColumnType.BOOLEAN) {
      return val == 'true'
    } else if (column.type === ColumnType.STRING) {
      return val
    } else if (column.type === ColumnType.STRUCT) {
      let base = JSON.parse(val.replace(/undefined/g, 'null'))

      return this.processRawJSON(base)
    }
    return val
  }
  async query_core(
    sql: string,
    parameters: Record<string, any> | null = null,
    identifier: string | null = null,
    isRetry: boolean = false,
  ): Promise<Results> {
    // Ensure we have a valid token before proceeding
    if (!isRetry) {
      await this.connect()
    }

    try {
      // Submit the query and get results - implementation depends on auth type
      let resultData = await this.executeQuery(sql)
      if (resultData.statementHandles) {
        resultData = await this.fetchQueryResults(
          resultData.statementHandles[resultData.statementHandles.length - 1],
        )
      }

      // Extract metadata and data
      const resultMetadata = this.extractMetadata(resultData)
      const rows = this.extractRows(resultData)

      // Map column metadata to headers
      const headers = new Map<string, ResultColumn>()
      resultMetadata.forEach((column: any) => {
        let type = this.mapSnowflakeTypeToColumnType({
          type: column.type,
          precision: column.precision,
          scale: column.scale,
        })
        let children = undefined
        if (type === ColumnType.ARRAY) {
          children = new Map([['v', { name: 'v', type: ColumnType.STRING }]])
        }
        headers.set(column.name, {
          name: column.name,
          type,
          description: '',
          precision: column.precision,
          scale: column.scale,
          children: children,
        })
      })
      // Map rows to objects with column names as keys
      let headerLookup = Array.from(headers.values())
      const data = rows.map((row: any[]) => {
        const rowObj: any = {}

        headerLookup.forEach((column: any, index: number) => {
          rowObj[column.name] = this.processValue(row[index], column)

          if (column.type === ColumnType.STRUCT) {
            let lookup = headers.get(column.name)
            if (lookup) {
              lookup.children = this.columnsFromObject(rowObj[column.name])
            }
          }
        })
        return rowObj
      })

      return new Results(headers, data)
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('401') || error.message.includes('403')) &&
        !isRetry
      ) {
        // If auth expired, reconnect and retry
        await this.connect()
        return this.query_core(sql, parameters, identifier, true)
      }
      throw error
    }
  }

  // Helper methods for subclasses to implement/override as needed
  protected abstract executeQuery(sql: string): Promise<SnowflakeQueryResult>
  protected abstract fetchQueryResults(statementHandle: string): Promise<SnowflakeQueryResult>
  protected abstract extractMetadata(resultData: any): any[]
  protected abstract extractRows(resultData: any): any[][]

  protected mapSnowflakeTypeToColumnType(snowflakeType: SnowflakeType): ColumnType {
    // Map Snowflake types to our ColumnType enum
    const typeName = snowflakeType.type.toUpperCase()

    if (
      typeName.includes('VARCHAR') ||
      typeName.includes('TEXT') ||
      typeName.includes('CHAR') ||
      typeName.includes('STRING')
    ) {
      return ColumnType.STRING
    } else if (
      typeName.includes('NUMBER') ||
      typeName.includes('INT') ||
      (typeName === 'NUMBER' && (!snowflakeType.scale || snowflakeType.scale === 0))
    ) {
      return ColumnType.INTEGER
    } else if (
      typeName.includes('FLOAT') ||
      typeName === 'FIXED' ||
      typeName.includes('DOUBLE') ||
      typeName === 'REAL' ||
      (typeName === 'NUMBER' && (snowflakeType.scale || 0) > 0)
    ) {
      return ColumnType.FLOAT
    } else if (typeName === 'BOOLEAN') {
      return ColumnType.BOOLEAN
    } else if (typeName === 'DATE') {
      return ColumnType.DATE
    } else if (typeName.includes('TIMESTAMP') || typeName.includes('DATETIME')) {
      return ColumnType.DATETIME
    } else if (typeName == 'ARRAY') {
      return ColumnType.ARRAY
    } else if (typeName == 'OBJECT') {
      return ColumnType.STRUCT
    } else if (typeName.includes('VARIANT') || typeName.includes('JSON')) {
      return ColumnType.STRUCT // Treat VARIANT/JSON as STRUCT for flexibility
    } else {
      console.log('Unknown Snowflake type:', typeName)
      return ColumnType.UNKNOWN
    }
  }

  async getDatabases(): Promise<Database[]> {
    const sql = 'SHOW DATABASES'
    return this.query_core(sql).then((results) => {
      const databases: Database[] = []
      results.data.forEach((row: any) => {
        databases.push(new Database(row.name || row['name'], []))
      })
      return databases
    })
  }

  async getTable(database: string, schema: string, table: string): Promise<Table> {
    const sql = `DESCRIBE TABLE ${database}.${table}`
    return this.query_core(sql).then((results) => {
      const columns: Column[] = []
      results.headers.forEach((column) => {
        columns.push(
          new Column(column.name, column.type, column.type, false, false, false, null, false),
        )
      })
      return new Table(table, schema, database, columns, null, AssetType.TABLE)
    })
  }

  async getTables(database: string, schema: string): Promise<Table[]> {
    const sql = `SHOW TABLES IN DATABASE ${database}`
    return this.query_core(sql).then((results) => {
      const tables: Table[] = []
      results.data.forEach((row: any) => {
        tables.push(
          new Table(
            row.name || row['name'],
            row.schema_name,
            database,
            [],
            row.comment,
            AssetType.TABLE,
          ),
        )
      })
      return tables.filter((t) => t.schema === schema)
    })
  }
  async getSchemas(database: string): Promise<Schema[]> {
    const sql = `SHOW SCHEMAS IN DATABASE ${database}`
    return this.query_core(sql).then((results) => {
      const schemas: Schema[] = []
      results.data.forEach((row: any) => {
        schemas.push(new Schema(row.name || row['name'], [], database))
      })
      return schemas
    })
  }
  async getColumns(database: string, schema: string, table: string): Promise<Column[]> {
    schema = schema || 'PUBLIC'
    const sql = `DESCRIBE TABLE ${database}.${schema}.${table}`

    return this.query_core(sql).then((results) => {
      const columns: Column[] = []
      results.data.forEach((row: any) => {
        console.log('Row:', row)
        let type = row.type
        columns.push(
          new Column(
            row.name,
            row.type,
            type ? this.mapSnowflakeTypeToColumnType({ type: type }) : ColumnType.UNKNOWN,
            row.null === 'Y',
            row.primary_key === 'Y',
            row.unique_key === 'Y',
            row.default,
            row.autoincrement === 'Y',
          ),
        )
      })
      return columns
    })
  }

  protected abstract getSchema(): string | undefined

  async close(): Promise<void> {
    // To be implemented by subclasses
  }
}

// JWT-based Connection (v2 API)
export class SnowflakeJwtConnection extends SnowflakeConnectionBase {
  config: SnowflakeJwtConfig
  private auth: SnowflakeJwtAuth = {}

  // Singleton cache for JWT auth tokens
  private static authCache: Record<string, SnowflakeJwtAuth> = {}

  constructor(
    name: string,
    config: SnowflakeJwtConfig,
    model?: string,
    saveCredential: boolean = false,
  ) {
    super(name, 'snowflake', config.account, model, saveCredential)
    this.config = config
  }

  static fromJSON(fields: {
    name: string
    model: string | null
    saveCredential: boolean
    account: string
    username: string
    privateKey: string
    privateKeyPassphrase?: string
    warehouse: string
    role?: string
    database?: string
    schema?: string
  }): SnowflakeJwtConnection {
    let conn = new SnowflakeJwtConnection(
      fields.name,
      {
        account: fields.account,
        username: fields.username,
        privateKey: fields.privateKey,
        privateKeyPassphrase: fields.privateKeyPassphrase,
        warehouse: fields.warehouse,
        role: fields.role,
        database: fields.database,
        schema: fields.schema,
      },
      fields.model ? fields.model : undefined,
      fields.saveCredential,
    )

    if (fields.model) {
      conn.model = fields.model
    }
    return conn
  }

  toJSON(): object {
    return {
      name: this.name,
      type: this.type,
      model: this.model,
      account: this.config.account,
      username: this.config.username,
      warehouse: this.config.warehouse,
      role: this.config.role,
      database: this.config.database,
      schema: this.config.schema,
      saveCredential: this.saveCredential,
      privateKey: this.saveCredential ? 'saved' : '',
    }
  }

  // @ts-ignore
  cancelQuery(identifier: string): Promise<boolean> {
    throw new Error('Method not implemented.')
  }

  setPrivateKey(privateKey: string): void {
    this.config.privateKey = privateKey
  }

  // integrate with generic interface
  getSecret(): string | null {
    return this.config.privateKey
  }

  setSecret(secret: string): void {
    this.config.privateKey = secret
  }

  /**
   * Generate JWT token for Snowflake authentication
   */
  private async generateJwtToken(): Promise<string> {
    try {
      // Import the PEM private key
      const privateKeyPem = this.config.privateKey
      const privateKey = await importPKCS8(privateKeyPem, 'RS256', { extractable: true })

      // Extract public key for fingerprint
      const jwk = await crypto.subtle.exportKey('jwk', privateKey)
      delete jwk.d
      delete jwk.dp
      delete jwk.dq
      delete jwk.q
      delete jwk.qi
      jwk.key_ops = ['encrypt', 'wrapKey', 'verify']

      // Import public key
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        true,
        ['verify'],
      )

      // Export public key and create fingerprint
      let spkiKey = await crypto.subtle.exportKey('spki', publicKey)
      const hashBuffer = await crypto.subtle.digest('SHA-256', spkiKey)

      // Convert the hash to base64
      function arrayBufferToBase64(buffer: ArrayBuffer) {
        const binary = String.fromCharCode(...new Uint8Array(buffer))
        return btoa(binary)
      }

      // Create the fingerprint and qualified username
      const publicKeyFingerprint = 'SHA256:' + arrayBufferToBase64(hashBuffer)
      const qualifiedUsernamePublicPrefix = `${this.config.account}.${this.config.username}.${publicKeyFingerprint}`
      const qualifiedUsername = `${this.config.account}.${this.config.username}`

      // Generate JWT payload
      const payload = {
        iss: qualifiedUsernamePublicPrefix,
        sub: qualifiedUsername,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // Token valid for 1 hour
      }

      // Sign the JWT
      const jwt = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256' })
        .setExpirationTime('1h')
        .sign(privateKey)

      return jwt
    } catch (error) {
      throw error
    }
  }

  async connect(): Promise<boolean> {
    try {
      // Check cache for valid token
      const cacheKey = `${this.config.account}:${this.config.username}`
      if (
        SnowflakeJwtConnection.authCache[cacheKey] &&
        SnowflakeJwtConnection.authCache[cacheKey].expiresAt &&
        SnowflakeJwtConnection.authCache[cacheKey].expiresAt > Date.now()
      ) {
        this.auth = SnowflakeJwtConnection.authCache[cacheKey]
        return true
      }

      // Generate JWT token
      const token = await this.generateJwtToken()
      this.auth = {
        accessToken: token,
        expiresAt: Date.now() + 60 * 60 * 1000 - 60000, // 1 hour minus 1 minute buffer
      }

      // Verify token with test query
      try {
        await this.query_core('SELECT 1', {}, null, true)
        // Cache the token if successful
        SnowflakeJwtConnection.authCache[cacheKey] = this.auth
        return true
      } catch (error) {
        this.auth = {}
        throw new Error(`Authentication failed: ${error}`)
      }
    } catch (error) {
      throw error
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.auth.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
    }
  }

  protected async fetchQueryResults(statementHandle: string): Promise<SnowflakeQueryResult> {
    // Fetch the results of the query using the statement handle
    const response = await fetch(`${this.baseURL()}/api/v2/statements/${statementHandle}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`Query result fetch failed: ${errorData.message || response.statusText}`)
    }

    return await response.json()
  }

  protected async executeQuery(sql: string): Promise<any> {
    // Submit the SQL statement (v2 API)
    const submitResponse = await fetch(`${this.baseURL()}/api/v2/statements/`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        statement: sql,
        timeout: this.maxTotalWaitTimeMs / 1000,
        database: this.config.database,
        schema: this.config.schema,
        warehouse: this.config.warehouse,
        role: this.config.role,
        parameters: {
          MULTI_STATEMENT_COUNT: '0',
        },
      }),
    })

    if (!submitResponse.ok) {
      const errorData = await submitResponse.json()
      throw new Error(`Query execution failed: ${errorData.message || submitResponse.statusText}`)
    }

    const submitData = await submitResponse.json()
    const statementHandle = submitData.statementHandle

    // Poll for query completion
    let statementStatus: StatementStatus = {
      status: 'running',
      code: 202,
    }
    let currentPollingIntervalMs = this.pollingInterval
    let totalWaitTimeMs = 0
    let lastTimePolled = Date.now()
    let pollCount = 0
    let errorCount = 0
    do {
      await new Promise((resolve) => setTimeout(resolve, currentPollingIntervalMs))
      pollCount++
      lastTimePolled = Date.now()
      try {
        const statusResponse = await fetch(
          `${this.baseURL()}/api/v2/statements/${statementHandle}`,
          {
            method: 'GET',
            headers: this.getAuthHeaders(),
          },
        )
        // if the response isn't okay, we just poll again, with some sanity
        if (statusResponse.ok) {
          errorCount = 0
          statementStatus = await statusResponse.json()
          statementStatus.code = statusResponse.status
        } else {
          errorCount++
          if (errorCount > 5) {
            throw new Error(
              `Query execution failed: ${statusResponse.status} - ${statusResponse.statusText}`,
            )
          }
        }
      } catch (error) {
        errorCount++
        if (errorCount > 5) {
          throw new Error(`Query execution failed: ${error}`)
        }
      }
      // Calculate next polling interval with exponential backoff
      currentPollingIntervalMs = Math.min(
        currentPollingIntervalMs * this.backoffFactor,
        this.maxPollingIntervalMs,
      )
      const actualTimeWaited = Date.now() - lastTimePolled
      totalWaitTimeMs += actualTimeWaited
      if (totalWaitTimeMs > this.maxTotalWaitTimeMs) {
        throw new Error('Query execution timed out')
      }
    } while (statementStatus.code === 202)

    if (statementStatus.status === 'failed') {
      throw new Error(`Query execution failed: ${statementStatus.message || 'Unknown error'}`)
    }

    return statementStatus
  }

  protected extractMetadata(resultData: any): any[] {
    return resultData.resultSetMetaData?.rowType || []
  }

  protected extractRows(resultData: any): any[][] {
    return resultData.data || []
  }

  protected getSchema(): string | undefined {
    return this.config.schema
  }

  async close(): Promise<void> {
    // Clear auth data
    this.auth = {}
  }
}
