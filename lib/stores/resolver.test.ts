import { beforeEach, describe, expect, it, vi } from 'vitest'
import TrilogyResolver from './resolver'

describe('TrilogyResolver', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('passes current_filename to generate_query requests and caches by filename', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ generated_sql: 'select 1' }) })
    vi.stubGlobal('fetch', fetchMock)

    const resolver = new TrilogyResolver({
      settings: { trilogyResolver: 'http://localhost:5678' },
    } as any)

    await resolver.resolve_query(
      'import ..shared;',
      'duckdb',
      'preql',
      [{ alias: 'shared', contents: 'select 1;' }],
      [],
      [],
      {},
      'nested/test.preql',
    )

    await resolver.resolve_query(
      'import ..shared;',
      'duckdb',
      'preql',
      [{ alias: 'shared', contents: 'select 1;' }],
      [],
      [],
      {},
      'nested/other.preql',
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      current_filename: 'nested/test.preql',
    })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      current_filename: 'nested/other.preql',
    })
  })

  it('normalizes trailing slashes in resolver URLs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ generated_sql: 'select 1' }) })
    vi.stubGlobal('fetch', fetchMock)

    const resolver = new TrilogyResolver({
      settings: { trilogyResolver: 'http://localhost:5678/api/' },
    } as any)

    await resolver.resolve_query('select 1;', 'duckdb', 'preql')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5678/api/generate_query',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })
})
