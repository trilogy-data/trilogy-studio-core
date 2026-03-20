import { defineStore } from 'pinia'
import type { GenericModelStore } from '../remotes/models'
import type { LocalStoreJob, RemoteJobResponse, StoreFilesResponse } from '../remotes/jobs'
import { fetchStoreFiles, fetchStoreJob, submitStoreJob } from '../remotes/jobsService'
import useCommunityApiStore, { type StoreStatus } from './communityApiStore'

const pollers = new Map<string, ReturnType<typeof setInterval>>()
const JOBS_STORAGE_KEY = 'trilogy-jobs-api-state'

interface JobsApiState {
  filesByStore: Record<string, StoreFilesResponse>
  jobsByStore: Record<string, LocalStoreJob[]>
  errors: Record<string, string>
  storeStatus: Record<string, StoreStatus>
  loadingByStore: Record<string, boolean>
  submittingByTarget: Record<string, boolean>
  pollingByJob: Record<string, boolean>
}

const toSubmittingKey = (storeId: string, target: string, operation: 'run' | 'refresh'): string =>
  `${storeId}::${operation}::${target}`
const toPollingKey = (storeId: string, jobId: string): string => `${storeId}::${jobId}`

const sortJobs = (jobs: LocalStoreJob[]): LocalStoreJob[] =>
  [...jobs].sort((left, right) => right.submittedAt - left.submittedAt)

