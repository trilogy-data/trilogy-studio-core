// githubApiService.ts

// Types
export interface Component {
  url: string
  name?: string
  alias?: string
  purpose?: string
  type: 'sql' | 'dashboard' | 'trilogy'
}

export interface ModelFile {
  name: string
  description: string
  engine: string
  downloadUrl: string
  components: Component[]
}

export interface GithubBranch {
  name: string
}

export interface GithubIndex {
  count: number
  files: GithubContentsItem[]
}

export interface GithubContentsItem {
  name: string
  filename: string
}

// Config for GitHub repository
export const GITHUB_CONFIG = {
  repoOwner: 'trilogy-data',
  repoName: 'trilogy-public-models',
  defaultBranch: 'main',
}

/**
 * Sleep for a specified number of milliseconds
 * @param ms Time to sleep in milliseconds
 * @returns Promise that resolves after the specified time
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

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
 * Fetch all branches from the repository
 * @returns Array of branch names
 */
export const fetchBranches = async (): Promise<string[]> => {
  try {
    const { repoOwner, repoName } = GITHUB_CONFIG
    const response = await fetchWithBackoff(
      `https://api.github.com/repos/${repoOwner}/${repoName}/branches`,
    )

    if (response.status === 200) {
      const branchData: GithubBranch[] = await response.json()
      return branchData.map((branch) => branch.name)
    }

    // If we couldn't fetch branches, return at least the default branch
    return [GITHUB_CONFIG.defaultBranch]
  } catch (err) {
    console.error('Error fetching branches:', err)
    // Return default branch if we can't fetch them
    return [GITHUB_CONFIG.defaultBranch]
  }
}

export const fetchModelFiles = async (): Promise<{
  files: ModelFile[]
  error: string | null
}> => {
  let error: string | null = null
  let files: ModelFile[] = []

  try {
    const contentsUrl = `https://trilogy-data.github.io/trilogy-public-models/studio/index.json`

    const response = await fetchWithBackoff(contentsUrl)

    if (response.status !== 200) {
      throw new Error(`Error fetching community data: ${await response.text()}`)
    }

    const data: GithubIndex = await response.json()

    const filePromises = data.files
      .filter((file) => file.filename.endsWith('.json'))
      .map(async (file) => {
        // Construct raw content URL with the selected branch
        const rawUrl = `https://trilogy-data.github.io/trilogy-public-models/studio/${file.filename}`
        const fileResponse = await fetchWithBackoff(rawUrl)

        if (!fileResponse.ok) {
          throw new Error(`Error fetching file ${file.filename}: ${fileResponse.statusText}`)
        }

        const fileData: ModelFile = await fileResponse.json()
        fileData.downloadUrl = rawUrl
        return fileData
      })

    files = await Promise.all(filePromises)
  } catch (rawError) {
    if (rawError instanceof Error) {
      error = rawError.message
    } else {
      error = 'Error fetching files'
    }
    console.error('Error fetching community data:', rawError)
  }

  return { files, error }
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
