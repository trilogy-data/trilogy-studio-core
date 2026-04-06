import { test, expect } from '@playwright/test'
import { getResolverUrl } from './test-helpers.js'

const LOCAL_RESOLVER = 'http://127.0.0.1:5678'
const DOCKER_RESOLVER = '/api'

test.describe('getResolverUrl', () => {
  test('explicit VITE_RESOLVER_URL always wins', () => {
    const custom = 'http://custom:9999'
    expect(getResolverUrl({ VITE_RESOLVER_URL: custom, TEST_ENV: 'prod' })).toBe(custom)
    expect(getResolverUrl({ VITE_RESOLVER_URL: custom, TEST_ENV: 'docker' })).toBe(custom)
    expect(getResolverUrl({ VITE_RESOLVER_URL: custom, TEST_ENV: 'local' })).toBe(custom)
    expect(getResolverUrl({ VITE_RESOLVER_URL: custom })).toBe(custom)
  })

  test('prod env uses app built-in resolver (empty string)', () => {
    expect(getResolverUrl({ TEST_ENV: 'prod' })).toBe('')
  })

  test('docker env uses nginx reverse proxy', () => {
    expect(getResolverUrl({ TEST_ENV: 'docker' })).toBe(DOCKER_RESOLVER)
  })

  test('local env falls back to local resolver', () => {
    expect(getResolverUrl({ TEST_ENV: 'local' })).toBe(LOCAL_RESOLVER)
  })

  test('no TEST_ENV falls back to local resolver', () => {
    expect(getResolverUrl({})).toBe(LOCAL_RESOLVER)
  })

  test('prod env must NEVER return local resolver', () => {
    // Regression guard: prod hitting 127.0.0.1 broke all production Playwright runs.
    const url = getResolverUrl({ TEST_ENV: 'prod' })
    expect(url).not.toContain('127.0.0.1')
  })

  test('docker env must NEVER hit the internet', () => {
    // Docker is self-contained — it must use the container's own nginx proxy,
    // never the remote fly.dev resolver or localhost dev server.
    const url = getResolverUrl({ TEST_ENV: 'docker' })
    expect(url).not.toContain('127.0.0.1')
    expect(url).not.toContain('fly.dev')
    expect(url).not.toContain('http')
  })
})
