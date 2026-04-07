// Single source of truth for test environment → URL mapping.
// Imported by both playwright.config.js and test-helpers.js.

const LOCAL_RESOLVER = 'http://127.0.0.1:5678'
const DOCKER_RESOLVER = '/api'

const LOCAL_BASE_URL = 'http://localhost:5173'
const DOCKER_BASE_URL = 'http://localhost:8080'
const PROD_BASE_URL = 'https://trilogydata.dev/trilogy-studio-core'

/**
 * Resolve the trilogy backend URL based on environment.
 * - Explicit VITE_RESOLVER_URL always wins.
 * - 'prod' uses the app's built-in resolver (empty string → trilogy-service.fly.dev).
 * - 'docker' uses the nginx reverse proxy baked into the container.
 * - Everything else (local dev) falls back to LOCAL_RESOLVER.
 */
export function getResolverUrl(env = process.env) {
  if (env.VITE_RESOLVER_URL) return env.VITE_RESOLVER_URL
  const testEnv = env.TEST_ENV || ''
  if (testEnv === 'prod') return ''
  if (testEnv === 'docker') return DOCKER_RESOLVER
  return LOCAL_RESOLVER
}

/**
 * Resolve the Playwright baseURL for the frontend.
 */
export function getBaseUrl(env = process.env) {
  const testEnv = env.TEST_ENV || ''
  if (testEnv === 'prod') return PROD_BASE_URL
  if (testEnv === 'docker') return DOCKER_BASE_URL
  return LOCAL_BASE_URL
}

/**
 * Whether we need Playwright to start a local dev server.
 */
export function needsWebServer(env = process.env) {
  const testEnv = env.TEST_ENV || ''
  return testEnv !== 'prod' && testEnv !== 'docker'
}

export { LOCAL_RESOLVER, DOCKER_RESOLVER, LOCAL_BASE_URL, DOCKER_BASE_URL, PROD_BASE_URL }
