import * as dotenv from 'dotenv'
import { createPinia } from 'pinia'
import fs from 'fs'
import path from 'path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const { DuckDBConnection } = await import('trilogy-studio-components/connections')
import { createProviderInstance } from './providers'
import { loadTestData, getApiKey, printSummary } from './utils'
import { TestRunner } from './test-runner'
import { ProviderConfig, ProviderResult, TestResult } from './types'
const { useLLMConnectionStore, useConnectionStore } = await import('trilogy-studio-components/stores')

// Load environment variables from .env file
dotenv.config()

// Define all available provider test cases
const ALL_PROVIDERS: ProviderConfig[] = [
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

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('providers', {
    alias: 'p',
    type: 'array',
    description: 'Providers to test (GOOGLE, ANTHROPIC, OPENAI)',
    choices: ALL_PROVIDERS.map((p) => p.name),
    default: ALL_PROVIDERS.map((p) => p.name),
  })
  .option('test', {
    alias: 't',
    type: 'string',
    description: 'Specific test ID to run (runs all tests if not specified)',
  })
  .help().argv

// Function to save results to both JSON and Markdown files
async function saveResults(providerResults: ProviderResult[]) {
  // Save JSON results (keep existing functionality)
  const resultsPath = path.join(process.cwd(), 'results.json')
  fs.writeFileSync(resultsPath, JSON.stringify(providerResults, null, 2))
  console.log(`Results saved to ${resultsPath}`)

  // Save/append to Markdown file
  await saveMarkdownResults(providerResults)
}

// Function to save results to markdown file
async function saveMarkdownResults(providerResults: ProviderResult[]) {
  const markdownPath = path.join(process.cwd(), 'llm-results.md')
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19)

  let markdownContent = ''

  // Check if file exists to determine if we need to add header
  const fileExists = fs.existsSync(markdownPath)

  if (!fileExists) {
    // Create initial header for new file
    markdownContent += '# LLM Benchmark Results\n\n'
    markdownContent += 'This file contains benchmark test results for various LLM providers.\n\n'
  }

  // Add timestamp header for this run
  markdownContent += `## Test Run - ${timestamp}\n\n`

  // Add summary table
  markdownContent += '### Summary\n\n'
  markdownContent += '| Provider | Model | Pass Rate | Average Latency (ms) | Total Tests |\n'
  markdownContent += '|----------|-------|-----------|---------------------|-------------|\n'

  for (const result of providerResults) {
    const passRate = (result.passRate * 100).toFixed(2)
    const avgLatency = result.averageLatency.toFixed(2)
    const totalTests = result.results.length

    markdownContent += `| ${result.provider} | ${result.model} | ${passRate}% | ${avgLatency} | ${totalTests} |\n`
  }

  markdownContent += '\n'

  // Add detailed results for each provider
  for (const result of providerResults) {
    markdownContent += `### ${result.provider} - ${result.model}\n\n`
    markdownContent += `**Pass Rate:** ${(result.passRate * 100).toFixed(2)}%  \n`
    markdownContent += `**Average Latency:** ${result.averageLatency.toFixed(2)}ms  \n`
    markdownContent += `**Total Tests:** ${result.results.length}\n\n`

    // Group results by test ID
    const testGroups = result.results.reduce((groups, testResult) => {
      if (!groups[testResult.testId]) {
        groups[testResult.testId] = []
      }
      groups[testResult.testId].push(testResult)
      return groups
    }, {} as Record<string, TestResult[]>)

    markdownContent += '#### Test Results\n\n'
    markdownContent += '| Test ID | Query | Status | Latency (ms) | Error |\n'
    markdownContent += '|---------|-------|--------|-------------|-------|\n'

    for (const [testId, tests] of Object.entries(testGroups)) {
      for (const test of tests) {
        const status = test.passed ? '✅ Pass' : '❌ Fail'
        const error = test.error ? test.error.substring(0, 50) + '...' : ''
        const query = test.query ? test.query.substring(0, 60) + (test.query.length > 60 ? '...' : '') : ''

        markdownContent += `| ${testId} | ${query} | ${status} | ${test.latency.toFixed(2)} | ${error} |\n`
      }
    }

    markdownContent += '\n'
  }

  markdownContent += '---\n\n'

  // Append to file
  fs.appendFileSync(markdownPath, markdownContent)
  console.log(`Results appended to ${markdownPath}`)
}

