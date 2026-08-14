import type { RegisteredTool, ToolContext, ToolAvailability } from '../types'
import type { ToolCallResult } from '../../sharedToolHelpers'
import QueryHistoryStorage from '../../../data/connectionHistoryStorage'

// Jobs tools: wrap useJobsApiStore so the agent can trigger and monitor
// remote-store jobs (e.g. refreshing a local parquet aggregate) and read
// target freshness state.

const AWAIT_POLL_INTERVAL_MS = 2000
const AWAIT_DEFAULT_TIMEOUT_S = 120
const AWAIT_MAX_TIMEOUT_S = 300

function requireJobs(ctx: ToolContext): ToolAvailability {
  return ctx.runtime.jobsStore
    ? { available: true }
    : { available: false, hint: 'Job stores are not available in this context.' }
}

function describeJob(job: any): string {
  return `job ${job.job_id}: ${job.operation} "${job.target}" — status ${job.status}${job.error ? `, error: ${job.error}` : ''}${job.pollingState && job.pollingState !== 'ok' ? ` (polling ${job.pollingState})` : ''}`
}

let historyStorage: QueryHistoryStorage | null = null
const getHistoryStorage = () => {
  if (!historyStorage) historyStorage = new QueryHistoryStorage()
  return historyStorage
}

