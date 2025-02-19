import { defineStore } from 'pinia'
import { ModelConfig, ModelParseResults, ModelSource } from '../models'

const useModelConfigStore = defineStore('models', {
  state: () => ({
    models: {} as Record<string, ModelConfig>, // Use an object instead of Map
  }),
  getters: {
    modelList: (state) => Object.keys(state.models).map((key) => state.models[key]),
  },
  actions: {
    newModelConfig(name: string) {
      let model = new ModelConfig({ name: name, storage: 'local', sources: [], parseResults: null })
      if (name in this.models) {
        throw Error(`ModelConfig with ${name} already exists.`)
      }
      this.models[model.name] = model // Add model using object notation
    },
    addModelConfig(model: ModelConfig) {
      this.models[model.name] = model // Add model using object notation
    },
    removeModelConfig(name: string) {
      if (this.models[name]) {
        delete this.models[name]
      } else {
        throw new Error(`ModelConfig with name "${name}" not found.`)
      }
    },
    addModelConfigSource(name: string, contents: ModelSource) {
      if (this.models[name]) {
        this.models[name].sources.push(contents)
      } else {
        throw new Error(`ModelConfig with name "${name}" not found.`)
      }
    },
    removeModelConfigSource(name: string, contents: string) {
      if (this.models[name]) {
        let model = this.models[name]
        model.sources = model.sources.filter((source) => source.alias !== contents)
      } else {
        throw new Error(`ModelConfig with name "${name}" not found.`)
      }
    },
    setModelConfigParseResults(name: string, results: ModelParseResults) {
      if (this.models[name]) {
        let model = this.models[name]
        model.setParseResults(results)
      } else {
        throw new Error(`ModelConfig with name "${name}" not found.`)
      }
    },
    setModelParseError(name: string, error: string) {
      if (this.models[name]) {
        let model = this.models[name]
        model.setParseError(error)
      } else {
        throw new Error(`ModelConfig with name "${name}" not found.`)
      }
    },
  },
})

export type ModelConfigStoreType = ReturnType<typeof useModelConfigStore>

export default useModelConfigStore