// Main function to run all tests
async function main() {
  try {
    // Get the selected providers from command line arguments
    const selectedProviders = argv.providers
    const specificTestId = argv.test

    console.log(`Selected providers to test: ${selectedProviders.join(', ')}`)
    if (specificTestId) {
      console.log(`Running only test ID: ${specificTestId}`)
    }

    // Filter test cases based on selected providers
    const TEST_CASES = ALL_PROVIDERS.filter((provider) => selectedProviders.includes(provider.name))

    // Initialize Pinia
    const pinia = createPinia()
    const connectionName = 'duckdb'

    // Set up connection
    const connectionStore = useConnectionStore(pinia)
    let duckDB = new DuckDBConnection(connectionName)
    connectionStore.addConnection(duckDB)

    // Load test data
    const { testCases: allTestCases, imports } = await loadTestData()

    if (allTestCases.length === 0) {
      console.error('No test cases found in test_cases.json')
      return
    }

    // Filter test cases if a specific test ID is provided
    const testCases = specificTestId
      ? allTestCases.filter((test) => test.id === specificTestId)
      : allTestCases

    if (specificTestId && testCases.length === 0) {
      console.error(`Test with ID "${specificTestId}" not found`)
      return
    }

    // Initialize test runner
    const testRunner = new TestRunner(pinia, connectionName)

    // Load previous results if they exist
    let providerResults: ProviderResult[] = []
    const resultsPath = path.join(process.cwd(), 'results.json')

    if (fs.existsSync(resultsPath)) {
      try {
        const previousResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'))
        if (Array.isArray(previousResults)) {
          providerResults = previousResults
        }
      } catch (error) {
        console.warn('Failed to load previous results, starting fresh', error)
      }
    }

    const llmStore = useLLMConnectionStore(pinia)

    // Run tests for each selected provider and model
    for (const testProvider of TEST_CASES) {
      const providerName = testProvider.name
      const apiKey = getApiKey(providerName)

      // If running a specific test, we need to handle previous results differently
      if (specificTestId) {
        // Only filter out results for the specific test being run for this provider
        providerResults = providerResults.map((result) => {
          if (result.provider === providerName) {
            // Keep only results for tests that aren't being run again
            return {
              ...result,
              results: result.results.filter((r) => r.testId !== specificTestId),
            }
          }
          return result
        })
      } else {
        // Remove all results for the current provider if running all tests
        providerResults = providerResults.filter((result) => result.provider !== providerName)
      }

      for (const model of testProvider.models) {
        console.log(`Running tests for ${providerName} with model ${model}...`)

        // Create provider
        const provider = createProviderInstance(providerName, apiKey, model)
        llmStore.addConnection(provider)

        const newTestResults: TestResult[] = []

        // Run all test cases
        for (const testCase of testCases) {
          console.log(`  Running test case ${testCase.id}...`)
          const results = await testRunner.runTestCase(testCase, provider, imports, connectionName)
          newTestResults.push(...results)
        }

        // Get existing results for this provider/model if any
        const existingResultIndex = providerResults.findIndex(
          (r) => r.provider === providerName && r.model === model,
        )

        if (existingResultIndex >= 0) {
          // Merge new results with existing ones
          const mergedResults = [...providerResults[existingResultIndex].results, ...newTestResults]

          // Calculate updated metrics
          const passedTests = mergedResults.filter((result) => result.passed).length
          const passRate = passedTests / mergedResults.length
          const totalLatency = mergedResults.reduce((sum, result) => sum + result.latency, 0)
          const averageLatency = totalLatency / mergedResults.length

          // Update existing result
          providerResults[existingResultIndex] = {
            provider: providerName,
            model,
            results: mergedResults,
            passRate,
            averageLatency,
          }
        } else {
          // Calculate new metrics
          const passedTests = newTestResults.filter((result) => result.passed).length
          const passRate = passedTests / newTestResults.length
          const totalLatency = newTestResults.reduce((sum, result) => sum + result.latency, 0)
          const averageLatency = totalLatency / newTestResults.length

          // Add new result
          providerResults.push({
            provider: providerName,
            model,
            results: newTestResults,
            passRate,
            averageLatency,
          })
        }

        // Find the current result to log
        const currentResult = providerResults.find(
          (r) => r.provider === providerName && r.model === model,
        )!

        // Log individual provider results
        console.log(`  Completed tests for ${providerName} with model ${model}`)
        console.log(`  Pass rate: ${(currentResult.passRate * 100).toFixed(2)}%`)
        console.log(`  Average latency: ${currentResult.averageLatency.toFixed(2)}ms`)
        console.log()
      }
    }

    // Save results to both JSON and Markdown files
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