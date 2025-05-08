import { defineStore } from 'pinia'
import { LLMProvider } from '../llm'
import type { LLMRequestOptions, LLMMessage, ModelConceptInput, LLMResponse } from '../llm'
import {
  AnthropicProvider,
  OpenAIProvider,
  MistralProvider,
  GoogleProvider,
  createPrompt,
  createDashboardPrompt,
  createFilterPrompt,
} from '../llm'

interface ValidatedResponse {
  success: boolean
  prompt: string
  message: string
  content: string | null
  attempts: number
  error?: string | null
}

export const extractLastTripleQuotedText = (input: string): string => {
  // Strip common language identifiers after triple backticks
  // Add a capturing group to handle language identifiers with optional whitespace after them
  const strippedInput = input.replace(/```(trilogy|sql|json)(\s|\n)/g, '```')

  console.log('Stripped input:', strippedInput)

  // Use the 's' flag (dotAll) to make the dot match newlines as well
  // try with all 3 kinds of quotes (''', ```, """)
  for (const quote of ["'''", '```', '"""']) {
    const matches = strippedInput.match(new RegExp(`${quote}([\\s\\S]*?)${quote}`, 'gs'))
    if (matches) {
      const content = matches[matches.length - 1].slice(quote.length, -quote.length)
      // Recursively extract from the content in case there are nested quotes
      const recursiveResult = extractLastTripleQuotedText(content)
      return recursiveResult || content // Return the recursive result if it exists, otherwise return the content
    }
  }
  console.log('returning original input:', input)
  return input // Return the original input if no triple quotes were found
}

const useLLMConnectionStore = defineStore('llmConnections', {
  state: () => ({
    connections: {} as Record<string, LLMProvider>,
    activeConnection: '',
  }),

  actions: {
    addConnection(connection: LLMProvider, checkForDefault: boolean = true) {
      // Use provider's constructor name or a unique property as identifier
      const name = connection.name

      if (!this.activeConnection) {
        this.activeConnection = name
      }
      //check for any defaults
      if (checkForDefault) {
        const existingDefaults: LLMProvider[] = Object.values(this.connections).filter(
          (conn) => conn.isDefault,
        )
        if (existingDefaults.length === 0) {
          connection.isDefault = true
        }
      }
      this.connections[name] = connection
      return connection
    },

    async resetConnection(name: string) {
      if (this.connections[name]) {
        return await this.connections[name].reset()
      } else {
        throw new Error(`LLM connection with name "${name}" not found.`)
      }
    },

    connectionStateToStatus(connection: LLMProvider | null) {
      if (!connection) {
        return 'disabled'
      }

      // You may need to extend LLMProvider to include these properties
      // or use a different approach to determine status
      const connectionState = connection as any

      if (connectionState.error) {
        return 'failed'
      }
      if (connectionState.running) {
        return 'running'
      } else if (connectionState.connected) {
        return 'connected'
      } else {
        return 'disabled'
      }
    },

    newConnection(name: string, type: string, options: Record<string, any>) {
      if (this.connections[name]) {
        throw new Error(`LLM connection with name "${name}" already exists.`)
      }
      let connection: LLMProvider | null = null
      if (type === 'anthropic') {
        connection = new AnthropicProvider(
          name,
          options.apiKey,
          options.model,
          options.saveCredential,
        )
      } else if (type === 'openai') {
        connection = new OpenAIProvider(name, options.apiKey, options.model, options.saveCredential)
      } else if (type === 'mistral') {
        connection = new MistralProvider(
          name,
          options.apiKey,
          options.model,
          options.saveCredential,
        )
      } else if (type === 'google') {
        connection = new GoogleProvider(name, options.apiKey, options.model, options.saveCredential)
      } else {
        throw new Error(`LLM provider type "${type}" not found.`)
      }
      this.addConnection(connection)
      this.resetConnection(name)
      return connection
    },

    // Common method for generating and validating LLM responses
    async generateValidatedCompletion(
      base: string,
      validator: Function | null = null,
      maxAttempts = 3,
      modelOverride: string | null = null,
      messageHistory: LLMMessage[] | null = null,
    ): Promise<ValidatedResponse> {
      let connection: string = modelOverride || this.activeConnection || ''
      if (connection === '') {
        throw new Error('No active LLM connection')
      }

      let attempts = 0
      let passed = false
      let extract = '' as string | null

      // Initial completion generation
      let raw = await this.generateCompletion(
        connection,
        {
          prompt: base,
        },
        messageHistory,
      )

      // Extract the response
      extract = extractLastTripleQuotedText(raw.text)

      console.log('Initial LLM response:', extract)
      // Validation loop
      if (validator) {
        while (attempts < maxAttempts && !passed) {
          try {
            // Attempt validation
            passed = await validator(extract)
            console.log('LLM response validation passed')
            passed = true
          } catch (e) {
            console.log('LLM response validation failed')
            console.log(e)

            // Increment attempts counter
            attempts++

            // If max attempts reached, break out of the loop
            if (attempts >= maxAttempts) {
              console.log(`Max attempts (${maxAttempts}) reached, returning last response`)
              break
            }

            // Add feedback to the prompt for next attempt
            let message = (e as Error).message
            base += `\n\n[IMPORTANT] This is your ${attempts} attempt. Your last response was """${extract}""", which failed validation on this error: ${message}. Generate a new response that solves the original prompt while fixing the error. Ensure the new answer to validate is still enclosed within triple double quotes with no extra content. Put your reasoning on the fix before the quotes.`

            // Generate new completion with updated prompt
            raw = await this.generateCompletion(connection, {
              prompt: base,
            })

            // Extract the new response
            extract = extractLastTripleQuotedText(raw.text)
            console.log(`Attempt ${attempts}. New extract:`, extract)
          }
        }
      }
      console.log('Exiting validation loop with attempts:', attempts)
      console.log('Final LLM response:', extract)
      return {
        success: passed,
        prompt: base,
        message: raw.text,
        content: extract,
        attempts: attempts,
        error: passed ? null : 'Validation failed after maximum attempts',
      }
    },

    async generateDashboardCompletion(
      inputString: string,
      validator: Function | null = null,
      concepts: ModelConceptInput[] = [],
      maxAttempts = 3,
    ) {
      console.log('Generating dashboard completion')
      console.log('inputString:', inputString)
      let base = createDashboardPrompt(inputString, concepts)
      return this.generateValidatedCompletion(base, validator, maxAttempts).then((response) => {
        return response.content
      })
    },

    async generateQueryCompletion(
      inputString: string,
      concepts: ModelConceptInput[],
      validator: Function | null = null,
      maxAttempts = 3,
      modelOverride: string | null = null,
    ): Promise<ValidatedResponse> {
      let base = createPrompt(inputString, concepts)
      return this.generateValidatedCompletion(base, validator, maxAttempts, modelOverride)
    },

    async generateFilterQuery(
      inputString: string,
      concepts: ModelConceptInput[],
      validator: Function | null = null,
      maxAttempts = 3,
    ) {
      let base = createFilterPrompt(inputString, concepts)
      return this.generateValidatedCompletion(base, validator, maxAttempts).then((response) => {
        return response.content
      })
    },

    async generateCompletion(
      name: string,
      options: LLMRequestOptions,
      history: LLMMessage[] | null = null,
    ): Promise<LLMResponse> {
      if (!this.connections[name]) {
        throw new Error(`LLM connection with name "${name}" not found.`)
      }
      return await this.connections[name].generateCompletion(options, history)
    },
  },

  getters: {
    getConnection: (state) => {
      return (name: string) => state.connections[name] || null
    },

    getAllConnections: (state) => {
      return Object.values(state.connections)
    },

    getConnectionStatus: (state) => {
      return (name: string) => {
        const connection = state.connections[name]
        if (!connection) return 'disabled'

        const connectionState = connection as any
        if (connectionState.error) return 'failed'
        if (connectionState.running) return 'running'
        if (connectionState.connected) return 'connected'
        return 'disabled'
      }
    },
    hasActiveDefaultConnection: (state) => {
      return Object.values(state.connections).some((conn) => conn.isDefault && conn.connected)
    },
  },
})

export type LLMConnectionStoreType = ReturnType<typeof useLLMConnectionStore>
export default useLLMConnectionStore
