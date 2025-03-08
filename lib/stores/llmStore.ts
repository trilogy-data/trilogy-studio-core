import { defineStore } from 'pinia'
import { LLMProvider } from '../llm'
import type { LLMResponse, LLMRequestOptions} from '../llm'
import { AnthropicProvider, OpenAIProvider, MistralProvider } from '../llm'

const useLLMConnectionStore = defineStore('llmConnections', {
  state: () => ({
    connections: {} as Record<string, LLMProvider>,
  }),

  actions: {
    addConnection(connection: LLMProvider) {
      // Use provider's constructor name or a unique property as identifier
      const name = connection.constructor.name
      this.connections[name] = connection
      return connection
    },
    
    resetConnection(name: string) {
      if (this.connections[name]) {
        // Implement reset functionality if needed
        // This would depend on your LLMProvider implementation
        return Promise.resolve(this.connections[name])
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
        this.connections[name] = new AnthropicProvider(options.apiKey)
      } else if (type === 'openai') {
        this.connections[name] = new OpenAIProvider(options.apiKey)
      } else if (type === 'mistral') {
        this.connections[name] = new MistralProvider(options.apiKey)
      } else {
        throw new Error(`LLM provider type "${type}" not found.`)
      }
      
      return this.connections[name]
    },
    
    async generateCompletion(name: string, options: LLMRequestOptions) {
      if (!this.connections[name]) {
        throw new Error(`LLM connection with name "${name}" not found.`)
      }
      
      return await this.connections[name].generateCompletion(options)
    }
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
    }
  }
})

export type LLMConnectionStoreType = ReturnType<typeof useLLMConnectionStore>
export default useLLMConnectionStore