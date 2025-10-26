import { defineStore } from 'pinia'
import { ModelConfig, ModelParseResults, ModelSource } from '../models'
import type { Editor } from '../editors'
import useConnectionStore from './connectionStore'

const useModelConfigStore = defineStore('models', {
  state: () => ({
    models: {} as Record<string, ModelConfig>, // Use an object instead of Map
  }),
  getters: {
    modelList: (state) => Object.keys(state.models).map((key) => state.models[key]),
    unsavedModels: (state) => {
      return Object.values(state.models).filter((model) => model.changed).length
    },
  },
  actions: {
    newModelConfig(name: string, force: boolean = false) {
      let model = new ModelConfig({ name: name, storage: 'local', sources: [], description: '' })
      if (name in this.models && !force) {
        throw Error(`ModelConfig with ${name} already exists.`)
      }
      this.models[model.name] = model // Add model using object notation
      return model
    },
    addModelConfig(model: ModelConfig) {
      this.models[model.name] = model // Add model using object notation
    },
    removeModelConfig(name: string) {
      if (this.models[name]) {
        let connectionStore = useConnectionStore()
        // Update connections that reference this model
        connectionStore.connectionList.forEach((connection) => {
          if (connection.model === name) {
            connection.model = null
            connection.changed = true
          }
        })
        delete this.models[name]
      } else {
        throw new Error(`ModelConfig with name "${name}" not found.`)
      }
    },
    updateModelName(name: string, newName: string) {
      if (name === newName) return
      console.log(`Renaming model from ${name} to ${newName}`)
      let connectionStore = useConnectionStore()
      // Update connections that reference this model
      connectionStore.connectionList.forEach((connection) => {
        if (connection.model === name) {
          connection.model = newName
          connection.changed = true
        }
      })
      this.models[newName] = this.models[name]
      this.models[newName].name = newName
      this.models[newName].changed = true

      delete this.models[name]
    },
    addEditorAsModelSource(model: string, editor: Editor): void {
      this.addModelConfigSource(model, new ModelSource(editor.id, editor.name, [], []))
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
