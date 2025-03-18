import BaseConnection from './base'
import { Database, Table, Column } from './base'
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

// Interface for Snowflake API authentication
interface SnowflakeAuth {
  accessToken?: string
  expiresAt?: number
}

// Updated interface for connection config to use private key instead of password
interface SnowflakeConfig {
  account: string
  username: string
  privateKey: string
  privateKeyPassphrase?: string
  warehouse: string
  role?: string
  database?: string
  schema?: string
}

// Interface for statement status response
interface StatementStatus {
  statementHandle: string
  status: 'running' | 'success' | 'failed' | 'aborting' | 'aborted'
  message?: string
  resultSetMetaData?: any
  data?: any[]
}

// Singleton cache for Snowflake auth tokens
const authCache: Record<string, SnowflakeAuth> = {}

// Helper methods for debugging
// function spkiToPem(spkiBuffer: ArrayBuffer): string {
//     const base64 = arrayBufferToBase64(spkiBuffer);
//     const formattedBase64 = base64.match(/.{1,64}/g)?.join("\n"); // Format with newlines every 64 chars
//     return `-----BEGIN PUBLIC KEY-----\n${formattedBase64}\n-----END PUBLIC KEY-----`;
// }
// const publicKeyPem = spkiToPem(spkiKey);

export default class SnowflakeRestConnection extends BaseConnection {
  private config: SnowflakeConfig
  private baseUrl: string
  private auth: SnowflakeAuth = {}
  private pollingInterval: number = 500 // ms

