import http from 'node:http'
import { test, expect, isCancellationSentinel, attachConsoleCapture } from './console-capture'
import { cacheDeployedAssets, retryShedNavigations } from './test-helpers.js'
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

  // Production serves the studio out of a subdirectory whose parent is a
  // different site. Drop the trailing slash and every relative navigation
  // silently resolves one level up, onto the docs homepage — which returns 200,
  // so nothing fails loudly; the specs just stop testing the studio.
  test('prod base URL keeps relative navigation inside the studio', () => {
    const base = getBaseUrl({ TEST_ENV: 'prod' })
    expect(base.endsWith('/')).toBe(true)
    expect(new URL('./', base).href).toBe(base)
    expect(new URL('#skipTips=true', base).href).toBe(`${base}#skipTips=true`)
  })

  test('local points to localhost:5173', () => {
    expect(getBaseUrl({ TEST_ENV: 'local' })).toBe(LOCAL_BASE_URL)
    expect(getBaseUrl({})).toBe(LOCAL_BASE_URL)
  })
})

// The prod host answers a browser-shaped burst by refusing it (see the comments
// on cacheDeployedAssets). Both halves of the defense are exercised here against
// a stand-in host rather than against trilogydata.dev, so the assertions can be
// exact about how many requests reach it.
test.describe('prod host load shedding', () => {
  const PROD_ENV = { TEST_ENV: 'prod' }
  const ASSET = 'assets/chunk-abc123.js'

  // Serves the studio's production shape: a document under /trilogy-studio-core/
  // that pulls one hashed chunk. `respond` decides each request's status, so a
  // test can make the host shed.
  async function startHost(respond = () => 200) {
    const hits = []
    const server = http.createServer((req, res) => {
      hits.push(req.url)
      const status = respond(req.url, hits)
      if (status !== 200) {
        res.writeHead(status, { 'content-type': 'text/plain' })
        res.end('shedding')
        return
      }
      if (req.url.endsWith('.js')) {
        res.writeHead(200, { 'content-type': 'text/javascript' })
        res.end('window.__chunkLoaded = true')
        return
      }
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(`<!doctype html><script type="module" src="./${ASSET}"></script>`)
    })

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return {
      hits,
      url: `http://127.0.0.1:${server.address().port}/trilogy-studio-core/`,
      close: () => new Promise((resolve) => server.close(resolve)),
    }
  }

  async function loadStudio(browser, url) {
    const page = await browser.newPage()
    await cacheDeployedAssets(page, PROD_ENV)
    await retryShedNavigations(page, PROD_ENV)
    await page.goto(url)
    await expect.poll(() => page.evaluate(() => window.__chunkLoaded)).toBe(true)
    await page.close()
  }

  // The regression that broke run 30774861685: a cache scoped to the page
  // fixture starts empty every test, so 280 tests re-fetched every chunk and the
  // host cut the run off. One request per URL per worker is the whole fix.
  test('a chunk is fetched once across pages, and the document every time', async ({ browser }) => {
    const host = await startHost()
    try {
      await loadStudio(browser, host.url)
      await loadStudio(browser, host.url)

      expect(host.hits.filter((url) => url.endsWith(ASSET))).toHaveLength(1)
      expect(host.hits.filter((url) => url.endsWith('/trilogy-studio-core/'))).toHaveLength(2)
    } finally {
      await host.close()
    }
  })

  // A shed document is the one failure the cache cannot absorb, and handing it
  // to the browser as the page means the app never boots — which the suite then
  // reports as an unrelated missing sidebar icon.
  test('a shed document is retried rather than served as the page', async ({ browser }) => {
    const host = await startHost((url, hits) =>
      url.endsWith('/trilogy-studio-core/') && hits.length === 1 ? 403 : 200,
    )
    try {
      await loadStudio(browser, host.url)
      expect(host.hits.filter((url) => url.endsWith('/trilogy-studio-core/'))).toHaveLength(2)
    } finally {
      await host.close()
    }
  })

  test('a genuinely missing chunk still fails on the first try', async ({ browser }) => {
    const host = await startHost((url) => (url.endsWith(ASSET) ? 404 : 200))
    try {
      const page = await browser.newPage()
      await cacheDeployedAssets(page, PROD_ENV)
      await retryShedNavigations(page, PROD_ENV)
      await page.goto(host.url)
      await expect.poll(() => host.hits.filter((url) => url.endsWith(ASSET)).length).toBe(1)

      // A 404 treated as shedding would come back for more; wait out both retry
      // backoffs (500ms + 1000ms) to show the second request never happens.
      await page.waitForTimeout(2000)
      expect(host.hits.filter((url) => url.endsWith(ASSET))).toHaveLength(1)
      await page.close()
    } finally {
      await host.close()
    }
  })

  test('local and docker runs are left alone', async ({ browser }) => {
    const host = await startHost()
    try {
      // Fresh page per load, matching loadStudio — Playwright contexts share no
      // HTTP cache, so the only thing that could deduplicate these is a route.
      for (const env of [{ TEST_ENV: 'local' }, { TEST_ENV: 'docker' }]) {
        const page = await browser.newPage()
        await cacheDeployedAssets(page, env)
        await retryShedNavigations(page, env)
        await page.goto(host.url)
        await expect.poll(() => page.evaluate(() => window.__chunkLoaded)).toBe(true)
        await page.close()
      }

      // No routes installed outside prod, so nothing is deduplicated.
      expect(host.hits.filter((url) => url.endsWith(ASSET))).toHaveLength(2)
    } finally {
      await host.close()
    }
  })
})