const useJobsApiStore = defineStore('jobsApi', {
  state: (): JobsApiState => ({
    filesByStore: {},
    jobsByStore: {},
    errors: {},
    storeStatus: {},
    loadingByStore: {},
    submittingByTarget: {},
    pollingByJob: {},
  }),

  actions: {
    getGenericStore(storeId: string): GenericModelStore | null {
      const communityStore = useCommunityApiStore()
      const store = communityStore.stores.find((item) => item.id === storeId)

      if (!store || store.type !== 'generic') {
        return null
      }

      return store
    },

    getGenericStores(): GenericModelStore[] {
      const communityStore = useCommunityApiStore()
      return communityStore.stores.filter((store): store is GenericModelStore => store.type === 'generic')
    },

    getStoreJobs(storeId: string): LocalStoreJob[] {
      return sortJobs(this.jobsByStore[storeId] || [])
    },

    getJobsForTarget(storeId: string, target: string): LocalStoreJob[] {
      return this.getStoreJobs(storeId).filter((job) => job.target === target)
    },

    getStoreStatus(storeId: string): StoreStatus | 'running' {
      const hasRunningJob = (this.jobsByStore[storeId] || []).some((job) => job.status === 'running')
      if (hasRunningJob) {
        return 'running'
      }

      return this.storeStatus[storeId] || 'idle'
    },

    isSubmitting(storeId: string, target: string, operation: 'run' | 'refresh'): boolean {
      return !!this.submittingByTarget[toSubmittingKey(storeId, target, operation)]
    },

    isPollingJob(storeId: string, jobId: string): boolean {
      return !!this.pollingByJob[toPollingKey(storeId, jobId)]
    },

    clearStoreError(storeId: string): void {
      delete this.errors[storeId]
      this.storeStatus[storeId] = 'idle'
    },

    clearStoreData(storeId: string): void {
      Array.from(pollers.keys())
        .filter((pollerKey) => pollerKey.startsWith(`${storeId}:`))
        .forEach((pollerKey) => {
          const intervalId = pollers.get(pollerKey)
          if (intervalId) {
            clearInterval(intervalId)
          }
          pollers.delete(pollerKey)
        })
      delete this.filesByStore[storeId]
      delete this.jobsByStore[storeId]
      delete this.errors[storeId]
      delete this.storeStatus[storeId]
      delete this.loadingByStore[storeId]
      this.saveJobsToStorage()
    },

    async initialize(): Promise<void> {
      const communityStore = useCommunityApiStore()
      communityStore.loadStoresFromStorage()
      this.loadJobsFromStorage()
      this.resumePolling()
      await this.refreshAllStores()
    },

    saveJobsToStorage(): void {
      try {
        localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(this.jobsByStore))
      } catch (error) {
        console.error('Error saving jobs to localStorage:', error)
      }
    },

    loadJobsFromStorage(): void {
      try {
        const storedJobs = localStorage.getItem(JOBS_STORAGE_KEY)
        if (!storedJobs) {
          return
        }

        this.jobsByStore = JSON.parse(storedJobs)
      } catch (error) {
        console.error('Error loading jobs from localStorage:', error)
      }
    },

    resumePolling(): void {
      Object.entries(this.jobsByStore).forEach(([storeId, jobs]) => {
        jobs.forEach((job) => {
          if (job.status === 'running' || job.pollingState === 'unable-to-fetch') {
            this.startPolling(storeId, job.job_id)
          }
        })
      })
    },

    async refreshAllStores(): Promise<void> {
      const stores = this.getGenericStores()

      await Promise.all(stores.map((store) => this.fetchFilesForStore(store.id)))
    },

    async fetchFilesForStore(storeId: string): Promise<void> {
      const store = this.getGenericStore(storeId)
      if (!store) {
        return
      }

      this.loadingByStore[storeId] = true
      this.storeStatus[storeId] = 'idle'

      try {
        this.filesByStore[storeId] = await fetchStoreFiles(store)
        delete this.errors[storeId]
        this.storeStatus[storeId] = 'connected'
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch files'
        this.errors[storeId] = message
        this.storeStatus[storeId] = 'failed'
      } finally {
        this.loadingByStore[storeId] = false
      }
    },

    upsertJob(storeId: string, job: LocalStoreJob): void {
      const currentJobs = this.jobsByStore[storeId] || []
      const existingIndex = currentJobs.findIndex((item) => item.job_id === job.job_id)

      if (existingIndex === -1) {
        this.jobsByStore[storeId] = sortJobs([job, ...currentJobs])
        this.saveJobsToStorage()
        return
      }

      const nextJobs = [...currentJobs]
      nextJobs[existingIndex] = {
        ...nextJobs[existingIndex],
        ...job,
      }
      this.jobsByStore[storeId] = sortJobs(nextJobs)
      this.saveJobsToStorage()
    },

    replaceJobs(storeId: string, jobs: LocalStoreJob[]): void {
      this.jobsByStore[storeId] = sortJobs(jobs)
      this.saveJobsToStorage()
    },

    stopPolling(storeId: string, jobId: string): void {
      const pollerKey = `${storeId}:${jobId}`
      const intervalId = pollers.get(pollerKey)
      if (!intervalId) {
        return
      }

      clearInterval(intervalId)
      pollers.delete(pollerKey)
    },

    startPolling(storeId: string, jobId: string): void {
      this.stopPolling(storeId, jobId)

      const pollerKey = `${storeId}:${jobId}`
      const intervalId = setInterval(() => {
        void this.pollJob(storeId, jobId)
      }, 1000)

      pollers.set(pollerKey, intervalId)
    },

    buildLocalJob(
      storeId: string,
      target: string,
      operation: 'run' | 'refresh',
      response: RemoteJobResponse,
      submittedAt?: number,
    ): LocalStoreJob {
      const now = Date.now()
      return {
        ...response,
        storeId,
        target,
        operation,
        submittedAt: submittedAt || now,
        updatedAt: now,
        pollingState: 'ok',
        pollingError: null,
      }
    },

    async submitJob(
      storeId: string,
      target: string,
      operation: 'run' | 'refresh',
    ): Promise<LocalStoreJob> {
      const store = this.getGenericStore(storeId)
      if (!store) {
        throw new Error('Store not found or does not support jobs')
      }

      const submittingKey = toSubmittingKey(storeId, target, operation)
      this.submittingByTarget[submittingKey] = true

      try {
        const response = await submitStoreJob(store, operation, target)
        const localJob = this.buildLocalJob(storeId, target, operation, response)

        this.upsertJob(storeId, localJob)
        delete this.errors[storeId]
        this.storeStatus[storeId] = 'connected'

        if (localJob.status === 'running') {
          this.startPolling(storeId, localJob.job_id)
        }

        return localJob
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to ${operation} ${target}`
        this.errors[storeId] = message
        this.storeStatus[storeId] = 'failed'
        throw error
      } finally {
        delete this.submittingByTarget[submittingKey]
      }
    },

    async pollJob(storeId: string, jobId: string): Promise<void> {
      const pollingKey = toPollingKey(storeId, jobId)
      if (this.pollingByJob[pollingKey]) {
        return
      }

      this.pollingByJob[pollingKey] = true
      const store = this.getGenericStore(storeId)
      const existingJob = (this.jobsByStore[storeId] || []).find((job) => job.job_id === jobId)
      if (!store || !existingJob) {
        this.stopPolling(storeId, jobId)
        delete this.pollingByJob[pollingKey]
        return
      }

      try {
        const response = await fetchStoreJob(store, jobId)
        const localJob = this.buildLocalJob(
          storeId,
          existingJob.target,
          existingJob.operation,
          response,
          existingJob.submittedAt,
        )
        this.upsertJob(storeId, localJob)

        if (localJob.status !== 'running') {
          this.stopPolling(storeId, jobId)
          void this.fetchFilesForStore(storeId)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to poll job ${jobId}`
        const degradedJob: LocalStoreJob = {
          ...existingJob,
          pollingState: 'unable-to-fetch',
          pollingError: message,
        }
        this.upsertJob(storeId, degradedJob)
      } finally {
        delete this.pollingByJob[pollingKey]
      }
    },
  },
})

export type JobsApiStoreType = ReturnType<typeof useJobsApiStore>
export default useJobsApiStore
