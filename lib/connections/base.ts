// BaseConnection.ts

import { Results } from '../editors/results'
export default abstract class BaseConnection {
  name: string
  type: string
  storage: string
  model: string | null = null
  connected: boolean
  error: string | null = null
  query_type: string = 'abstract'
  running: boolean = false

  constructor(name: string, type: string, autoConnect: boolean = true, model?: string) {
    this.name = name
    this.type = type
    this.model = model || null
    // hardcoded for dev
    this.storage = 'local'
    this.query_type = 'abstract'
    this.connected = false // Default to disconnected
    if (autoConnect) {
      this.connect()
        .then(() => {
          this.connected = true
        })
        .catch((error) => {
          if (error instanceof Error) {
            this.error = error.message
          }
          throw error
        })
    }
  }

  abstract query_core(sql: string): Promise<Results>

  async query(sql: string) {
    if (!sql) {
      throw new Error('Query is empty.')
    }
    if (!this.connected) {
      console.error(`Cannot execute query. ${this.name} is not connected.`)
      throw new Error('Connection not established.')
    }

    this.running = true
    try {
      const results = await this.query_core(sql)
      this.running = false
      return results
    } catch (error) {
      this.running = false
      // this.error = error.message
      throw error
    }
  }


  abstract connect(): Promise<void>

  setModel(model: string) {
    this.model = model
  }

  async reset() {
    try {
      this.connected = false
      this.error = null
      await this.connect()
      this.connected = true
    } catch (error) {
      if (error instanceof Error) {
        this.error = error.message
      }
      throw error
    }
  }

  abstract toJSON(): object

  // @ts-ignore
  static fromJSON(fields: object) {
    throw new Error('Method not implemented.')
  }
}