  setPrivateKey(privateKey: string): void {
    this.config.privateKey = privateKey
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
  }): SnowflakeRestConnection {
    let base = new SnowflakeRestConnection(
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
      base.model = fields.model
    }
    return base
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

  constructor(
    name: string,
    config: SnowflakeConfig,
    model?: string,
    saveCredential: boolean = false,
  ) {
    super(name, 'snowflake', false, model, saveCredential)
    this.query_type = 'snowflake'
    this.config = config
    this.baseUrl = `https://${config.account}.snowflakecomputing.com/api`
  }

  /**
   * Generate JWT token for Snowflake authentication using browser-compatible methods
   */
  private async generateJwtToken(): Promise<string> {
    try {
      // Load the PEM private key
      const privateKeyPem = this.config.privateKey

      // Convert PEM private key to a JWK format key
      const privateKey = await importPKCS8(privateKeyPem, 'RS256', { extractable: true })

      // Prepare the qualified username (account.username)
      const jwk = await crypto.subtle.exportKey('jwk', privateKey)
      // remove private data from JWK
      delete jwk.d
      delete jwk.dp
      delete jwk.dq
      delete jwk.q
      delete jwk.qi
      jwk.key_ops = ['encrypt', 'wrapKey', 'verify']

      // import public key
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        true,
        ['verify'],
      )

      let spkiKey = await crypto.subtle.exportKey('spki', publicKey)

      // Convert the exported public key to PEM format

      const hashBuffer = await crypto.subtle.digest('SHA-256', spkiKey)

      // Convert the hash to base64
      //@ts-ignore
      function arrayBufferToBase64(buffer) {
        const binary = String.fromCharCode(...new Uint8Array(buffer))
        return btoa(binary)
      }

      // Create the fingerprint
      const publicKeyFingerprint = 'SHA256:' + arrayBufferToBase64(hashBuffer)

      // TODO: REPLACE THE HARDCODED SHA256. prefix with the above code
      const qualifiedUsernamePublicPrefix = `${this.config.account}.${this.config.username}.${publicKeyFingerprint}`
      const qualifiedUsername = `${this.config.account}.${this.config.username}`

      // Generate JWT payload
      const payload = {
        iss: qualifiedUsernamePublicPrefix,
        sub: qualifiedUsername,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // Token valid for 1 hour
      }

      console.log('payload', payload)

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
      // If we already have a valid token, skip authentication
      const cacheKey = `${this.config.account}:${this.config.username}`
      if (
        authCache[cacheKey] &&
        authCache[cacheKey].expiresAt &&
        authCache[cacheKey].expiresAt > Date.now()
      ) {
        this.auth = authCache[cacheKey]
        return true
      }

      // Generate JWT token and set up auth
      const token = await this.generateJwtToken()
      this.auth = {
        accessToken: token,
        expiresAt: Date.now() + 60 * 60 * 1000 - 60000, // Token valid for 1 hour minus 1 minute buffer
      }

      // Verify the token works by running a simple test query
      try {
        await this.query_core('SELECT 1', true)

        // If we get here, authentication succeeded
        // Cache the token
        authCache[cacheKey] = this.auth
        return true
      } catch (error) {
        // If test query fails, clear auth and throw error
        this.auth = {}
        throw new Error(`Authentication failed: ${error}`)
      }
    } catch (error) {
      throw error
    }
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.auth.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
    }
  }

  async query_core(sql: string, isRetry: boolean = false): Promise<Results> {
    // Ensure we have a valid token before proceeding
    if (
      !isRetry &&
      (!this.auth.accessToken || !this.auth.expiresAt || this.auth.expiresAt <= Date.now())
    ) {
      await this.connect()
    }

    // Submit the SQL statement
    const submitResponse = await fetch(`${this.baseUrl}/v2/statements/`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        statement: sql,
        timeout: 60, // seconds
        database: this.config.database,
        schema: this.config.schema,
        warehouse: this.config.warehouse,
        role: this.config.role,
      }),
    })

    if (!submitResponse.ok) {
      const errorData = await submitResponse.json()

      // If we get an authentication error, try to reconnect once
      if ((submitResponse.status === 401 || submitResponse.status === 403) && !isRetry) {
        this.auth = {} // Clear existing auth
        await this.connect() // Reconnect

        // Retry the query
        return this.query_core(sql, true)
      }

      throw new Error(`Query execution failed: ${errorData.message || submitResponse.statusText}`)
    }

    const submitData = await submitResponse.json()
    const statementHandle = submitData.statementHandle

    // Poll for query status until it completes
    let statementStatus: StatementStatus
    do {
      await new Promise((resolve) => setTimeout(resolve, this.pollingInterval))

      const statusResponse = await fetch(`${this.baseUrl}/v2/statements/${statementHandle}`, {
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

    // Extract query results
    const resultMetadata = statementStatus.resultSetMetaData?.rowType || []
    const resultData = statementStatus.data || []

    // Map column metadata to headers
    const headers = new Map<string, ResultColumn>()
    resultMetadata.forEach((column: any, _: number) => {
      headers.set(column.name, {
        name: column.name,
        type: this.mapSnowflakeTypeToColumnType({
          type: column.type,
          precision: column.precision,
          scale: column.scale,
        }),
        description: '',
        precision: column.precision,
        scale: column.scale,
      })
    })

    // Map rows to objects with column names as keys
    const data = resultData.map((row: any[]) => {
      const rowObj: any = {}
      resultMetadata.forEach((column: any, index: number) => {
        rowObj[column.name] = row[index]
      })
      return rowObj
    })

    // Convert special types
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    data.forEach((row: any) => {
      Object.keys(row).forEach((key) => {
        switch (headers.get(key)?.type) {
          case ColumnType.INTEGER:
            if (row[key] !== null && row[key] !== undefined) {
              row[key] = Number(row[key])
            }
            break
          case ColumnType.FLOAT:
            if (row[key] !== null && row[key] !== undefined) {
              row[key] = Number(row[key])
            }
            break
          case ColumnType.DATE:
            if (row[key] !== null && row[key] !== undefined) {
              row[key] = DateTime.fromISO(row[key], { zone: 'UTC' })
            }
            break
          case ColumnType.DATETIME:
            if (row[key] !== null && row[key] !== undefined) {
              row[key] = DateTime.fromISO(row[key], { zone: tz })
            }
            break
          default:
            break
        }
      })
    })

    return new Results(headers, data)
  }

  private mapSnowflakeTypeToColumnType(snowflakeType: SnowflakeType): ColumnType {
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
        columns.push(new Column(column.name, column.type, false, false, false, null, false))
      })
      return new Table(table, columns)
    })
  }

  async getTables(database: string): Promise<Table[]> {
    const sql = `SHOW TABLES IN DATABASE ${database}`
    return this.query_core(sql).then((results) => {
      const tables: Table[] = []
      results.data.forEach((row: any) => {
        tables.push(new Table(row.name || row['name'], []))
      })
      return tables
    })
  }

  async getColumns(database: string, table: string): Promise<Column[]> {
    const schema = this.config.schema || 'PUBLIC'
    const sql = `DESCRIBE TABLE ${database}.${schema}.${table}`

    return this.query_core(sql).then((results) => {
      const columns: Column[] = []
      results.data.forEach((row: any) => {
        columns.push(
          new Column(
            row.name || row['name'],
            row.type || row['type'],
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

  async close(): Promise<void> {
    // Just clear the auth data since we're using JWT
    this.auth = {}
  }
}
