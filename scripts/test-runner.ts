import { Pinia } from 'pinia'
const { createPrompt } = await import('trilogy-studio-components/llm')
const {
  TrilogyResolver,
  useLLMConnectionStore,
  QueryExecutionService,
  useConnectionStore,
  useUserSettingsStore,
} = await import('trilogy-studio-components/stores')
import { BenchMarkQuery, TestResult, ImportMap, ContentInput, Import } from './types'

export class TestRunner {
  private resolver: TrilogyResolver
  private settingStore: ReturnType<typeof useUserSettingsStore>
  private connectionStore: ReturnType<typeof useConnectionStore>
  private queryExecutionService: QueryExecutionService
  private llmStore: ReturnType<typeof useLLMConnectionStore>
  private numRepeats = 5

  constructor(pinia: Pinia, connectionName: string) {
    this.settingStore = useUserSettingsStore()
    this.settingStore.updateSettings({
      trilogyResolver: 'http://127.0.0.1:5678',
    })
    this.resolver = new TrilogyResolver(this.settingStore)
    this.connectionStore = useConnectionStore(pinia)
    this.queryExecutionService = new QueryExecutionService(
      this.resolver,
      this.connectionStore,
      null,
      null,
      false,
    )
    this.llmStore = useLLMConnectionStore(pinia)
  }

  /**
   * Run a single test case with a provider
   */
  async runTestCase(
    testCase: BenchMarkQuery,
    provider: LLMProvider,
    imports: ImportMap,
    connectionName: string,
  ): Promise<TestResult[]> {
    const results: TestResult[] = []

    // Create content input and import arrays
    let contentInputs: ContentInput[] = []

    let importArray: Import[] = []

    // loop over testCase.imports and add to contentInputs and importArray
    if (testCase.imports) {
      for (const importName of testCase.imports) {
        const importContent = imports[importName]
        if (!importContent) {
          throw new Error(`Import ${importName} not found in imports.json`)
        }
        contentInputs.push({
          alias: importName,
          contents: importContent,
        })
        importArray.push({
          name: importName,
          alias: importName,
        })
      }
    }
    if (testCase.data) {
      for (const dataName of testCase.data) {
        const dataContent = imports[dataName]
        if (!dataContent) {
          throw new Error(`Data ${dataName} not found in imports.json`)
        }
        contentInputs.push({
          alias: dataName,
          contents: dataContent,
        })
      }
    }

    // Get model concepts
    const modelConceptInput = await this.getModelConcepts(contentInputs, importArray)

    // Run the test multiple times
    for (let i = 0; i < this.numRepeats; i++) {
      const startTime = Date.now()

      try {
        // Create validator function
        const validator = this.createValidator(connectionName, importArray, contentInputs)

        // Generate completion
        const response = await this.llmStore.generateValidatedCompletion(
          createPrompt(testCase.prompt, modelConceptInput),
          validator,
          3, // maxAttempts
          provider.model, // modelOverride
        )

        const endTime = Date.now()
        const latency = endTime - startTime

        const passed = response.success
        results.push({
          testId: testCase.id,
          passed,
          containedKeywords: [],
          missingKeywords: [],
          response: response.content || '',
          latency,
          error: response.error || null,
          query: response.content || null,
        })
      } catch (error) {
        console.error(
          `Error running test case ${testCase.id} with provider ${provider.name}:`,
          error,
        )
        results.push({
          testId: testCase.id,
          passed: false,
          containedKeywords: [],
          missingKeywords: testCase.expected_keywords,
          response: `Error: ${error.message}`,
          latency: Date.now() - startTime,
          error: error.message,
          query: null,
        })
      }
    }

    return results
  }

  /**
   * Get model concepts from resolver
   */
  private async getModelConcepts(contentInputs: ContentInput[], importArray: Import[]) {
    const dummyQuery = 'select 1'
    const validationResult = await this.resolver.validate_query(
      dummyQuery,
      contentInputs,
      importArray,
      null,
    )

    const modelConceptInputRaw = validationResult.data.completion_items
    const modelConceptInput = modelConceptInputRaw.map((item) => ({
      name: item.label,
      type: item.datatype,
      description: item.description,
    }))

    console.log('Model concept input length:', modelConceptInput.length)
    return modelConceptInput
  }

  /**
   * Create a validator function for query execution
   */
  private createValidator(
    connectionName: string,
    importArray: Import[],
    contentInputs: ContentInput[],
  ) {
    return async (command: string) => {
      let promises = await this.queryExecutionService?.executeQuery(
        connectionName,
        {
          text: command,
          editorType: 'trilogy',
          imports: importArray,
          extraContent: contentInputs,
        },
        () => {},
        () => {},
        () => {},
        () => {},
        true,
      )

      if (!promises) {
        throw new Error('No promises returned from query execution service')
      }

      let resultPromise = await promises.resultPromise
      if (!resultPromise.success) {
        throw new Error(resultPromise.error || 'Query validation failed - try syntax from scratch?')
      }

      console.log(`Query validation successful for ${command}!`)
    }
  }
}