export function buildJobsPack(): RegisteredTool[] {
  return [
    {
      pack: 'jobs',
      availability: requireJobs,
      definition: {
        name: 'list_job_stores',
        description:
          'List remote model stores that support jobs (run/refresh of hosted targets), with their status.',
        input_schema: { type: 'object', properties: {} },
      },
      execute: async (_input, ctx) => {
        const jobs = ctx.runtime.jobsStore!
        const stores = jobs.getGenericStores()
        if (stores.length === 0) {
          return { success: true, message: 'No job-capable stores are configured.' }
        }
        return {
          success: true,
          message: stores
            .map(
              (store: any) =>
                `- "${store.name || store.id}" (id ${store.id}, status ${jobs.getStoreStatus(store.id)})`,
            )
            .join('\n'),
        }
      },
    },
    {
      pack: 'jobs',
      availability: requireJobs,
      definition: {
        name: 'list_store_files',
        description: 'List files/targets available in a job-capable store.',
        input_schema: {
          type: 'object',
          properties: {
            store_id: { type: 'string', description: 'The store id (see list_job_stores)' },
          },
          required: ['store_id'],
        },
      },
      execute: async (input, ctx) => {
        const jobs = ctx.runtime.jobsStore!
        const storeId = String(input.store_id)
        try {
          await jobs.fetchFilesForStore(storeId)
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to fetch store files',
          }
        }
        const files = jobs.filesByStore[storeId]
        if (!files) {
          return { success: false, error: `No file listing available for store ${storeId}.` }
        }
        return { success: true, message: JSON.stringify(files, null, 2) }
      },
    },
    {
      pack: 'jobs',
      availability: requireJobs,
      definition: {
        name: 'submit_store_job',
        description:
          'Submit a job to a store: run or refresh a target (e.g. refresh a materialized parquet aggregate). Returns the job id; use await_job to wait for completion.',
        input_schema: {
          type: 'object',
          properties: {
            store_id: { type: 'string', description: 'The store id' },
            target: { type: 'string', description: 'The target file/path in the store' },
            operation: { type: 'string', enum: ['run', 'refresh'], description: 'Job operation' },
          },
          required: ['store_id', 'target', 'operation'],
        },
      },
      execute: async (input, ctx) => {
        const jobs = ctx.runtime.jobsStore!
        try {
          const job = await jobs.submitJob(
            String(input.store_id),
            String(input.target),
            input.operation === 'refresh' ? 'refresh' : 'run',
          )
          return {
            success: true,
            message: `Submitted ${describeJob(job)}. Use await_job to wait for completion.`,
          }
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to submit job',
          }
        }
      },
    },
    {
      pack: 'jobs',
      availability: requireJobs,
      definition: {
        name: 'get_job_status',
        description: 'Get the current status of a job by id.',
        input_schema: {
          type: 'object',
          properties: {
            store_id: { type: 'string', description: 'The store id' },
            job_id: { type: 'string', description: 'The job id' },
          },
          required: ['store_id', 'job_id'],
        },
      },
      execute: async (input, ctx) => {
        const jobs = ctx.runtime.jobsStore!
        const job = jobs
          .getStoreJobs(String(input.store_id))
          .find((j: any) => j.job_id === String(input.job_id))
        if (!job) {
          return {
            success: false,
            error: `Job ${input.job_id} not found in store ${input.store_id}.`,
          }
        }
        return { success: true, message: describeJob(job) }
      },
    },
    {
      pack: 'jobs',
      availability: requireJobs,
      definition: {
        name: 'await_job',
        description:
          'Wait for a job to finish (or time out). Prefer this over polling get_job_status in a loop — one call, returns the final status.',
        input_schema: {
          type: 'object',
          properties: {
            store_id: { type: 'string', description: 'The store id' },
            job_id: { type: 'string', description: 'The job id' },
            timeout_seconds: {
              type: 'number',
              description: `Max seconds to wait (default ${AWAIT_DEFAULT_TIMEOUT_S}, max ${AWAIT_MAX_TIMEOUT_S})`,
            },
          },
          required: ['store_id', 'job_id'],
        },
      },
      execute: async (input, ctx) => {
        const jobs = ctx.runtime.jobsStore!
        const storeId = String(input.store_id)
        const jobId = String(input.job_id)
        const timeoutSeconds = Math.min(
          AWAIT_MAX_TIMEOUT_S,
          Math.max(1, Number(input.timeout_seconds) || AWAIT_DEFAULT_TIMEOUT_S),
        )
        const deadline = Date.now() + timeoutSeconds * 1000

        const findJob = () => jobs.getStoreJobs(storeId).find((j: any) => j.job_id === jobId)
        let job = findJob()
        if (!job) {
          return { success: false, error: `Job ${jobId} not found in store ${storeId}.` }
        }

        // The store polls running jobs on its own 1s interval; we just watch
        // the store entry until it leaves 'running' or we hit the deadline.
        while (job && job.status === 'running' && Date.now() < deadline) {
          if ((job.pollingState ?? 'ok') !== 'ok') {
            return {
              success: false,
              error: `Stopped waiting: ${describeJob(job)}. ${job.pollingError || ''}`.trim(),
            }
          }
          await new Promise((resolve) => setTimeout(resolve, AWAIT_POLL_INTERVAL_MS))
          job = findJob()
        }

        if (!job) {
          return { success: false, error: `Job ${jobId} disappeared while waiting.` }
        }
        if (job.status === 'running') {
          return {
            success: false,
            error: `Timed out after ${timeoutSeconds}s: ${describeJob(job)}. It continues in the background — call await_job or get_job_status again.`,
          }
        }
        // Anything that isn't 'success' at this point ('error' or 'cancelled')
        // means the job did not complete its work.
        return job.status !== 'success'
          ? { success: false, error: `Job finished unsuccessfully: ${describeJob(job)}` }
          : { success: true, message: `Job finished: ${describeJob(job)}` }
      },
    },
    {
      pack: 'jobs',
      availability: requireJobs,
      definition: {
        name: 'get_store_state',
        description:
          'Get the freshness/state snapshot for a target in a job-capable store (e.g. when its data was last computed).',
        input_schema: {
          type: 'object',
          properties: {
            store_id: { type: 'string', description: 'The store id' },
            target: { type: 'string', description: 'The target file/path' },
            force: { type: 'boolean', description: 'Force re-fetch instead of using cached state' },
          },
          required: ['store_id', 'target'],
        },
      },
      execute: async (input, ctx) => {
        const jobs = ctx.runtime.jobsStore!
        const storeId = String(input.store_id)
        const target = String(input.target)
        try {
          await jobs.fetchStateForTarget(storeId, target, Boolean(input.force))
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to fetch state',
          }
        }
        const stateError = jobs.getStateError(storeId, target)
        if (stateError) {
          return { success: false, error: stateError }
        }
        const snapshot = jobs.getState(storeId, target)
        const meta = jobs.getStateMeta(storeId, target)
        if (!snapshot) {
          return {
            success: true,
            message: `No state recorded for "${target}" in store ${storeId}.`,
          }
        }
        return {
          success: true,
          message: `State for "${target}"${meta?.computedAt ? ` (computed ${meta.computedAt}${meta.cached ? ', cached' : ''})` : ''}:\n${JSON.stringify(snapshot, null, 2)}`,
        }
      },
    },
    {
      pack: 'jobs',
      availability: requireJobs,
      definition: {
        name: 'list_jobs',
        description: 'List recent jobs for a store, newest first.',
        input_schema: {
          type: 'object',
          properties: {
            store_id: { type: 'string', description: 'The store id' },
            limit: { type: 'number', description: 'Max jobs to return (default 10)' },
          },
          required: ['store_id'],
        },
      },
      execute: async (input, ctx) => {
        const jobs = ctx.runtime.jobsStore!
        const limit = Math.max(1, Math.floor(Number(input.limit) || 10))
        const list = jobs.getStoreJobs(String(input.store_id)).slice(0, limit)
        if (list.length === 0) {
          return { success: true, message: `No jobs recorded for store ${input.store_id}.` }
        }
        return { success: true, message: list.map(describeJob).join('\n') }
      },
    },
    {
      pack: 'jobs',
      definition: {
        name: 'get_recent_query_history',
        description:
          'Get recent query history for a data connection, including execution times in ms — useful for before/after performance comparisons without re-running queries.',
        input_schema: {
          type: 'object',
          properties: {
            connection: { type: 'string', description: 'Data connection name' },
            limit: { type: 'number', description: 'Max entries (default 10)' },
          },
          required: ['connection'],
        },
      },
      execute: async (input, _ctx): Promise<ToolCallResult> => {
        const limit = Math.max(1, Math.floor(Number(input.limit) || 10))
        try {
          const records = await getHistoryStorage().getQueriesForConnection(
            String(input.connection),
          )
          if (!records.length) {
            return {
              success: true,
              message: `No query history for connection "${input.connection}".`,
            }
          }
          const lines = records.slice(0, limit).map((r: any) => {
            const preview = String(r.query || '')
              .replace(/\s+/g, ' ')
              .slice(0, 120)
            return `- [${r.status}] ${Math.round(r.executionTime)}ms, ${r.resultSize ?? '?'} rows${r.timestamp ? `, at ${new Date(r.timestamp).toISOString()}` : ''}: ${preview}`
          })
          return { success: true, message: lines.join('\n') }
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to read query history',
          }
        }
      },
    },
  ]
}
