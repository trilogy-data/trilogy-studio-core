import { defineStore } from 'pinia'
import {
  fetchAllModelFiles,
  filterModelFiles,
  getAvailableEngines,

} from '../remotes/githubApiService'
import {

  type ModelFile,
  type ModelRoot,
  DEFAULT_MODEL_ROOT
} from '../remotes/models'
import type { ModelConfigStoreType } from './modelStore'

export interface CommunityApiState {
  // Multiple repository support
  modelRoots: ModelRoot[]
  filesByRoot: Record<string, ModelFile[]>
  errors: Record<string, string>
  loading: boolean


  // Modal state for adding repositories
  showAddRepositoryModal: boolean
  addingRepository: boolean
  newRepo: ModelRoot
}

const useCommunityApiStore = defineStore('communityApi', {
  state: (): CommunityApiState => ({
    // Initialize with default model root
    modelRoots: [DEFAULT_MODEL_ROOT],
    filesByRoot: {},
    errors: {},
    loading: false,

    // Modal state
    showAddRepositoryModal: false,
    addingRepository: false,
    newRepo: {
      owner: '',
      repo: '',
      branch: 'main',
      displayName: ''
    }
  }),

  getters: {
    // Get all files from all repositories
    allFiles: (state): ModelFile[] => {
      const files: ModelFile[] = []
      Object.values(state.filesByRoot).forEach(rootFiles => {
        files.push(...rootFiles)
      })
      return files
    },

    // Get available engines across all repositories
    availableEngines: (state) => {
      const files: ModelFile[] = []
      Object.values(state.filesByRoot).forEach(rootFiles => {
        files.push(...rootFiles)
      })
      return getAvailableEngines(files)
    },



    // Check if any repository has errors
    hasErrors: (state): boolean => {
      return Object.keys(state.errors).length > 0
    },

    // Get errors as an array for display
    errorList: (state): Array<{ root: string, error: string }> => {
      return Object.entries(state.errors).map(([rootKey, error]) => ({
        root: rootKey,
        error
      }))
    }
  },

  actions: {
    /**
     * Fetch files from all configured model repositories
     */
    async fetchAllFiles(): Promise<void> {
      this.loading = true
      try {
        console.log('Fetching community model files from all repositories...')
        const result = await fetchAllModelFiles(this.modelRoots)
        console.log('Fetched community model files:', result)

        this.filesByRoot = result.filesByRoot
        this.errors = result.errors
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
      const exists = this.modelRoots.some(root =>
        `${root.owner}/${root.repo}:${root.branch}` === repoKey
      )

      if (exists) {
        throw new Error('This repository is already added')
      }

      this.addingRepository = true
      try {
        // Add display name if not provided
        const modelRoot: ModelRoot = {
          ...newModelRoot,
          displayName: newModelRoot.displayName || `${newModelRoot.owner}/${newModelRoot.repo}:${newModelRoot.branch}`
        }

        // Add to the list of model roots
        this.modelRoots.push(modelRoot)

        // Refresh data to include the new repository
        await this.fetchAllFiles()

        return true
      } catch (error) {
        console.error('Error adding repository:', error)
        // Remove the repository if it was added but failed to fetch
        const addedIndex = this.modelRoots.findIndex(root =>
          `${root.owner}/${root.repo}:${root.branch}` === repoKey
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
      const index = this.modelRoots.findIndex(root =>
        `${root.owner}/${root.repo}:${root.branch}` === repoKey
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
      remote: string | null = null
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
        displayName: ''
      }
    },

    closeAddRepositoryModal(): void {
      this.showAddRepositoryModal = false
      this.newRepo = {
        owner: '',
        repo: '',
        branch: 'main',
        displayName: ''
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
     * Initialize the store - fetch initial data
     */
    async initialize(): Promise<void> {
      await this.fetchAllFiles()
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
    }
  },
})

export type CommunityApiStoreType = ReturnType<typeof useCommunityApiStore>
export default useCommunityApiStore