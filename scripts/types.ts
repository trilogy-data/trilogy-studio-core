export interface BenchMarkQuery {
  id: string
  prompt: string
  imports: string[]
  data?: string[]
  expected_keywords: string[]
}

export interface ImportMap {
  [key: string]: string
}

export interface TestResult {
  testId: string
  passed: boolean
  containedKeywords: string[]
  missingKeywords: string[]
  response: string
  latency: number
  error: string | null
  query: string | null
}

export interface ProviderResult {
  provider: string
  model: string
  results: TestResult[]
  passRate: number
  averageLatency: number
}

export interface ContentInput {
  alias: string
  contents: string
}

export interface Import {
  name: string
  alias: string
}

export interface ProviderConfig {
  name: string
  models: string[]
}
