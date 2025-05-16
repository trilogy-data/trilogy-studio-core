import { type CompletionItem } from '../stores/resolver'
import { type ModelConceptInput } from './data/models'
/**
 * Configuration options for retry operations
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number
  /** Initial delay in milliseconds */
  initialDelayMs?: number
  /** Multiplier for exponential backoff */
  backoffMultiplier?: number
  /** Maximum delay in milliseconds */
  maxDelayMs?: number
  /** Status codes that should trigger a retry */
  retryStatusCodes?: number[]
  /** Optional callback function to execute before each retry */
  onRetry?: (attempt: number, delayMs: number, error: Error) => void
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 5,
  initialDelayMs: 1000, // 1 second
  backoffMultiplier: 2,
  maxDelayMs: 60000, // 1 minute
  retryStatusCodes: [429, 503, 504], // Rate limit and service unavailable errors
  onRetry: () => { }, // No-op by default
}

/**
 * Type definition for errors that might contain response information
 */
export interface ResponseError extends Error {
  response?: Response
  status?: number
  statusCode?: number
}

/**
 * Executes a function with exponential backoff retry logic
 *
 * @param fn - The async function to execute with retry capability
 * @param options - Retry configuration options
 * @returns The result of the function execution
 * @throws The last error encountered after all retries are exhausted
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  // Merge provided options with defaults
  const config: Required<RetryOptions> = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  }

  let attempt = 0

  while (attempt <= config.maxRetries) {
    try {
      return await fn()
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error // Rethrow if not an Error object
      }

      // Check if this is a ResponseError with a status code
      const responseError = error as ResponseError
      const statusCode = responseError.status || responseError.statusCode

      // If not a retryable status code or we've used all retries, throw the error
      if (
        statusCode === undefined ||
        !config.retryStatusCodes.includes(statusCode) ||
        attempt >= config.maxRetries
      ) {
        throw error
      }

      // Calculate delay with exponential backoff
      const delayMs = Math.min(
        config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelayMs,
      )

      // Execute onRetry callback if provided
      config.onRetry(attempt + 1, delayMs, error)

      // Wait for the calculated delay
      await new Promise((resolve) => setTimeout(resolve, delayMs))

      // Increment attempt counter
      attempt++
    }
  }

  // This should never be reached due to the throw in the catch block
  throw new Error('Maximum retries exceeded')
}

/**
 * Function to wrap a fetch call with retry capability
 *
 * @param fetchFn - Function that performs a fetch and returns a Response
 * @param options - Retry configuration options
 * @returns The fetch Response if successful
 */
export async function fetchWithRetry(
  fetchFn: () => Promise<Response>,
  options: RetryOptions = {},
): Promise<Response> {
  return withExponentialBackoff(async () => {
    const response = await fetchFn()

    // If the response is not ok, throw an error with the response attached
    if (!response.ok) {
      // Create an error with the response attached
      const error = new Error(
        `HTTP error ${response.status}: ${response.statusText}`,
      ) as ResponseError
      error.response = response.clone() // Clone the response so we can still use it later if needed
      error.status = response.status

      throw error
    }

    return response
  }, options)
}


export function completionToModelInput(input: CompletionItem[]): ModelConceptInput[] {
  return input.map((item) => ({
    name: item.label,
    type: item.datatype,
    description: item.description,
    calculation: item.calculation,
    keys: item.keys,
  }))
}