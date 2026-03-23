import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import useCommunityApiStore from './communityApiStore'
import useJobsApiStore from './jobsApiStore'
import type { GenericModelStore } from '../remotes/models'

const TEST_STORE: GenericModelStore = {
  type: 'generic',
  id: 'jobs-test-store',
  name: 'Jobs Test Store',
  baseUrl: 'http://localhost:8100',
  token: 'test-token',
}

const createLocalStorageMock = () => {
  let store: Record<string, string> = {}
  return {
    getItem(key: string) {
      return store[key] || null
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      store = {}
    },
  }
}

const jsonResponse = (body: unknown, init: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

describe('jobsApiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', createLocalStorageMock())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('pauses polling on 401 and resumes after the token is fixed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ detail: 'Invalid or missing X-Trilogy-Token header' }, { status: 401 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            job_id: 'job-401',
            status: 'success',
            output: 'done',
            error: '',
            return_code: 0,
          },
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            models: [],
          },
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            directories: [{ directory: '', files: ['analytics.preql'] }],
          },
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const communityStore = useCommunityApiStore()
    const jobsStore = useJobsApiStore()
    communityStore.stores = [TEST_STORE]

    jobsStore.upsertJob(TEST_STORE.id, {
      job_id: 'job-401',
      status: 'running',
      output: '',
      error: '',
      return_code: null,
      storeId: TEST_STORE.id,
      target: 'analytics.preql',
      operation: 'run',
      submittedAt: Date.now(),
      updatedAt: Date.now(),
      pollingState: 'ok',
      pollingError: null,
    })

    jobsStore.startPolling(TEST_STORE.id, 'job-401')
    await vi.advanceTimersByTimeAsync(1000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    let job = jobsStore.getStoreJobs(TEST_STORE.id)[0]
    expect(job.status).toBe('running')
    expect(job.pollingState).toBe('auth-paused')
    expect(job.pollingError).toContain('authentication required')

    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await jobsStore.resumeAuthPausedJobs(TEST_STORE.id)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    job = jobsStore.getStoreJobs(TEST_STORE.id)[0]
    expect(job.status).toBe('success')
    expect(job.pollingState).toBe('ok')
    expect(job.pollingError).toBeNull()

    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('stops polling on 404 job not found', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: 'Job not found' }, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    const communityStore = useCommunityApiStore()
    const jobsStore = useJobsApiStore()
    communityStore.stores = [TEST_STORE]

    jobsStore.upsertJob(TEST_STORE.id, {
      job_id: 'job-404',
      status: 'running',
      output: '',
      error: '',
      return_code: null,
      storeId: TEST_STORE.id,
      target: 'analytics.preql',
      operation: 'refresh',
      submittedAt: Date.now(),
      updatedAt: Date.now(),
      pollingState: 'ok',
      pollingError: null,
    })

    jobsStore.startPolling(TEST_STORE.id, 'job-404')
    await vi.advanceTimersByTimeAsync(1000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const job = jobsStore.getStoreJobs(TEST_STORE.id)[0]
    expect(job.status).toBe('running')
    expect(job.pollingState).toBe('not-found')
    expect(job.pollingError).toContain('not found')
    expect(jobsStore.getStoreStatus(TEST_STORE.id)).toBe('idle')

    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
