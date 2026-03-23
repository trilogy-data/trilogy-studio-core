import { describe, expect, it } from 'vitest'
import {
  buildGenericStoreConnectionName,
  buildGenericStoreFallbackName,
  buildGenericStoreId,
  buildGenericStoreModelName,
} from './genericStoreMetadata'
import type { GenericModelStore } from './models'

describe('genericStoreMetadata', () => {
  it('builds stable ids from a store base url', () => {
    expect(buildGenericStoreId('http://localhost:8100/')).toBe('localhost:8100')
  })

  it('uses the configured store name for resource naming', () => {
    const store: GenericModelStore = {
      type: 'generic',
      id: 'localhost:8100',
      name: 'Imported Project Name',
      baseUrl: 'http://localhost:8100',
    }

    expect(buildGenericStoreConnectionName(store)).toBe('Imported Project Name')
    expect(buildGenericStoreModelName(store)).toBe('Imported Project Name')
  })

  it('falls back to a readable host name when project metadata is absent', () => {
    expect(buildGenericStoreFallbackName('http://127.0.0.1:8100/')).toBe('127.0.0.1-8100')
  })
})
