import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenRouterProvider } from './openrouter'
import { fetchWithRetry } from './utils'

const mockFetch = vi.fn()

// Helper to build a mock Response with a JSON body
function mockResponse(status: number, body: unknown, statusText = ''): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// fetchWithRetry — errorBodyExtractor
// ---------------------------------------------------------------------------
describe('fetchWithRetry — errorBodyExtractor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the default HTTP message when no extractor is provided', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
    )

    await expect(
      fetchWithRetry(() => fetch('https://example.com'), { maxRetries: 0, retryStatusCodes: [] }),
    ).rejects.toThrow('HTTP error 401: Unauthorized')
  })

  it('uses the extractor message when one is provided', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(401, { error: { message: 'User not found.', code: 401 } }, 'Unauthorized'),
    )

    const extractor = async (res: Response) => {
      const data = await res.json()
      const code = data.error?.code ? ` (${data.error.code})` : ''
      return `OpenRouter API error${code}: ${data.error?.message}`
    }

    await expect(
      fetchWithRetry(() => fetch('https://example.com'), {
        maxRetries: 0,
        retryStatusCodes: [],
        errorBodyExtractor: extractor,
      }),
    ).rejects.toThrow('OpenRouter API error (401): User not found.')
  })

  it('falls back to default message when extractor throws', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('bad json{{{', { status: 403, statusText: 'Forbidden' }),
    )

    const extractor = async (res: Response) => {
      await res.json() // will throw — invalid JSON
      return 'should not reach here'
    }

    await expect(
      fetchWithRetry(() => fetch('https://example.com'), {
        maxRetries: 0,
        retryStatusCodes: [],
        errorBodyExtractor: extractor,
      }),
    ).rejects.toThrow('HTTP error 403: Forbidden')
  })
})

// ---------------------------------------------------------------------------
// OpenRouterProvider.extractErrorMessage
// ---------------------------------------------------------------------------
describe('OpenRouterProvider.extractErrorMessage', () => {
  it('formats message and code from OpenRouter error body', async () => {
    const res = mockResponse(401, { error: { message: 'User not found.', code: 401 } })
    const msg = await OpenRouterProvider.extractErrorMessage(res)
    expect(msg).toBe('OpenRouter API error (401): User not found.')
  })

  it('omits code section when code is absent', async () => {
    const res = mockResponse(500, { error: { message: 'Internal error' } })
    const msg = await OpenRouterProvider.extractErrorMessage(res)
    expect(msg).toBe('OpenRouter API error: Internal error')
  })

  it('falls back to stringified error when message is absent', async () => {
    const res = mockResponse(429, { error: { code: 429 } })
    const msg = await OpenRouterProvider.extractErrorMessage(res)
    expect(msg).toBe('OpenRouter API error (429): {"code":429}')
  })

  it('falls back to HTTP status line when no error key present', async () => {
    const res = mockResponse(503, {}, 'Service Unavailable')
    const msg = await OpenRouterProvider.extractErrorMessage(res)
    expect(msg).toBe('OpenRouter API error: HTTP 503: Service Unavailable')
  })
})

// ---------------------------------------------------------------------------
// OpenRouterProvider — end-to-end error surfacing via generateCompletion
// ---------------------------------------------------------------------------
describe('OpenRouterProvider — 401 error message', () => {
  let provider: OpenRouterProvider

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    provider = new OpenRouterProvider(
      'test-openrouter',
      'bad-key',
      'deepseek/deepseek-v3.2',
      false,
      { maxRetries: 0, retryStatusCodes: [], errorBodyExtractor: OpenRouterProvider.extractErrorMessage },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('surfaces OpenRouter error code and message on 401', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(401, { error: { message: 'User not found.', code: 401 } }, 'Unauthorized'),
    )

    await expect(
      provider.generateCompletion({ prompt: 'hello' }, null),
    ).rejects.toThrow('OpenRouter API error (401): User not found.')
  })
})
