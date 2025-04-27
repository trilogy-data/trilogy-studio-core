import { defineStore } from 'pinia'
import { LLMProvider } from '../llm'
import type { LLMRequestOptions, LLMMessage, ModelConceptInput } from '../llm'
import {
  AnthropicProvider,
  OpenAIProvider,
  MistralProvider,
  GoogleProvider,
  createPrompt,
  createFilterPrompt,
} from '../llm'

const extractLastTripleQuotedText = (input: string): string | null => {
  // First, try to strip only the 'trilogy' language identifier after triple backticks
  const strippedInput = input.replace(/```trilogy\n/g, '```\n')
  
  // Use the 's' flag (dotAll) to make the dot match newlines as well
  // try with all 3 kinds of quotes (''', ```, """)
  for (const quote of ["'''", '```', '"""']) {
    const matches = strippedInput.match(new RegExp(`${quote}([\\s\\S]*?)${quote}`, 'gs'))
    if (matches) {
      const content = matches[matches.length - 1].slice(3, -3)
      // Recursively extract from the content in case there are nested quotes
      return extractLastTripleQuotedText(content)
    }
  }
  return strippedInput
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
      promptCreator: Function,
      inputString: string,
      concepts: ModelConceptInput[],
      validator: Function | null = null,
      maxAttempts = 3,
    ) {
      let connection: string = this.activeConnection || ''
      if (connection === '') {
        throw new Error('No active LLM connection')
      }

      let base = promptCreator(inputString, concepts)
      let attempts = 0
      let passed = false
      let extract = '' as string | null

      // Initial completion generation
      let raw = await this.generateCompletion(connection, {
        prompt: base,
      })

      // Extract the response
      extract = extractLastTripleQuotedText(raw.text)

      // Validation loop
      if (validator) {
        console.log('Validating llm response with:', validator)
        console.log('extract:', extract)

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
            base += `\n\n[IMPORTANT] This is your ${attempts} attempt. Your last response was """${extract}""", which failed validation on this error: ${message}. Generate a new response that solves the original prompt while fixing the error. Ensure the new asnwer to validate is still enclosed within triple double quotes with no extra content. Put your reasoning on the fix before the quotes.`

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

      console.log('returning llm response')
      return extract
    },

    async generateQueryCompletion(
      inputString: string,
      concepts: ModelConceptInput[],
      validator: Function | null = null,
      maxAttempts = 3,
    ) {
      return this.generateValidatedCompletion(
        createPrompt,
        inputString,
        concepts,
        validator,
        maxAttempts,
      )
    },

    async generateFilterQuery(
      inputString: string,
      concepts: ModelConceptInput[],
      validator: Function | null = null,
      maxAttempts = 3,
    ) {
      return this.generateValidatedCompletion(
        createFilterPrompt,
        inputString,
        concepts,
        validator,
        maxAttempts,
      )
    },

    async generateCompletion(
      name: string,
      options: LLMRequestOptions,
      history: [LLMMessage] | null = null,
    ) {
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
  },
})

export type LLMConnectionStoreType = ReturnType<typeof useLLMConnectionStore>
export default useLLMConnectionStore