// Disposing a monaco editor rejects whatever it had in flight with monaco's
// `Canceled` sentinel, and no engine lets us catch it at the source. The capture
// filters it — but it only recognised the chromium/firefox shape, so the same
// teardown passed there and failed every run on Mobile Safari.
test.describe('isCancellationSentinel', () => {
  // How Playwright turns a WebKit console line into the Error a `pageerror`
  // listener receives: split at the FIRST colon, name before, message after.
  // Reproduced rather than imported so a change in that parsing shows up here.
  function asWebkitPageError(consoleText) {
    const idx = consoleText.indexOf(':')
    const error = new Error(consoleText.slice(idx + 2))
    error.name = consoleText.slice(0, idx)
    return error
  }

  function asPageError(name, message) {
    const error = new Error(message)
    error.name = name
    return error
  }

  test('matches the chromium/firefox shape', () => {
    expect(isCancellationSentinel(asPageError('Canceled', 'Canceled'))).toBe(true)
  })

  test('matches the WebKit unhandled-rejection wrapper', () => {
    const error = asWebkitPageError('Unhandled Promise Rejection: Canceled: Canceled')
    expect(error.name).toBe('Unhandled Promise Rejection')
    expect(error.message).toBe('Canceled: Canceled')
    expect(isCancellationSentinel(error)).toBe(true)
  })

  // The filter exists to hide one specific non-fault. Anything that merely
  // mentions cancellation is a real uncaught exception and must still fail.
  test('does not swallow real errors that mention cancellation', () => {
    expect(isCancellationSentinel(asPageError('TypeError', 'Canceled'))).toBe(false)
    expect(isCancellationSentinel(asPageError('Canceled', 'request failed'))).toBe(false)
    expect(
      isCancellationSentinel(asWebkitPageError('Unhandled Promise Rejection: TypeError: Canceled')),
    ).toBe(false)
    expect(
      isCancellationSentinel(
        asWebkitPageError('Unhandled Promise Rejection: Error: Canceled: Canceled'),
      ),
    ).toBe(false)
    expect(isCancellationSentinel(asPageError('Error', 'query was Canceled: Canceled'))).toBe(false)
  })

  // The unit cases above assume a shape. This one drives the real path — a
  // genuine unhandled rejection, reported by whichever engine the project is
  // running — so the assumption is checked against each of them rather than
  // trusted. Capture is attached to a hand-made page so the `boom` rejection
  // lands somewhere that doesn't escalate and fail this test.
  test('the filter holds against a real unhandled rejection', async ({ browser }) => {
    const page = await browser.newPage()
    const diagnostics = attachConsoleCapture(page)

    await page.evaluate(() => {
      const canceled = new Error('Canceled')
      canceled.name = 'Canceled'
      Promise.reject(canceled)
      // Reported after the sentinel, so waiting for it proves the sentinel was
      // already delivered and dropped rather than merely still in flight.
      setTimeout(() => Promise.reject(new TypeError('boom')), 0)
    })

    await expect.poll(() => diagnostics.pageErrors().length).toBe(1)
    expect(diagnostics.pageErrors()[0].text).toContain('boom')
    await page.close()
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
