import { defineStore } from 'pinia'
import type { GenericModelStore } from '../remotes/models'
import type { LocalStoreJob, RemoteJobResponse, StoreFilesResponse } from '../remotes/jobs'
import {
  JobsServiceError,
  cancelStoreJob,
  fetchStoreFiles,
  fetchStoreJob,
  fetchStoreState,
  submitStoreJob,
} from '../remotes/jobsService'
import {
  buildStateKey,
  parseStateKey,
  stateTargetCovers,
  type StateSnapshot,
} from '../remotes/state'
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
  stoppingByJob: Record<string, boolean>
  // Snapshots are deliberately not persisted here: the server keeps its own
  // on-disk cache that survives restarts, so re-reading it is cheap and always
  // more current than anything we could have stored.
  stateByTarget: Record<string, StoredState>
  stateLoadingByTarget: Record<string, boolean>
  stateErrorsByTarget: Record<string, string>
}

interface StoredState {
  snapshot: StateSnapshot
  cached: boolean | null
  computedAt: string | null
}

const toSubmittingKey = (storeId: string, target: string, operation: 'run' | 'refresh'): string =>
  `${storeId}::${operation}::${target}`
const toPollingKey = (storeId: string, jobId: string): string => `${storeId}::${jobId}`

const normalizeLoadedJob = (job: LocalStoreJob): LocalStoreJob => {
  const legacyPollingState: string | undefined = (job as { pollingState?: string }).pollingState
  const pollingState =
    legacyPollingState === 'unable-to-fetch' ? 'stopped' : (job.pollingState ?? 'ok')
  return {
    ...job,
    pollingState,
    pollingError:
      pollingState === 'stopped' && !job.pollingError && legacyPollingState === 'unable-to-fetch'
        ? 'Polling stopped locally.'
        : (job.pollingError ?? null),
  }
}

