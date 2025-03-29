import BaseConnection from './base'
import { Database, Table, Column, AssetType } from './base'
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

// Interface for Snowflake V1 API authentication
interface SnowflakeBasicAuth extends SnowflakeAuthBase {
  sessionToken?: string
  masterToken?: string
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
}

// Base Snowflake connection class
export abstract class SnowflakeConnectionBase extends BaseConnection {
  protected baseUrl: string
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
    this.baseUrl = `https://${account}.snowflakecomputing.com`
  }

  // Abstract methods to be implemented by subclasses
  abstract connect(): Promise<boolean>
  protected abstract getAuthHeaders(): Record<string, string>

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
  async query_core(sql: string, isRetry: boolean = false): Promise<Results> {
    // Ensure we have a valid token before proceeding
    if (!isRetry) {
      await this.connect()
    }

    try {
      // Submit the query and get results - implementation depends on auth type
      const resultData = await this.executeQuery(sql)

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
            console.log(headers.get(column.name))
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
        return this.query_core(sql, true)
      }
      throw error
    }
  }

  // Helper methods for subclasses to implement/override as needed
  protected abstract executeQuery(sql: string): Promise<any>
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

  async getTable(database: string, table: string): Promise<Table> {
    const sql = `DESCRIBE TABLE ${database}.${table}`
    return this.query_core(sql).then((results) => {
      const columns: Column[] = []
      results.headers.forEach((column) => {
        columns.push(
          new Column(column.name, column.type, column.type, false, false, false, null, false),
        )
      })
      return new Table(table, columns, null, AssetType.TABLE, null, database)
    })
  }

  async getTables(database: string): Promise<Table[]> {
    const sql = `SHOW TABLES IN DATABASE ${database}`
    return this.query_core(sql).then((results) => {
      const tables: Table[] = []
      results.data.forEach((row: any) => {
        tables.push(new Table(row.name || row['name'], [], row.comment, AssetType.TABLE, row.schema_name, database))
      })
      return tables
    })
  }

  async getColumns(database: string, table: string, schema:string| null): Promise<Column[]> {
    schema = schema || 'PUBLIC'
    const sql = `DESCRIBE TABLE ${database}.${schema}.${table}`

    return this.query_core(sql).then((results) => {
      const columns: Column[] = []
      results.data.forEach((row: any) => {
        console.log(row)
        let type = row.kind || row['kind']
        columns.push(
          new Column(
            row.name || row['name'],
            row.kind || row['kind'],
            type? this.mapSnowflakeTypeToColumnType({'type': type}) : ColumnType.UNKNOWN,
            (row.null || row['null']) === 'Y',
            (row.primary_key || row['primary_key']) === 'Y',
            (row.unique_key || row['unique_key']) === 'Y',
            row.default || row['default'],
            (row.autoincrement || row['autoincrement']) === 'Y',
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
  private config: SnowflakeJwtConfig
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
      privateKey: this.saveCredential ? this.config.privateKey : '',
      privateKeyPassphrase: this.saveCredential ? this.config.privateKeyPassphrase : '',
    }
  }

  setPrivateKey(privateKey: string): void {
    this.config.privateKey = privateKey
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
        await this.query_core('SELECT 1', true)
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

  protected async executeQuery(sql: string): Promise<any> {
    // Submit the SQL statement (v2 API)
    const submitResponse = await fetch(`${this.baseUrl}/api/v2/statements/`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        statement: sql,
        timeout: 60,
        database: this.config.database,
        schema: this.config.schema,
        warehouse: this.config.warehouse,
        role: this.config.role,
      }),
    })

    if (!submitResponse.ok) {
      const errorData = await submitResponse.json()
      throw new Error(`Query execution failed: ${errorData.message || submitResponse.statusText}`)
    }

    const submitData = await submitResponse.json()
    const statementHandle = submitData.statementHandle

    // Poll for query completion
    let statementStatus: StatementStatus
    do {
      await new Promise((resolve) => setTimeout(resolve, this.pollingInterval))

      const statusResponse = await fetch(`${this.baseUrl}/api/v2/statements/${statementHandle}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      })

      if (!statusResponse.ok) {
        const errorData = await statusResponse.json()
        throw new Error(
          `Query status check failed: ${errorData.message || statusResponse.statusText}`,
        )
      }

      statementStatus = await statusResponse.json()
    } while (statementStatus.status === 'running')

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

// Basic Auth Connection (v1 API)
export class SnowflakeBasicAuthConnection extends SnowflakeConnectionBase {
  private config: SnowflakeBasicConfig
  private auth: SnowflakeBasicAuth = {}

  // Singleton cache for basic auth tokens
  private static authCache: Record<string, SnowflakeBasicAuth> = {}

  constructor(
    name: string,
    config: SnowflakeBasicConfig,
    model?: string,
    saveCredential: boolean = false,
  ) {
    super(name, 'snowflake-basic', config.account, model, saveCredential)
    this.config = config
  }

  static fromJSON(fields: {
    name: string
    model: string | null
    saveCredential: boolean
    account: string
    username: string
    password: string
    warehouse: string
    role?: string
    database?: string
    schema?: string
  }): SnowflakeBasicAuthConnection {
    let conn = new SnowflakeBasicAuthConnection(
      fields.name,
      {
        account: fields.account,
        username: fields.username,
        password: fields.password,
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
      password: this.saveCredential ? this.config.password : '',
    }
  }

  setPassword(password: string): void {
    this.config.password = password
  }

  /**
   * Authenticate with Snowflake using username and password
   */
  private async authenticate(): Promise<SnowflakeBasicAuth> {
    try {
      // Create basic auth credentials
      const credentials = `${this.config.username}:${this.config.password}`
      const encodedCredentials = btoa(credentials)

      // Set up headers
      const headers = {
        Authorization: `Basic ${encodedCredentials}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'TrilogyStudio',
        'X-Requested-With': null,
      }

      // Create login request payload
      const data = {
        data: {
          ACCOUNT_NAME: this.config.account,
          LOGIN_NAME: this.config.username,
          PASSWORD: this.config.password,
        },
      }

      // Make the authentication request
      const response = await fetch(`${this.baseUrl}/session/v1/login-request`, {
        method: 'POST',
        // @ts-ignore
        headers: headers,
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Authentication failed: ${response.status} - ${errorText}`)
      }

      // Extract session token and master token from response
      const responseData = await response.json()
      const sessionToken = responseData.data?.token
      const masterToken = responseData.data?.masterToken

      if (!sessionToken || !masterToken) {
        throw new Error('Failed to get valid tokens from authentication response')
      }

      return {
        sessionToken,
        masterToken,
        expiresAt: Date.now() + 3600 * 1000 - 60000, // 1 hour minus 1 minute buffer
      }
    } catch (error) {
      throw error
    }
  }

  async connect(): Promise<boolean> {
    try {
      // Check cache for valid token
      const cacheKey = `${this.config.account}:${this.config.username}`
      if (
        SnowflakeBasicAuthConnection.authCache[cacheKey] &&
        SnowflakeBasicAuthConnection.authCache[cacheKey].expiresAt &&
        SnowflakeBasicAuthConnection.authCache[cacheKey].expiresAt > Date.now() &&
        SnowflakeBasicAuthConnection.authCache[cacheKey].sessionToken
      ) {
        this.auth = SnowflakeBasicAuthConnection.authCache[cacheKey]
        return true
      }

      // Authenticate and get tokens
      this.auth = await this.authenticate()

      // Verify token with test query
      try {
        await this.query_core('SELECT 1', true)
        // Cache the token if successful
        SnowflakeBasicAuthConnection.authCache[cacheKey] = this.auth
        return true
      } catch (error) {
        this.auth = {}
        throw new Error(`Authentication verification failed: ${error}`)
      }
    } catch (error) {
      throw error
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Snowflake Token="${this.auth.sessionToken}"`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'TypescriptRestExample/1.0',
    }
  }

  protected async executeQuery(sql: string): Promise<any> {
    // Generate a UUID for the request
    const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0,
          v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
    }

    // Create query request payload (v1 API)
    const payload = {
      sqlText: sql,
      asyncExec: true,
      sequenceId: 1,
      querySubmissionTime: Math.floor(Date.now() / 1000),
      bindings: {},
    }

    // Execute the query
    const queryUrl = `${this.baseUrl}/queries/v1/query-request?requestId=${generateUUID()}`

    const response = await fetch(queryUrl, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Query execution failed: ${errorData || response.statusText}`)
    }

    const responseData = await response.json()

    if (!responseData.data?.queryId || !responseData.data?.getResultUrl) {
      throw new Error('Invalid query response: missing queryId or result URL')
    }

    // Poll for query completion
    await this.pollForResults(responseData.data.queryId)

    // Get results when query is completed
    return this.getResults(responseData.data.getResultUrl)
  }

  private async pollForResults(queryId: string): Promise<void> {
    const maxAttempts = 10
    let attempt = 0

    while (attempt < maxAttempts) {
      const response = await fetch(`${this.baseUrl}/monitoring/queries/${queryId}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Error polling for results: ${response.status} - ${errorText}`)
      }

      const status = await response.json()

      // Check if query is complete
      if (status.status === 'success') {
        return
      } else if (status.status === 'failed') {
        throw new Error(`Query execution failed: ${status.message || 'Unknown error'}`)
      }

      // Still processing, wait and retry
      attempt++
      await new Promise((resolve) => setTimeout(resolve, this.pollingInterval))
    }

    throw new Error('Max polling attempts reached, query results not available')
  }

  private async getResults(resultUrl: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}${resultUrl}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Error getting results: ${response.status} - ${errorText}`)
    }

    return await response.json()
  }

  protected extractMetadata(resultData: any): any[] {
    return resultData.data?.rowtype || []
  }

  protected extractRows(resultData: any): any[][] {
    return resultData.data?.rowset || []
  }

  protected getSchema(): string | undefined {
    return this.config.schema
  }

  async close(): Promise<void> {
    // Clear auth data
    this.auth = {}
  }
}
