import { defineStore } from 'pinia'
import { LLMProvider } from '../llm'
import type { LLMRequestOptions, LLMMessage, ModelConceptInput } from '../llm'
import { AnthropicProvider, OpenAIProvider, MistralProvider, createPrompt } from '../llm'

const extractLastTripleQuotedText = (input: string): string | null => {
  // Use the 's' flag (dotAll) to make the dot match newlines as well
  const matches = input.match(/"""([\s\S]*?)"""/gs)
  return matches ? matches[matches.length - 1].slice(3, -3) : null
}

const useLLMConnectionStore = defineStore('llmConnections', {
  state: () => ({
    connections: {} as Record<string, LLMProvider>,
    activeConnection: '',
  }),

  actions: {
    addConnection(connection: LLMProvider) {
      // Use provider's constructor name or a unique property as identifier
      const name = connection.name
      this.connections[name] = connection
      return connection
    },

    resetConnection(name: string) {
      if (this.connections[name]) {
        return this.connections[name].reset()
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

      if (type === 'anthropic') {
        this.connections[name] = new AnthropicProvider(
          name,
          options.apiKey,
          options.model,
          options.saveCredential,
        )
      } else if (type === 'openai') {
        this.connections[name] = new OpenAIProvider(
          name,
          options.apiKey,
          options.model,
          options.saveCredential,
        )
      } else if (type === 'mistral') {
        this.connections[name] = new MistralProvider(
          name,
          options.apiKey,
          options.model,
          options.saveCredential,
        )
      } else {
        throw new Error(`LLM provider type "${type}" not found.`)
      }

      return this.connections[name]
    },

    async generateQueryCompletion(inputString: string, concepts: ModelConceptInput[]) {
      let connection: string = this.activeConnection || ''
      if (connection === '') {
        throw new Error('No active LLM connection')
      }
      let raw = await this.generateCompletion(connection, {
        prompt: createPrompt(inputString, concepts),
      })

      return extractLastTripleQuotedText(raw.text)
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
