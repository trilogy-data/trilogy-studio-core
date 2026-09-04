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

  it('forwards files to generate_query and includes them in the cache key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ generated_sql: 'select 1' }) })
    vi.stubGlobal('fetch', fetchMock)

    const resolver = new TrilogyResolver({
      settings: { trilogyResolver: 'http://localhost:5678' },
    } as any)

    // First call with files=['ratings.csv'] hits the network.
    await resolver.resolve_query('select 1;', 'duckdb', 'preql', [], [], [], {}, null, [
      'ratings.csv',
    ])
    // Same args repeated → cache hit, no extra network call.
    await resolver.resolve_query('select 1;', 'duckdb', 'preql', [], [], [], {}, null, [
      'ratings.csv',
    ])
    // Different files → cache miss, second network call.
    await resolver.resolve_query('select 1;', 'duckdb', 'preql', [], [], [], {}, null, [
      'movies.csv',
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      files: ['ratings.csv'],
    })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      files: ['movies.csv'],
    })
  })

  it('warms the resolver only once per normalized base URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ generated_sql: 'select 1' }) })
    vi.stubGlobal('fetch', fetchMock)

    const resolver = new TrilogyResolver({
      settings: { trilogyResolver: 'http://localhost:6790/api/' },
    } as any)

    await Promise.all([resolver.warmResolver(), resolver.warmResolver()])
    await resolver.warmResolver()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:6790/api/generate_query',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      query: 'select 1 as resolver_warmup;',
      dialect: 'duckdb',
      full_model: { name: '', sources: [] },
      imports: [],
      extra_filters: [],
      parameters: {},
      current_filename: '__resolver_warmup__.preql',
    })
  })
})

describe('TrilogyResolver load-shedding retries', () => {
  const busy = () => ({
    ok: false,
    status: 503,
    headers: { get: (name: string) => (name === 'retry-after' ? '1' : null) },
    json: async () => ({ detail: 'Server busy' }),
  })
  const okResponse = () => ({ ok: true, json: async () => ({ generated_sql: 'select 1' }) })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('retries a 503 after the Retry-After delay and returns the eventual result', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(busy())
      .mockResolvedValueOnce(busy())
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const resolver = new TrilogyResolver({
      settings: { trilogyResolver: 'http://localhost:5678' },
    } as any)
    const delay = vi.spyOn(resolver as any, 'delay').mockResolvedValue(undefined)

    const result = await resolver.resolve_query('select 1;', 'duckdb', 'preql')

    expect(result.data.generated_sql).toBe('select 1')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(delay).toHaveBeenCalledTimes(2)
    // Retry-After: 1 second, with jitter between 0.75x and 1.25x
    for (const [ms] of delay.mock.calls) {
      expect(ms).toBeGreaterThanOrEqual(750)
      expect(ms).toBeLessThanOrEqual(1250)
    }
  })

  it('gives up after the retry budget and surfaces the server detail', async () => {
    const fetchMock = vi.fn().mockResolvedValue(busy())
    vi.stubGlobal('fetch', fetchMock)
    const resolver = new TrilogyResolver({
      settings: { trilogyResolver: 'http://localhost:5678' },
    } as any)
    vi.spyOn(resolver as any, 'delay').mockResolvedValue(undefined)

    await expect(resolver.resolve_query('select 1;', 'duckdb', 'preql')).rejects.toThrow(
      'Server busy',
    )
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('does not retry other error statuses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: { get: () => null },
      json: async () => ({ detail: 'Parsing error' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const resolver = new TrilogyResolver({
      settings: { trilogyResolver: 'http://localhost:5678' },
    } as any)

    await expect(resolver.resolve_query('select 1;', 'duckdb', 'preql')).rejects.toThrow(
      'Parsing error',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
