import * as dotenv from 'dotenv'
import { createPinia } from 'pinia'
const { DuckDBConnection } = await import('trilogy-studio-core/connections')
import { createProviderInstance } from './providers'
import { loadTestData, getApiKey, saveResults, printSummary } from './utils'
import { TestRunner } from './test-runner'
import { ProviderConfig, ProviderResult, TestResult } from './types'
const { useLLMConnectionStore, useConnectionStore } = await import('trilogy-studio-core/stores')

// Load environment variables from .env file
dotenv.config()

// Define provider test cases
const TEST_CASES: ProviderConfig[] = [
  {
    name: 'OPENAI',
    models: ['gpt-4.1-nano'],
  },
  {
    name: 'ANTHROPIC',
    models: ['claude-3-7-sonnet-20250219'],
  },
  {
    name: 'GOOGLE',
    models: ['gemini-2.0-flash'],
  },
]

// Main function to run all tests
async function main() {
  try {
    // Initialize Pinia
    const pinia = createPinia()
    const connectionName = 'duckdb'

    // Set up connection
    const connectionStore = useConnectionStore(pinia)
    let duckDB = new DuckDBConnection(connectionName)
    connectionStore.addConnection(duckDB)

    // Load test data
    const { testCases, imports } = await loadTestData()
    if (testCases.length === 0) {
      console.error('No test cases found in test_cases.json')
      return
    }

    // Initialize test runner
    const testRunner = new TestRunner(pinia, connectionName)

    // Store test results
    const providerResults: ProviderResult[] = []
    const llmStore = useLLMConnectionStore(pinia)

    // Run tests for each provider and model
    for (const testProvider of TEST_CASES) {
      const providerName = testProvider.name
      const apiKey = getApiKey(providerName)

      for (const model of testProvider.models) {
        console.log(`Running tests for ${providerName} with model ${model}...`)

        // Create provider
        const provider = createProviderInstance(providerName, apiKey, model)
        llmStore.addConnection(provider)

        const allTestResults:TestResult[] = []

        // Run all test cases
        for (const testCase of testCases) {
          console.log(`  Running test case ${testCase.id}...`)
          const results = await testRunner.runTestCase(testCase, provider, imports, connectionName)
          allTestResults.push(...results)
        }

        // Calculate results
        const passedTests = allTestResults.filter((result) => result.passed).length
        const passRate = passedTests / allTestResults.length
        const totalLatency = allTestResults.reduce((sum, result) => sum + result.latency, 0)
        const averageLatency = totalLatency / allTestResults.length

        // Store results
        providerResults.push({
          provider: providerName,
          model,
          results: allTestResults,
          passRate,
          averageLatency,
        })

        // Log individual provider results
        console.log(`  Completed tests for ${providerName} with model ${model}`)
        console.log(`  Pass rate: ${(passRate * 100).toFixed(2)}%`)
        console.log(`  Average latency: ${averageLatency.toFixed(2)}ms`)
        console.log()
      }
    }

    // Save results to file
    await saveResults(providerResults)

    // Print summary
    printSummary(providerResults)
  } catch (error) {
    console.error('Error running benchmark:', error)
    process.exit(1)
  }
}

// Run main function
main().catch((error) => {
  console.error('Uncaught error:', error)
  process.exit(1)
})
