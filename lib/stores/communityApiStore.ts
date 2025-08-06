import { defineStore } from 'pinia'
import {
  fetchModelFiles,
  filterModelFiles,
  getAvailableEngines,
  type ModelFile,
} from '../models/githubApiService'
import type { ModelConfigStoreType } from './modelStore'

const useCommunityApiStore = defineStore('communityApi', {
  state: () => ({
    files: [] as ModelFile[],
    error: null as string | null,
    loading: false,
  }),

  getters: {
    availableEngines: (state) => {
      return getAvailableEngines(state.files)
    },
  },

  actions: {
    async fetchFiles(): Promise<void> {
      this.error = null
      this.loading = true
      console.log('Fetching community model files...')

      const result = await fetchModelFiles()
      console.log('Fetched community model files:', result)
      this.files = result.files
      this.error = result.error
      this.loading = false
    },

    async refreshData(): Promise<void> {
      await this.fetchFiles()
    },

    filteredFiles(
      searchQuery: string,
      selectedEngine: string,
      importStatus: 'all' | 'imported' | 'not-imported',
      modelStore: ModelConfigStoreType,
    ) {
      const modelExists = (name: string): boolean => {
        return name in modelStore.models
      }

      return filterModelFiles(
        this.files,
        searchQuery,
        selectedEngine,
        importStatus,
        modelExists,
      )
    },
  },
})

export type CommunityApiStoreType = ReturnType<typeof useCommunityApiStore>
export default useCommunityApiStore
