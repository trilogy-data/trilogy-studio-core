import { defineStore } from 'pinia'
import { filterModelFiles, getAvailableEngines } from '../remotes/modelApiService'
import {
  type ModelFile,
  type AnyModelStore,
  type GithubModelStore,
  type GenericModelStore,
  DEFAULT_GITHUB_STORE,
} from '../remotes/models'
import { fetchFromAllStores } from '../remotes/storeService'
import type { ModelConfigStoreType } from './modelStore'

const STORES_STORAGE_KEY = 'trilogy-community-stores'

export interface CommunityApiState {
  // Multiple store support
  stores: AnyModelStore[]
  filesByStore: Record<string, ModelFile[]>

  errors: Record<string, string>
  loading: boolean

  // Modal state for adding stores
  showAddStoreModal: boolean
  addingStore: boolean
  newStore: {
    type: 'github' | 'generic'
    name: string
    baseUrl: string
    owner: string
    repo: string
    branch: string
  }
}

const useCommunityApiStore = defineStore('communityApi', {
  state: (): CommunityApiState => ({
    // Initialize with default store
    stores: [DEFAULT_GITHUB_STORE],
    filesByStore: {},

    errors: {},
    loading: false,

    // Modal state
    showAddStoreModal: false,
    addingStore: false,
    newStore: {
      type: 'generic',
      name: '',
      baseUrl: '',
      owner: '',
      repo: '',
      branch: 'main',
    },
  }),

  getters: {
    // Get all files from all stores
    allFiles: (state): ModelFile[] => {
      const files: ModelFile[] = []
      Object.values(state.filesByStore).forEach((storeFiles) => {
        files.push(...storeFiles)
      })
      return files
    },

    // Get available engines across all stores
    availableEngines: (state) => {
      const files: ModelFile[] = []
      Object.values(state.filesByStore).forEach((storeFiles) => {
        files.push(...storeFiles)
      })
      return getAvailableEngines(files)
    },

    // Check if any store has errors
    hasErrors: (state): boolean => {
      return Object.keys(state.errors).length > 0
    },

    // Get errors as an array for display
    errorList: (state): Array<{ root: string; error: string }> => {
      return Object.entries(state.errors).map(([storeId, error]) => ({
        root: storeId,
        error,
      }))
    },
  },

  actions: {
    /**
     * Load custom stores from localStorage
     */
    loadStoresFromStorage(): void {
      try {
        const stored = localStorage.getItem(STORES_STORAGE_KEY)
        if (stored) {
          const customStores: AnyModelStore[] = JSON.parse(stored)
          // Merge with default store, avoiding duplicates
          const allStores = [DEFAULT_GITHUB_STORE, ...customStores]
          const uniqueStores = allStores.filter(
            (store, index, self) => index === self.findIndex((s) => s.id === store.id),
          )
          this.stores = uniqueStores
        }
      } catch (error) {
        console.error('Error loading stores from localStorage:', error)
      }
    },

    /**
     * Save custom stores to localStorage
     */
    saveStoresToStorage(): void {
      try {
        // Save only custom stores (not the default one)
        const customStores = this.stores.filter((s) => s.id !== DEFAULT_GITHUB_STORE.id)
        localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(customStores))
      } catch (error) {
        console.error('Error saving stores to localStorage:', error)
      }
    },

    /**
     * Fetch files from all configured stores
     */
    async fetchAllFiles(): Promise<void> {
      this.loading = true
      try {
        console.log('Fetching community model files from all stores...')

        // Fetch from store system
        const storeResult = await fetchFromAllStores(this.stores)
        console.log('Fetched from stores:', storeResult)
        this.filesByStore = storeResult.filesByStore
        Object.assign(this.errors, storeResult.errors)
      } catch (error) {
        console.error('Error fetching all model files:', error)
        // Set a general error if the whole operation fails
        this.errors = { general: error instanceof Error ? error.message : 'Unknown error' }
      } finally {
        this.loading = false
      }
    },

    /**
     * Refresh data from all repositories
     */
    async refreshData(): Promise<void> {
      await this.fetchAllFiles()
    },

    /**
     * Filter files across all stores
     */
    filteredFiles(
      searchQuery: string,
      selectedEngine: string,
      importStatus: 'all' | 'imported' | 'not-imported',
      modelStore: ModelConfigStoreType,
      remote: string | null = null,
    ): ModelFile[] {
      const modelExists = (name: string): boolean => {
        return name in modelStore.models
      }
      let base = this.allFiles
      if (remote) {
        base = this.filesByStore[remote]
      }
      if (!base) {
        return []
      }
      return filterModelFiles(base, searchQuery, selectedEngine, importStatus, modelExists)
    },

    /**
     * Get files from a specific store
     */
    getFilesByStore(storeId: string): ModelFile[] {
      return this.filesByStore[storeId] || []
    },

    /**
     * Initialize the store - load from storage and fetch initial data
     */
    async initialize(): Promise<void> {
      this.loadStoresFromStorage()
      await this.fetchAllFiles()
    },

    /**
     * Add a new generic store
     */
    async addStore(store: AnyModelStore): Promise<boolean> {
      // Validate store configuration
      if (store.type === 'generic') {
        if (!store.baseUrl || !store.name) {
          throw new Error('Base URL and name are required for generic stores')
        }
      } else if (store.type === 'github') {
        if (!store.owner || !store.repo || !store.branch) {
          throw new Error('Owner, repo, and branch are required for GitHub stores')
        }
      }

      // Check if store already exists
      const exists = this.stores.some((s) => s.id === store.id)
      if (exists) {
        throw new Error('This store is already added')
      }

      this.addingStore = true
      try {
        // Add to stores list
        this.stores.push(store)

        // Save to localStorage
        this.saveStoresToStorage()

        // Fetch data from the new store
        await this.fetchAllFiles()

        return true
      } catch (error) {
        console.error('Error adding store:', error)
        // Remove the store if it was added but failed to fetch
        const addedIndex = this.stores.findIndex((s) => s.id === store.id)
        if (addedIndex > -1) {
          this.stores.splice(addedIndex, 1)
        }
        throw error
      } finally {
        this.addingStore = false
      }
    },

    /**
     * Remove a store
     */
    removeStore(storeId: string): void {
      const index = this.stores.findIndex((s) => s.id === storeId)

      if (index > -1) {
        this.stores.splice(index, 1)

        // Remove associated data
        delete this.filesByStore[storeId]
        delete this.errors[storeId]

        // Save to localStorage
        this.saveStoresToStorage()
      }
    },

    /**
     * Open the add store modal
     */
    openAddStoreModal(): void {
      this.showAddStoreModal = true
      this.newStore = {
        type: 'generic',
        name: '',
        baseUrl: '',
        owner: '',
        repo: '',
        branch: 'main',
      }
    },

    /**
     * Close the add store modal
     */
    closeAddStoreModal(): void {
      this.showAddStoreModal = false
      this.newStore = {
        type: 'generic',
        name: '',
        baseUrl: '',
        owner: '',
        repo: '',
        branch: 'main',
      }
    },

    /**
     * Handle the complete add store flow including modal management
     */
    async handleAddStore(): Promise<void> {
      const { type, name, baseUrl, owner, repo, branch } = this.newStore

      if (type === 'generic') {
        if (!name || !baseUrl) {
          throw new Error('Please fill in all required fields')
        }

        // Generate ID from base URL
        const id = baseUrl.replace(/^https?:\/\//, '').replace(/\//g, '-')

        const store: GenericModelStore = {
          type: 'generic',
          id,
          name,
          baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
        }

        await this.addStore(store)
      } else {
        if (!name || !owner || !repo || !branch) {
          throw new Error('Please fill in all required fields')
        }

        const id = `${owner}-${repo}-${branch}`

        const store: GithubModelStore = {
          type: 'github',
          id,
          name,
          owner,
          repo,
          branch,
        }

        await this.addStore(store)
      }

      this.closeAddStoreModal()
    },

    /**
     * Clear all errors
     */
    clearErrors(): void {
      this.errors = {}
    },

    /**
     * Clear error for a specific store
     */
    clearStoreError(storeId: string): void {
      delete this.errors[storeId]
    },
  },
})

export type CommunityApiStoreType = ReturnType<typeof useCommunityApiStore>
export default useCommunityApiStore
