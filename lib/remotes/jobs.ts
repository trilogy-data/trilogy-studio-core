export interface StoreDirectoryListing {
  directory: string
  files: string[]
}

export interface StoreFilesResponse {
  directories: StoreDirectoryListing[]
}

export type RemoteJobStatus = 'running' | 'success' | 'error'

export interface RemoteJobResponse {
  job_id: string
  status: RemoteJobStatus
  output: string
  error: string
  return_code: number | null
}

export interface LocalStoreJob extends RemoteJobResponse {
  storeId: string
  target: string
  operation: 'run' | 'refresh'
  submittedAt: number
  updatedAt: number
  pollingState?: 'ok' | 'unable-to-fetch'
  pollingError?: string | null
}

export interface JobsTreeNode {
  type: 'store' | 'directory' | 'file'
  label: string
  key: string
  indent: number
  storeId: string
  target?: string
}
