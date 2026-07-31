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

  describe('state', () => {
    const SNAPSHOT = {
      schema_version: 1,
      snapshot_ts: '2026-07-31T17:05:53.630612+00:00',
      run_id: null,
      project: null,
      target: '.',
      dialect: 'duck_db',
      assets: [],
      summary: { total: 6, managed: 1, stale: 0, fresh: 1, unknown: 5 },
    }

    it('reads the cached snapshot by default and stores it per target', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(SNAPSHOT, {
          status: 200,
          headers: {
            'X-Trilogy-Cached': 'true',
            'X-Trilogy-Computed-At': '2026-07-31T18:17:53.055282+00:00',
          },
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const communityStore = useCommunityApiStore()
      const jobsStore = useJobsApiStore()
      communityStore.stores = [TEST_STORE]

      await jobsStore.fetchStateForTarget(TEST_STORE.id, '.')

      const requestedUrl = fetchMock.mock.calls[0][0] as string
      expect(requestedUrl).toContain('/state?')
      expect(requestedUrl).toContain('target=.')
      // Unforced reads must not carry refresh — that is what keeps the server
      // on its cache instead of re-probing the warehouse.
      expect(requestedUrl).not.toContain('refresh')

      expect(jobsStore.getState(TEST_STORE.id, '.')?.summary.total).toBe(6)
      expect(jobsStore.getStateMeta(TEST_STORE.id, '.')).toEqual({
        cached: true,
        computedAt: '2026-07-31T18:17:53.055282+00:00',
      })
      expect(jobsStore.isStateLoading(TEST_STORE.id, '.')).toBe(false)
      expect(jobsStore.getStateError(TEST_STORE.id, '.')).toBe('')
    })

    it('forces a warehouse re-probe when asked', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(SNAPSHOT, { status: 200, headers: { 'X-Trilogy-Cached': 'false' } }),
        )
      vi.stubGlobal('fetch', fetchMock)

      const communityStore = useCommunityApiStore()
      const jobsStore = useJobsApiStore()
      communityStore.stores = [TEST_STORE]

      await jobsStore.fetchStateForTarget(TEST_STORE.id, '.', true)

      expect(fetchMock.mock.calls[0][0] as string).toContain('refresh=true')
      expect(jobsStore.getStateMeta(TEST_STORE.id, '.')?.cached).toBe(false)
    })

    it('leaves cache provenance null on a server without the headers', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SNAPSHOT, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      const communityStore = useCommunityApiStore()
      const jobsStore = useJobsApiStore()
      communityStore.stores = [TEST_STORE]

      await jobsStore.fetchStateForTarget(TEST_STORE.id, '.')

      expect(jobsStore.getStateMeta(TEST_STORE.id, '.')).toEqual({
        cached: null,
        computedAt: null,
      })
    })

    it('keeps a failed probe scoped to the target instead of failing the store', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ detail: 'Invalid or missing X-Trilogy-Token header' }, { status: 401 }),
        )
      vi.stubGlobal('fetch', fetchMock)

      const communityStore = useCommunityApiStore()
      const jobsStore = useJobsApiStore()
      communityStore.stores = [TEST_STORE]
      jobsStore.storeStatus[TEST_STORE.id] = 'connected'

      await jobsStore.fetchStateForTarget(TEST_STORE.id, 'models')

      expect(jobsStore.getStateError(TEST_STORE.id, 'models')).toContain('Authentication required')
      expect(jobsStore.getState(TEST_STORE.id, 'models')).toBeNull()
      // The store itself is still reachable — only this probe failed.
      expect(jobsStore.getStoreStatus(TEST_STORE.id)).toBe('connected')
      expect(jobsStore.errors[TEST_STORE.id]).toBeUndefined()
    })

    it('explains a directory rejection from a pre-0.3.306 server', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ detail: 'Target must be a file, not a directory' }, { status: 400 }),
        )
      vi.stubGlobal('fetch', fetchMock)

      const communityStore = useCommunityApiStore()
      const jobsStore = useJobsApiStore()
      communityStore.stores = [TEST_STORE]

      await jobsStore.fetchStateForTarget(TEST_STORE.id, '.')

      expect(jobsStore.getStateError(TEST_STORE.id, '.')).toContain('0.3.306')
    })

    it('does not issue a second probe while one is in flight', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SNAPSHOT, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      const communityStore = useCommunityApiStore()
      const jobsStore = useJobsApiStore()
      communityStore.stores = [TEST_STORE]

      await Promise.all([
        jobsStore.fetchStateForTarget(TEST_STORE.id, '.'),
        jobsStore.fetchStateForTarget(TEST_STORE.id, '.'),
      ])

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('re-probes only loaded snapshots that cover a finished job target', async () => {
      const jobsStore = useJobsApiStore()
      const communityStore = useCommunityApiStore()
      communityStore.stores = [TEST_STORE]

      // Root is loaded; a sibling directory is not.
      jobsStore.stateByTarget[`${TEST_STORE.id}::.`] = {
        snapshot: { ...SNAPSHOT },
        cached: true,
        computedAt: null,
      }
      const fetchStateSpy = vi
        .spyOn(jobsStore, 'fetchStateForTarget')
        .mockResolvedValue(undefined as void)

      jobsStore.refreshLoadedStateForTarget(TEST_STORE.id, 'models/daily.preql')

      expect(fetchStateSpy).toHaveBeenCalledTimes(1)
      expect(fetchStateSpy).toHaveBeenCalledWith(TEST_STORE.id, '.')
    })

    it('purges state when the store is removed', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SNAPSHOT, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      const communityStore = useCommunityApiStore()
      const jobsStore = useJobsApiStore()
      communityStore.stores = [TEST_STORE]

      await jobsStore.fetchStateForTarget(TEST_STORE.id, '.')
      expect(jobsStore.getState(TEST_STORE.id, '.')).not.toBeNull()

      jobsStore.clearStoreData(TEST_STORE.id)

      expect(jobsStore.getState(TEST_STORE.id, '.')).toBeNull()
      expect(jobsStore.stateByTarget).toEqual({})
    })
  })
})
