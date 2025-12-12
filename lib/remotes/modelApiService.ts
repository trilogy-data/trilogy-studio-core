import type { ModelFile } from './models'

/**
 * Sleep for a specified number of milliseconds
 * @param ms Time to sleep in milliseconds
 * @returns Promise that resolves after the specified time
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Track URLs that have been blocked by CSP
 * Store both the original blocked URI and normalized versions
 */
const blockedUrls = new Set<string>()
const blockedHosts = new Set<string>()

/**
 * Initialize CSP violation tracking
 * This should be called once when the app starts
 */
export const initializeCspTracking = (): void => {
  if (typeof window === 'undefined') return

  window.addEventListener('securitypolicyviolation', (e) => {
    if (e.blockedURI) {
      console.warn('CSP violation detected:', e.blockedURI, e.violatedDirective)
      blockedUrls.add(e.blockedURI)

      // Also extract and store the hostname for partial matching
      // Sometimes CSP reports just the hostname (e.g., "localhost")
      // and sometimes the full URL (e.g., "http://0.0.0.0:8100/index.json")
      try {
        // If it's a full URL, parse it
        if (e.blockedURI.includes('://')) {
          const urlObj = new URL(e.blockedURI)
          blockedHosts.add(urlObj.host) // host includes port
          blockedHosts.add(urlObj.hostname) // hostname without port
        } else {
          // It's just a hostname or host:port
          blockedHosts.add(e.blockedURI)
        }
      } catch (err) {
        // If parsing fails, just store as-is
        blockedHosts.add(e.blockedURI)
      }
    }
  })
}

/**
 * Check if a URL has been blocked by CSP
 * @param url The URL to check
 * @returns True if the URL has been blocked by CSP
 */
const isUrlBlockedByCsp = (url: string): boolean => {
  // Direct match
  if (blockedUrls.has(url)) {
    return true
  }

  // Try to parse the URL and check if its host has been blocked
  let urlToParse = url

  // If URL doesn't have a protocol, add http:// for parsing
  if (!url.includes('://')) {
    urlToParse = `http://${url}`
  }

  try {
    const urlObj = new URL(urlToParse)
    const host = urlObj.host
    const hostname = urlObj.hostname

    if (blockedHosts.has(host) || blockedHosts.has(hostname)) {
      return true
    }
  } catch (err) {
    // URL parsing failed, can't do host matching
  }

  return false
}

/**
 * Fetch with exponential backoff for handling rate limiting
 * @param url URL to fetch
 * @param options Fetch options
 * @param maxRetries Maximum number of retries
 * @param initialBackoff Initial backoff time in milliseconds
 * @returns Promise with the fetch response
 */
export const fetchWithBackoff = async (
  url: string,
  options?: RequestInit,
  maxRetries = 5,
  initialBackoff = 1000,
): Promise<Response> => {
  // Check if URL has been blocked by CSP before attempting fetch
  if (isUrlBlockedByCsp(url)) {
    throw new Error(
      `Cannot connect to ${url} - blocked by Content Security Policy. This URL is not allowed by the browser's security settings.`,
    )
  }

  let retries = 0
  let backoffTime = initialBackoff

  while (true) {
    try {
      const response = await fetch(url, options)

      // If we get a 429 Too Many Requests response and we haven't exceeded max retries
      if (response.status === 429 && retries < maxRetries) {
        // Get retry-after header if available or use exponential backoff
        const retryAfter = response.headers.get('Retry-After')
        let waitTime = retryAfter ? parseInt(retryAfter) * 1000 : backoffTime

        console.log(
          `Rate limited. Retrying after ${waitTime}ms (Attempt ${retries + 1}/${maxRetries})`,
        )

        // Wait for the specified time
        await sleep(waitTime)

        // Increase backoff time for next attempt (exponential backoff with jitter)
        backoffTime = backoffTime * 2 * (0.8 + Math.random() * 0.4)
        retries++
        continue
      }

      return response
    } catch (error) {
      // After the first failed attempt, check if the URL was blocked by CSP
      // The securitypolicyviolation event should have fired by now
      if (isUrlBlockedByCsp(url)) {
        throw new Error(
          `Cannot connect to ${url} - blocked by Content Security Policy. This URL is not allowed by the browser's security settings.`,
        )
      }

      if (retries >= maxRetries) {
        throw error
      }

      console.log(
        `Network error, retrying after ${backoffTime}ms (Attempt ${retries + 1}/${maxRetries})`,
      )
      await sleep(backoffTime)

      // Increase backoff time for next attempt
      backoffTime = backoffTime * 2 * (0.8 + Math.random() * 0.4)
      retries++
    }
  }
}

/**
 * Filter model files based on search criteria
 * @param files Array of model files to filter
 * @param searchQuery Text to search for in model names
 * @param selectedEngine Filter by engine type
 * @param importStatus Filter by import status
 * @param modelExistsFn Function to check if a model exists
 * @returns Filtered array of model files
 */
export const filterModelFiles = (
  files: ModelFile[],
  searchQuery: string,
  selectedEngine: string,
  importStatus: 'all' | 'imported' | 'not-imported',
  modelExistsFn: (name: string) => boolean,
): ModelFile[] => {
  return files.filter((file) => {
    const nameMatch = file.name.toLowerCase().includes(searchQuery.toLowerCase())
    const engineMatch = !selectedEngine || file.engine === selectedEngine

    // Handle the import status filter
    let importMatch = true
    if (importStatus !== 'all') {
      const isImported = modelExistsFn(file.name)
      importMatch =
        (importStatus === 'imported' && isImported) ||
        (importStatus === 'not-imported' && !isImported)
    }
    return nameMatch && engineMatch && importMatch
  })
}

/**
 * Get the default connection based on engine type
 * @param engine Engine type
 * @returns Default connection string
 */
export const getDefaultConnection = (engine: string): string => {
  switch (engine) {
    case 'bigquery':
      return 'new-bigquery-oauth'
    case 'duckdb':
      return 'new-duckdb'
    default:
      return `new-${engine}`
  }
}

/**
 * Extract unique engine types from model files
 * @param files Array of model files
 * @returns Array of unique engine types
 */
export const getAvailableEngines = (files: ModelFile[]): string[] => {
  const engines = new Set<string>()
  files.forEach((file) => {
    if (file.engine) {
      engines.add(file.engine)
    }
  })
  return Array.from(engines).sort()
}
