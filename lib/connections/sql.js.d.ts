declare module 'sql.js' {
  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string
  }): Promise<SqlJsStatic>

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database
  }

  export interface Database {
    run(sql: string, params?: Record<string, any>): Database
    exec(sql: string, params?: Record<string, any>): QueryExecResult[]
    close(): void
    export(): Uint8Array
  }

  export interface QueryExecResult {
    columns: string[]
    values: any[][]
  }
}

declare module 'sql.js/dist/sql-wasm.wasm?url' {
  const url: string
  export default url
}
