import axios from 'axios'
import { ModelConfig } from '../models'

export interface QueryResponse {
  data: {
    generated_sql: string
    columns: any[]
  }
}

interface ValidateItem {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  message: string
  severity: number
}

interface CompletionItem {
  label: string
  description: string
  type: string
  insertText: string
}
export interface ValidateResponse {
  data: {
    items: ValidateItem[]
    completion_items: CompletionItem[]
    imports: Import[]
  }
}

export interface ContentInput {
  alias: string
  contents: string
}

export interface Import {
  name: string
  alias: string
}

export default class AxiosResolver {
  address: string

  constructor(address: string) {
    this.address = address
  }
  getErrorMessage(error: Error): string {
    let base = 'An error occured.'
    if (axios.isAxiosError(error)) {
      base = error.message
      if (error.response && error.response.data) {
        base = error.response.data.detail
      }
    }
    return JSON.stringify(base)
  }
  async validate_query(
    query: string,
    sources: ContentInput[] | null = null,
  ): Promise<ValidateResponse> {
    return axios
      .post(`${this.address}/validate_query`, {
        query: query,
        sources: sources || [],
      })
      .catch((error: Error) => {
        console.log(error)
        throw Error(this.getErrorMessage(error))
      })
  }

  async resolve_query(
    query: string,
    dialect: string,
    type: string,
    sources: ContentInput[] | null = null,
    imports: Import[] | null = null,
    extraFilters: string[] | null = null,
  ): Promise<QueryResponse> {
    if (type === 'sql') {
      // return it as is
      return { data: { generated_sql: query , columns: [] } }
    }
    return axios
      .post(`${this.address}/generate_query`, {
        query: query,
        dialect: dialect,
        full_model: { name: '', sources: sources || [] },
        imports: imports || [],
        extra_filters: extraFilters || [],
      })
      .catch((error: Error) => {
        console.log(error)
        throw Error(this.getErrorMessage(error))
      })
  }

  async resolveModel(name: string, sources: ContentInput[]): Promise<ModelConfig> {
    return axios
      .post(`${this.address}/parse_model`, {
        name: name,
        sources: sources,
      })
      .then((response) => {
        return ModelConfig.fromJSON(response.data)
      })
      .catch((error: Error) => {
        throw Error(this.getErrorMessage(error))
      })
  }
}
