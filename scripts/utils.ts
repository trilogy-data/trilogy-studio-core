import * as fs from 'fs/promises'
import * as path from 'path'
import { ImportMap, BenchMarkQuery, ProviderResult } from './types'
import IMPORTS from './imports'
import TEST_CASES from './test_cases'

/**
 * Load test cases and imports from JSON files
 */
export async function loadTestData(): Promise<{ testCases: BenchMarkQuery[]; imports: ImportMap }> {
  try {
    const testCases = TEST_CASES
    const imports: ImportMap = IMPORTS

    return { testCases, imports }
  } catch (error) {
    console.error('Error loading test data:', error)
    throw new Error('Failed to load test data')
  }
}

/**
 * Load API keys from environment variables
 */
export function getApiKey(providerName: string): string {
  const keyName = `${providerName}_KEY`
  const apiKey = process.env[keyName]

  if (!apiKey) {
    throw new Error(
      `API key for ${providerName} not found in .env file. Please add ${keyName}=your_api_key`,
    )
  }

  return apiKey
}

/**
 * Save test results to files
 */
export async function saveResults(providerResults: ProviderResult[]): Promise<void> {
  const resultsDir = path.join(process.cwd(), 'results')

  try {
    // Create results directory if it doesn't exist
    await fs.mkdir(resultsDir, { recursive: true })

    // Save each provider result to its own file
    for (const result of providerResults) {
      const fileName = path.join(resultsDir, `${result.provider}-${result.model}.json`)
      await fs.writeFile(fileName, JSON.stringify(result, null, 2))
    }

    // Create a summary file
    const summary = providerResults.map((result) => ({
      provider: result.provider,
      model: result.model,
      passRate: result.passRate,
      averageLatency: result.averageLatency,
      totalTests: result.results.length,
    }))

    await fs.writeFile(path.join(resultsDir, 'summary.json'), JSON.stringify(summary, null, 2))
  } catch (error) {
    console.error('Error saving results:', error)
  }
}

// Print summary of test results
export function printSummary(providerResults: ProviderResult[]): void {
  console.log('All tests completed!')
  console.log('Summary:')

  for (const result of providerResults) {
    console.log(`${result.provider} (${result.model}):`)
    console.log(`  Pass rate: ${(result.passRate * 100).toFixed(2)}%`)
    console.log(`  Average latency: ${result.averageLatency.toFixed(2)}ms`)
    console.log()
  }
}
