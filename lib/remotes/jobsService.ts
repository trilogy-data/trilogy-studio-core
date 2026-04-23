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

const buildAuthRequest = (token?: string, init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers)

  if (token) {
    headers.set('X-Trilogy-Token', token)
  }

  return {
    ...init,
    headers,
  }
}

const encodePath = (path: string): string =>
  path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

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

export const fetchStoreFileContent = async (
  store: GenericModelStore,
  path: string,
): Promise<string> => {
  const encodedPath = encodePath(path)
  const response = await fetch(
    `${store.baseUrl}/files/${encodedPath}`,
    buildAuthRequest(store.token, {
      method: 'GET',
    }),
  )

  await ensureOk(response, `Failed to fetch ${path}`)
  return response.text()
}

// Contract allows POST to return 409 when the file already exists; retry as PUT.
// Also tolerate 404 on PUT by retrying as POST — the caller's view of whether a
// file is persisted can drift after deletes/renames.
export const createStoreFile = async (
  store: GenericModelStore,
  path: string,
  content: string,
): Promise<void> => {
  const response = await fetch(
    `${store.baseUrl}/files`,
    buildAuthRequest(store.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, content }),
    }),
  )

  if (response.status === 409) {
    await updateStoreFile(store, path, content)
    return
  }

  await ensureOk(response, `Failed to create ${path}`)
}

export const updateStoreFile = async (
  store: GenericModelStore,
  path: string,
  content: string,
): Promise<void> => {
  const response = await fetch(
    `${store.baseUrl}/files/${encodePath(path)}`,
    buildAuthRequest(store.token, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    }),
  )

  if (response.status === 404) {
    // Fall back to create — mirrors the contract's 404-on-PUT guidance.
    const createResponse = await fetch(
      `${store.baseUrl}/files`,
      buildAuthRequest(store.token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path, content }),
      }),
    )
    await ensureOk(createResponse, `Failed to update ${path}`)
    return
  }

  await ensureOk(response, `Failed to update ${path}`)
}

export const deleteStoreFile = async (store: GenericModelStore, path: string): Promise<void> => {
  const response = await fetch(
    `${store.baseUrl}/files/${encodePath(path)}`,
    buildAuthRequest(store.token, {
      method: 'DELETE',
    }),
  )

  // 404 means already absent — the contract specifies idempotent success.
  if (response.status === 404) {
    return
  }

  await ensureOk(response, `Failed to delete ${path}`)
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
