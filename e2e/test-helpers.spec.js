import { test, expect } from '@playwright/test'
import {
  getResolverUrl,
  getBaseUrl,
  needsWebServer,
  LOCAL_RESOLVER,
  DOCKER_RESOLVER,
  LOCAL_BASE_URL,
  DOCKER_BASE_URL,
  PROD_BASE_URL,
} from './test-env.js'

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
    const url = getResolverUrl({ TEST_ENV: 'prod' })
    expect(url).not.toContain('127.0.0.1')
  })

  test('docker env must NEVER hit the internet', () => {
    const url = getResolverUrl({ TEST_ENV: 'docker' })
    expect(url).not.toContain('127.0.0.1')
    expect(url).not.toContain('fly.dev')
    expect(url).not.toContain('http')
  })
})

test.describe('getBaseUrl', () => {
  test('prod points to trilogydata.dev', () => {
    expect(getBaseUrl({ TEST_ENV: 'prod' })).toBe(PROD_BASE_URL)
  })

  test('docker points to localhost:8080', () => {
    expect(getBaseUrl({ TEST_ENV: 'docker' })).toBe(DOCKER_BASE_URL)
  })

  test('local points to localhost:5173', () => {
    expect(getBaseUrl({ TEST_ENV: 'local' })).toBe(LOCAL_BASE_URL)
    expect(getBaseUrl({})).toBe(LOCAL_BASE_URL)
  })
})

test.describe('needsWebServer', () => {
  test('prod does not need a web server', () => {
    expect(needsWebServer({ TEST_ENV: 'prod' })).toBe(false)
  })

  test('docker does not need a web server', () => {
    expect(needsWebServer({ TEST_ENV: 'docker' })).toBe(false)
  })

  test('local needs a web server', () => {
    expect(needsWebServer({ TEST_ENV: 'local' })).toBe(true)
    expect(needsWebServer({})).toBe(true)
  })
})
