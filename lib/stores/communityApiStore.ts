import { defineStore } from 'pinia'
import {
  fetchAllModelFiles,
  filterModelFiles,
  getAvailableEngines,
} from '../remotes/githubApiService'
import {
  type ModelFile,
  type ModelRoot,
  type AnyModelStore,
  type GithubModelStore,
  type GenericModelStore,
  DEFAULT_GITHUB_STORE,
} from '../remotes/models'
import { fetchFromAllStores } from '../remotes/storeService'
import type { ModelConfigStoreType } from './modelStore'

const STORES_STORAGE_KEY = 'trilogy-community-stores'

export interface CommunityApiState {
  // Multiple store support (new)
  stores: AnyModelStore[]
  filesByStore: Record<string, ModelFile[]>

  // Backward compatibility
  modelRoots: ModelRoot[]
  filesByRoot: Record<string, ModelFile[]>

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

  // Deprecated modal state
  showAddRepositoryModal: boolean
  addingRepository: boolean
  newRepo: ModelRoot
}

const useCommunityApiStore = defineStore('communityApi', {
  state: (): CommunityApiState => ({
    // Initialize with default store
    stores: [DEFAULT_GITHUB_STORE],
    filesByStore: {},

    // Backward compatibility - empty by default since we're using the new stores system
    modelRoots: [],
    filesByRoot: {},

    errors: {},
    loading: false,

    // New modal state
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

    // Deprecated modal state
    showAddRepositoryModal: false,
    addingRepository: false,
    newRepo: {
      owner: '',
      repo: '',
      branch: 'main',
      displayName: '',
    },
  }),

  getters: {
    // Get all files from all stores
    allFiles: (state): ModelFile[] => {
      const files: ModelFile[] = []
      Object.values(state.filesByStore).forEach((storeFiles) => {
        files.push(...storeFiles)
      })
      // Backward compatibility: also include files from filesByRoot
      Object.values(state.filesByRoot).forEach((rootFiles) => {
        files.push(...rootFiles)
      })
      return files
    },

    // Get available engines across all stores
    availableEngines: (state) => {
      const files: ModelFile[] = []
      Object.values(state.filesByStore).forEach((storeFiles) => {
        files.push(...storeFiles)
      })
      Object.values(state.filesByRoot).forEach((rootFiles) => {
        files.push(...rootFiles)
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

        // Fetch from new store system
        const storeResult = await fetchFromAllStores(this.stores)
        console.log('Fetched from stores:', storeResult)
        this.filesByStore = storeResult.filesByStore
        Object.assign(this.errors, storeResult.errors)

        // Backward compatibility: also fetch from old modelRoots system if any exist beyond default
        if (this.modelRoots.length > 0) {
          const rootResult = await fetchAllModelFiles(this.modelRoots)
          console.log('Fetched from legacy roots:', rootResult)
          this.filesByRoot = rootResult.filesByRoot
          Object.assign(this.errors, rootResult.errors)
        }
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
     * Add a new model repository
     */
    async addRepository(newModelRoot: ModelRoot): Promise<boolean> {
      if (!newModelRoot.owner || !newModelRoot.repo || !newModelRoot.branch) {
        throw new Error('Owner, repo, and branch are required')
      }

      // Check if repository already exists
      const repoKey = `${newModelRoot.owner}/${newModelRoot.repo}:${newModelRoot.branch}`
      const exists = this.modelRoots.some(
        (root) => `${root.owner}/${root.repo}:${root.branch}` === repoKey,
      )

      if (exists) {
        throw new Error('This repository is already added')
      }

      this.addingRepository = true
      try {
        // Add display name if not provided
        const modelRoot: ModelRoot = {
          ...newModelRoot,
          displayName:
            newModelRoot.displayName ||
            `${newModelRoot.owner}/${newModelRoot.repo}:${newModelRoot.branch}`,
        }

        // Add to the list of model roots
        this.modelRoots.push(modelRoot)

        // Refresh data to include the new repository
        await this.fetchAllFiles()

        return true
      } catch (error) {
        console.error('Error adding repository:', error)
        // Remove the repository if it was added but failed to fetch
        const addedIndex = this.modelRoots.findIndex(
          (root) => `${root.owner}/${root.repo}:${root.branch}` === repoKey,
        )
        if (addedIndex > -1) {
          this.modelRoots.splice(addedIndex, 1)
        }
        throw error
      } finally {
        this.addingRepository = false
      }
    },

    /**
     * Remove a model repository
     */
    removeRepository(modelRoot: ModelRoot): void {
      const repoKey = `${modelRoot.owner}/${modelRoot.repo}:${modelRoot.branch}`
      const index = this.modelRoots.findIndex(
        (root) => `${root.owner}/${root.repo}:${root.branch}` === repoKey,
      )

      if (index > -1) {
        this.modelRoots.splice(index, 1)

        // Remove associated data
        const rootKey = `${modelRoot.owner}-${modelRoot.repo}-${modelRoot.branch}`
        delete this.filesByRoot[rootKey]
        delete this.errors[rootKey]
      }
    },

    /**
     * Filter files across all repositories
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
        base = this.filesByRoot[remote]
      }
      if (!base) {
        return []
      }
      return filterModelFiles(base, searchQuery, selectedEngine, importStatus, modelExists)
    },

    /**
     * Get files from a specific repository
     */
    getFilesByRepository(modelRoot: ModelRoot): ModelFile[] {
      const rootKey = `${modelRoot.owner}-${modelRoot.repo}-${modelRoot.branch}`
      return this.filesByRoot[rootKey] || []
    },

    /**
     * Modal management actions
     */
    openAddRepositoryModal(): void {
      this.showAddRepositoryModal = true
      this.newRepo = {
        owner: '',
        repo: '',
        branch: 'main',
        displayName: '',
      }
    },

    closeAddRepositoryModal(): void {
      this.showAddRepositoryModal = false
      this.newRepo = {
        owner: '',
        repo: '',
        branch: 'main',
        displayName: '',
      }
    },

    /**
     * Handle the complete add repository flow including modal management
     */
    async handleAddRepository(): Promise<void> {
      if (!this.newRepo.owner || !this.newRepo.repo || !this.newRepo.branch) {
        throw new Error('Please fill in all required fields')
      }

      try {
        await this.addRepository({ ...this.newRepo })
        this.closeAddRepositoryModal()
      } catch (error) {
        // Re-throw to let the component handle the error display
        throw error
      }
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
     * Clear error for a specific repository
     */
    clearRepositoryError(modelRoot: ModelRoot): void {
      const rootKey = `${modelRoot.owner}-${modelRoot.repo}-${modelRoot.branch}`
      delete this.errors[rootKey]
    },
  },
})

export type CommunityApiStoreType = ReturnType<typeof useCommunityApiStore>
export default useCommunityApiStore
