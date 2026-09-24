import { test, expect } from './console-capture'
import * as fs from 'fs'
import * as http from 'http'
import type { AddressInfo } from 'net'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { openSidebarScreen, prepareTestPage, runEditorQueryAndExpectCount } from './test-helpers.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// A static catalog is flat files from any origin — a bucket, a CDN, GitHub
// Pages. A bare file server with CORS stands in for all of them: no
// /files endpoint, no auth, nothing but GETs.
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'static-stores', 'acme-sales')

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.preql': 'text/plain; charset=utf-8',
}

const startStaticServer = async (): Promise<{ server: http.Server; url: string }> => {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.method !== 'GET') {
      res.writeHead(405).end()
      return
    }
    const requested = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname)
    const filePath = path.join(FIXTURE_ROOT, requested)
    if (!filePath.startsWith(FIXTURE_ROOT) || !fs.existsSync(filePath)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream',
    })
    res.end(fs.readFileSync(filePath))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { server, url: `http://127.0.0.1:${port}` }
}

// Same derivation as buildGenericStoreId.
const storeIdFor = (url: string): string => url.replace(/^https?:\/\//, '').replace(/\//g, '-')

const shouldSkip = process.env.TEST_ENV === 'prod' || process.env.TEST_ENV === 'docker'
const staticStoreDescribe = shouldSkip ? test.describe.skip : test.describe

staticStoreDescribe('Static Model Store', () => {
  let server: http.Server | null = null
  let storeUrl = ''
  let storeId = ''

  test.beforeAll(async () => {
    const started = await startStaticServer()
    server = started.server
    storeUrl = started.url
    storeId = storeIdFor(storeUrl)
  })

  test.afterAll(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  })

  test.beforeEach(async ({ page }) => {
    await prepareTestPage(page)
  })

  test('adds a static store by URL and browses its model', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')
    await openSidebarScreen(page, 'community-models', isMobile)

    await page.getByTestId('community-store-add').click()
    await page.waitForSelector('[data-testid="add-store-modal"]', { timeout: 5000 })
    await page.getByTestId('store-type-select').selectOption('static')
    await page.getByTestId('store-name-input').fill('Acme Static')
    await page.getByTestId('store-url-input').fill(storeUrl)
    await page.getByTestId('add-store-submit').click()

    await page.waitForSelector(`[data-testid="community-${storeId}"]`, { timeout: 10000 })
    await expect(page.getByTestId(`status-icon-${storeId}`).first()).toHaveClass(/connected/, {
      timeout: 10000,
    })

    await page.getByTestId(`community-${storeId}`).click()
    await page.getByTestId(`community-${storeId}+duckdb`).click()
    await page.getByTestId(`community-${storeId}+duckdb+acme-sales`).click()

    await expect(page.getByTestId('model-card-title-acme-sales')).toBeVisible()
    await expect(page.getByTestId('model-card-description-acme-sales')).toContainText(
      'Component URLs are relative to this manifest',
    )
  })

  test('auto-imports an example via a kind=static link and runs it', async ({ page }) => {
    const autoImportUrl =
      `#skipTips=true` +
      `&screen=asset-import` +
      `&import=${encodeURIComponent(`${storeUrl}/v1/model.json`)}` +
      `&store=${encodeURIComponent(storeUrl)}` +
      `&kind=static` +
      `&assetType=trilogy` +
      `&assetName=order_count` +
      `&modelName=acme-sales` +
      `&connection=duckdb`

    await page.goto(autoImportUrl)

    await page.waitForFunction(() => window.location.hash.includes('screen=editors'), {
      timeout: 30000,
    })
    await expect(page.getByTestId('editor')).toBeVisible({ timeout: 10000 })

    // Relative component URLs resolved against the manifest, and the example's
    // `import data.orders` resolved against the source's `data/orders` alias.
    await runEditorQueryAndExpectCount(page, 1)

    const persisted = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('trilogy-community-stores') || '[]'),
    )
    expect(persisted).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: storeId, type: 'static' })]),
    )
  })
})
