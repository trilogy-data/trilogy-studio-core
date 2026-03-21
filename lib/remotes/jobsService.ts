import type { GenericModelStore } from './models'
import type { RemoteJobResponse, StoreFilesResponse } from './jobs'

export class JobsServiceError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'JobsServiceError'
    this.status = status
  }
}

const buildAuthRequest = (
  token?: string,
  init: RequestInit = {},
): RequestInit => {
  const headers = new Headers(init.headers)

  if (token) {
    headers.set('X-Trilogy-Token', token)
  }

  return {
    ...init,
    headers,
  }
}

const ensureOk = async (response: Response, fallback: string): Promise<Response> => {
  if (response.ok) {
    return response
  }

  let detail = ''
  try {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const payload = await response.json()
      detail =
        typeof payload?.detail === 'string'
          ? payload.detail
          : typeof payload?.message === 'string'
            ? payload.message
            : JSON.stringify(payload)
    } else {
      detail = await response.text()
    }
  } catch {
    detail = ''
  }

  throw new JobsServiceError(detail || fallback, response.status)
}

export const fetchStoreFiles = async (store: GenericModelStore): Promise<StoreFilesResponse> => {
  const response = await fetch(
    `${store.baseUrl}/files`,
    buildAuthRequest(store.token, {
      method: 'GET',
    }),
  )

  await ensureOk(response, `Failed to fetch files for ${store.name}`)
  return response.json()
}

export const submitStoreJob = async (
  store: GenericModelStore,
  operation: 'run' | 'refresh',
  target: string,
): Promise<RemoteJobResponse> => {
  const response = await fetch(
    `${store.baseUrl}/${operation}`,
    buildAuthRequest(store.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target }),
    }),
  )

  await ensureOk(response, `Failed to ${operation} ${target}`)
  return response.json()
}

export const fetchStoreJob = async (
  store: GenericModelStore,
  jobId: string,
): Promise<RemoteJobResponse> => {
  const response = await fetch(
    `${store.baseUrl}/jobs/${jobId}`,
    buildAuthRequest(store.token, {
      method: 'GET',
    }),
  )

  await ensureOk(response, `Failed to fetch job ${jobId}`)
  return response.json()
}

export const cancelStoreJob = async (
  store: GenericModelStore,
  jobId: string,
): Promise<RemoteJobResponse> => {
  const response = await fetch(
    `${store.baseUrl}/jobs/${jobId}/cancel`,
    buildAuthRequest(store.token, {
      method: 'POST',
    }),
  )

  await ensureOk(response, `Failed to cancel job ${jobId}`)
  return response.json()
}