const describeStateError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'Failed to fetch state'

  if (!(error instanceof JobsServiceError)) {
    return message
  }

  if (error.status === 401) {
    return 'Authentication required. Set this store’s token to read state.'
  }

  // 0.3.305 and earlier accept file targets only; directory state landed in 306.
  if (error.status === 400 && /directory/i.test(message)) {
    return `${message} Directory state requires a Trilogy server on 0.3.306 or newer.`
  }

  return message
}

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
    stoppingByJob: {},
    stateByTarget: {},
    stateLoadingByTarget: {},
    stateErrorsByTarget: {},
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
      return communityStore.stores.filter(
        (store): store is GenericModelStore => store.type === 'generic',
      )
    },

    getStoreJobs(storeId: string): LocalStoreJob[] {
      return sortJobs(this.jobsByStore[storeId] || [])
    },

    getJobsForTarget(storeId: string, target: string): LocalStoreJob[] {
      return this.getStoreJobs(storeId).filter((job) => job.target === target)
    },

    getStoreStatus(storeId: string): StoreStatus | 'running' {
      const hasRunningJob = (this.jobsByStore[storeId] || []).some(
        (job) => job.status === 'running' && (job.pollingState ?? 'ok') === 'ok',
      )
      if (hasRunningJob) {
        return 'running'
      }

      return this.storeStatus[storeId] || 'idle'
    },

    isSubmitting(storeId: string, target: string, operation: 'run' | 'refresh'): boolean {
      return !!this.submittingByTarget[toSubmittingKey(storeId, target, operation)]
    },

    getState(storeId: string, target: string): StateSnapshot | null {
      return this.stateByTarget[buildStateKey(storeId, target)]?.snapshot || null
    },

    getStateMeta(storeId: string, target: string): Omit<StoredState, 'snapshot'> | null {
      const stored = this.stateByTarget[buildStateKey(storeId, target)]
      return stored ? { cached: stored.cached, computedAt: stored.computedAt } : null
    },

    isStateLoading(storeId: string, target: string): boolean {
      return !!this.stateLoadingByTarget[buildStateKey(storeId, target)]
    },

    getStateError(storeId: string, target: string): string {
      return this.stateErrorsByTarget[buildStateKey(storeId, target)] || ''
    },

    isPollingJob(storeId: string, jobId: string): boolean {
      return !!this.pollingByJob[toPollingKey(storeId, jobId)]
    },

    isStoppingJob(storeId: string, jobId: string): boolean {
      return !!this.stoppingByJob[toPollingKey(storeId, jobId)]
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
      this.clearStateForStore(storeId)
      this.saveJobsToStorage()
    },

    clearStateForStore(storeId: string): void {
      const belongsToStore = (key: string): boolean => parseStateKey(key)?.storeId === storeId

      const purge = (record: Record<string, unknown>): void => {
        Object.keys(record)
          .filter(belongsToStore)
          .forEach((key) => delete record[key])
      }

      purge(this.stateByTarget)
      purge(this.stateLoadingByTarget)
      purge(this.stateErrorsByTarget)
    },

    clearStateError(storeId: string, target: string): void {
      delete this.stateErrorsByTarget[buildStateKey(storeId, target)]
    },

    /**
     * Re-read already-loaded snapshots that cover `target` after a job
     * finished. Only targets the user has already opened are refreshed —
     * reading an unopened target could miss the server cache and spend
     * warehouse queries nobody asked for.
     *
     * Deliberately unforced: the server drops its cached snapshot when a
     * run/refresh job finishes, so a plain read already returns recomputed
     * state and forcing here would probe the warehouse twice.
     */
    refreshLoadedStateForTarget(storeId: string, target: string): void {
      Object.keys(this.stateByTarget).forEach((key) => {
        const parsed = parseStateKey(key)
        if (!parsed || parsed.storeId !== storeId) {
          return
        }

        if (stateTargetCovers(parsed.target, target)) {
          void this.fetchStateForTarget(storeId, parsed.target)
        }
      })
    },

    /**
     * Read `/state` for a target.
     *
     * The server serves a cached snapshot unless `force` is set, in which case
     * it re-probes the warehouse — seconds of billed queries. Either way this
     * only runs from an explicit user action or after a job finished, never on
     * navigation: a cache miss still computes.
     *
     * Errors stay scoped to the target — a failed probe must not mark the
     * whole store as failed.
     */
    async fetchStateForTarget(storeId: string, target: string, force = false): Promise<void> {
      const store = this.getGenericStore(storeId)
      if (!store) {
        return
      }

      const stateKey = buildStateKey(storeId, target)
      if (this.stateLoadingByTarget[stateKey]) {
        return
      }

      this.stateLoadingByTarget[stateKey] = true
      delete this.stateErrorsByTarget[stateKey]

      try {
        const result = await fetchStoreState(store, target, force)
        this.stateByTarget[stateKey] = {
          snapshot: result.snapshot,
          cached: result.cached,
          computedAt: result.computedAt,
        }
      } catch (error) {
        this.stateErrorsByTarget[stateKey] = describeStateError(error)
      } finally {
        delete this.stateLoadingByTarget[stateKey]
      }
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

        const parsedJobs = JSON.parse(storedJobs) as Record<string, LocalStoreJob[]>
        this.jobsByStore = Object.fromEntries(
          Object.entries(parsedJobs).map(([storeId, jobs]) => [
            storeId,
            (jobs || []).map((job) => normalizeLoadedJob(job)),
          ]),
        )
      } catch (error) {
        console.error('Error loading jobs from localStorage:', error)
      }
    },

    resumePolling(): void {
      Object.entries(this.jobsByStore).forEach(([storeId, jobs]) => {
        jobs.forEach((job) => {
          if (job.status === 'running' && (job.pollingState ?? 'ok') === 'ok') {
            this.startPolling(storeId, job.job_id)
          }
        })
      })
    },

    async resumeAuthPausedJobs(storeId: string): Promise<void> {
      const pausedJobs = (this.jobsByStore[storeId] || []).filter(
        (job) => job.status === 'running' && job.pollingState === 'auth-paused',
      )

      await Promise.all(
        pausedJobs.map(async (job) => {
          const resumedJob: LocalStoreJob = {
            ...job,
            updatedAt: Date.now(),
            pollingState: 'ok',
            pollingError: null,
          }
          this.upsertJob(storeId, resumedJob)
          this.startPolling(storeId, job.job_id)
          await this.pollJob(storeId, job.job_id)
        }),
      )
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

    removeJob(storeId: string, jobId: string): void {
      this.stopPolling(storeId, jobId)
      delete this.pollingByJob[toPollingKey(storeId, jobId)]
      delete this.stoppingByJob[toPollingKey(storeId, jobId)]
      this.jobsByStore[storeId] = (this.jobsByStore[storeId] || []).filter(
        (job) => job.job_id !== jobId,
      )
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

    pauseJobPolling(
      storeId: string,
      jobId: string,
      pollingState: NonNullable<LocalStoreJob['pollingState']>,
      pollingError: string,
    ): void {
      const existingJob = (this.jobsByStore[storeId] || []).find((job) => job.job_id === jobId)
      if (!existingJob) {
        this.stopPolling(storeId, jobId)
        return
      }

      this.stopPolling(storeId, jobId)
      const pausedJob: LocalStoreJob = {
        ...existingJob,
        updatedAt: Date.now(),
        pollingState,
        pollingError,
      }
      this.upsertJob(storeId, pausedJob)
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
          this.refreshLoadedStateForTarget(storeId, localJob.target)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to poll job ${jobId}`
        if (error instanceof JobsServiceError && error.status === 401) {
          this.pauseJobPolling(
            storeId,
            jobId,
            'auth-paused',
            'Polling paused: authentication required. Update the store token to resume tracking.',
          )
        } else if (error instanceof JobsServiceError && error.status === 404) {
          this.pauseJobPolling(
            storeId,
            jobId,
            'not-found',
            'Polling stopped: job was not found on the server.',
          )
        } else {
          this.pauseJobPolling(storeId, jobId, 'stopped', `Polling stopped locally. ${message}`)
        }
      } finally {
        delete this.pollingByJob[pollingKey]
      }
    },

    async stopJob(storeId: string, jobId: string): Promise<void> {
      const stoppingKey = toPollingKey(storeId, jobId)
      if (this.stoppingByJob[stoppingKey]) {
        return
      }

      const store = this.getGenericStore(storeId)
      const existingJob = (this.jobsByStore[storeId] || []).find((job) => job.job_id === jobId)
      if (!store || !existingJob) {
        this.stopPolling(storeId, jobId)
        return
      }

      this.stoppingByJob[stoppingKey] = true
      this.stopPolling(storeId, jobId)
      delete this.pollingByJob[stoppingKey]

      try {
        const response = await cancelStoreJob(store, jobId)
        const localJob = this.buildLocalJob(
          storeId,
          existingJob.target,
          existingJob.operation,
          response,
          existingJob.submittedAt,
        )
        if (localJob.status === 'running') {
          localJob.pollingState = 'stopped'
          localJob.pollingError = 'Cancel requested. Polling stopped locally.'
        }
        this.upsertJob(storeId, localJob)
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to cancel job ${jobId}`
        const stoppedJob: LocalStoreJob = {
          ...existingJob,
          updatedAt: Date.now(),
          pollingState: 'stopped',
          pollingError: `Stopped polling locally. ${message}`,
        }
        this.upsertJob(storeId, stoppedJob)
      } finally {
        delete this.stoppingByJob[stoppingKey]
      }
    },
  },
})

export type JobsApiStoreType = ReturnType<typeof useJobsApiStore>
export default useJobsApiStore
