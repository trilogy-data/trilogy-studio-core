import { defineStore } from 'pinia'
import { filterModelFiles, getAvailableEngines } from '../remotes/modelApiService'
import {
  type ModelFile,
  type AnyModelStore,
  type GithubModelStore,
  type GenericModelStore,
  DEFAULT_GITHUB_STORE,
} from '../remotes/models'
import { fetchFromAllStores, fetchFromStore } from '../remotes/storeService'
import {
  buildGenericStoreFallbackName,
  buildGenericStoreId,
  normalizeGenericStoreBaseUrl,
} from '../remotes/genericStoreMetadata'
import type { ModelConfigStoreType } from './modelStore'

const STORES_STORAGE_KEY = 'trilogy-community-stores'

const applyUrlTokenDefaults = (stores: AnyModelStore[]): void => {
  const params = new URLSearchParams(window.location.search)
  const storeParam = params.get('store')
  const tokenParam = params.get('token')

  if (!storeParam || !tokenParam) {
    return
  }

  const normalizedStoreUrl = normalizeGenericStoreBaseUrl(storeParam)
  const matchingStore = stores.find(
    (store): store is GenericModelStore =>
      store.type === 'generic' &&
      normalizeGenericStoreBaseUrl(store.baseUrl) === normalizedStoreUrl,
  )

  if (matchingStore && !matchingStore.token) {
    matchingStore.token = tokenParam
  }
}

export type StoreStatus = 'idle' | 'connected' | 'failed'

export interface CommunityApiState {
  // Multiple store support
  stores: AnyModelStore[]
  filesByStore: Record<string, ModelFile[]>

  errors: Record<string, string>
  storeStatus: Record<string, StoreStatus>
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
    // Initialize default store status as idle
    storeStatus: { [DEFAULT_GITHUB_STORE.id]: 'idle' },
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
    errorList: (state): Array<{ root: string; name: string; error: string }> => {
      return Object.entries(state.errors).map(([storeId, error]) => {
        const store = state.stores.find((s) => s.id === storeId)
        return {
          root: storeId,
          name: store?.name || storeId,
          error,
        }
      })
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
          const existingStoresById = new Map(this.stores.map((store) => [store.id, store]))
          const mergedCustomStores = customStores.map((store) => {
            const existing = existingStoresById.get(store.id)
            if (!existing || existing.type !== store.type) {
              return store
            }

            if (store.type === 'generic') {
              const existingGeneric = existing.type === 'generic' ? existing : null
              return {
                ...store,
                ...existing,
                token: existingGeneric?.token || store.token,
              }
            }

            return {
              ...store,
              ...existing,
            }
          })
          // Merge with default store, avoiding duplicates
          const allStores = [DEFAULT_GITHUB_STORE, ...mergedCustomStores]
          const uniqueStores = allStores.filter(
            (store, index, self) => index === self.findIndex((s) => s.id === store.id),
          )
          applyUrlTokenDefaults(uniqueStores)
          this.stores = uniqueStores

          // Initialize all loaded stores with 'idle' status
          uniqueStores.forEach((store) => {
            if (!this.storeStatus[store.id]) {
              this.storeStatus[store.id] = 'idle'
            }
          })
        }
        if (!stored) {
          applyUrlTokenDefaults(this.stores)
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
        // Save only custom stores (not the default one). Tokens are kept
        // because they're per-serve-run ephemeral auth for the store, not
        // long-lived secrets — and losing them on refresh breaks the ability
        // to refetch remote-backed editors/models.
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

      // Set all stores to 'idle' before fetching to show gray status
      for (const store of this.stores) {
        this.storeStatus[store.id] = 'idle'
      }

      try {
        console.log(
          `Fetching community model files from ${this.stores.map((s) => s.id).join(', ')}...`,
        )

        // Fetch from store system with real-time callback
        const storeResult = await fetchFromAllStores(this.stores, (storeId, result) => {
          // Update status immediately as each store completes
          this.filesByStore[storeId] = result.files

          if (result.error) {
            this.errors[storeId] = result.error
            this.storeStatus[storeId] = 'failed'
          } else {
            this.storeStatus[storeId] = 'connected'
          }

          console.log(`Store ${storeId} completed: ${result.error ? 'failed' : 'success'}`)
        })

        console.log('All stores fetched:', storeResult)
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

    async fetchStoreFiles(storeId: string): Promise<void> {
      const store = this.stores.find((item) => item.id === storeId)
      if (!store) {
        return
      }

      this.loading = true
      this.storeStatus[storeId] = 'idle'

      try {
        const result = await fetchFromStore(store)
        this.filesByStore[storeId] = result.files

        if (result.error) {
          this.errors[storeId] = result.error
          this.storeStatus[storeId] = 'failed'
        } else {
          delete this.errors[storeId]
          this.storeStatus[storeId] = 'connected'
        }
      } finally {
        this.loading = false
      }
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
        if (!store.baseUrl) {
          throw new Error('Base URL is required for generic stores')
        }

        store.baseUrl = normalizeGenericStoreBaseUrl(store.baseUrl)
        store.id = store.id || buildGenericStoreId(store.baseUrl)
        store.name = store.name || buildGenericStoreFallbackName(store.baseUrl)
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

    updateStoreToken(storeId: string, token: string): void {
      const store = this.stores.find((item) => item.id === storeId)
      if (!store || store.type !== 'generic') {
        return
      }

      store.token = token || undefined
      this.saveStoresToStorage()
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
        if (!baseUrl) {
          throw new Error('Please fill in all required fields')
        }

        const normalizedBaseUrl = normalizeGenericStoreBaseUrl(baseUrl)
        const id = buildGenericStoreId(normalizedBaseUrl)

        const store: GenericModelStore = {
          type: 'generic',
          id,
          name: name || buildGenericStoreFallbackName(normalizedBaseUrl),
          baseUrl: normalizedBaseUrl,
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
      // Update status to idle when clearing error
      this.storeStatus[storeId] = 'idle'
    },

    /**
     * Get status for a specific store
     */
    getStoreStatus(storeId: string): StoreStatus {
      return this.storeStatus[storeId] || 'idle'
    },
  },
})

export type CommunityApiStoreType = ReturnType<typeof useCommunityApiStore>
export default useCommunityApiStore
