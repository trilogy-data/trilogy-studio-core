import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'child_process'
import * as net from 'net'
import * as path from 'path'
import { fileURLToPath } from 'url'
import {
  createEditorFromConnection,
  openSidebarScreen,
  prepareTestPage,
  refreshConnection,
  waitForConnectionReady,
} from './test-helpers.js'

// Get the directory name in ESM context
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const getAvailablePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = net.createServer()

    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to determine server port')))
        return
      }

      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(address.port)
      })
    })
  })

const getStoreIdFromUrl = (url: string): string =>
  url.replace(/^https?:\/\//, '').replace(/\//g, '-')

const getTrilogyExecutable = (): string => {
  const projectRoot = path.join(__dirname, '..')
  const isWindows = process.platform === 'win32'
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'
  if (isCI) {
    // pip install in CI puts `trilogy` on PATH
    return 'trilogy'
  }
  return isWindows
    ? path.join(projectRoot, '.venv', 'Scripts', 'trilogy.exe')
    : path.join(projectRoot, '.venv', 'bin', 'trilogy')
}

const startTrilogyServe = async (
  fixtureRelPath: string,
  engine: string,
): Promise<{ proc: ChildProcess; url: string; storeId: string }> => {
  const projectRoot = path.join(__dirname, '..')
  const fixturePath = path.join(projectRoot, fixtureRelPath)
  const port = await getAvailablePort()
  const url = `http://127.0.0.1:${port}`
  const storeId = getStoreIdFromUrl(url)

  const proc = spawn(
    getTrilogyExecutable(),
    [
      'serve',
      fixturePath,
      engine,
      '-p',
      String(port),
      '-h',
      '127.0.0.1',
      '--no-auth',
      '--no-browser',
    ],
    { stdio: 'pipe' },
  )

  proc.stdout?.on('data', (data) => {
    console.log(`trilogy serve [${engine}]: ${data}`)
  })
  proc.stderr?.on('data', (data) => {
    console.error(`trilogy serve [${engine}] err: ${data}`)
  })

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`trilogy serve (${engine}) failed to start within 15 seconds`))
    }, 15000)

    const check = async () => {
      try {
        const response = await fetch(`${url}/`)
        if (response.ok) {
          clearTimeout(timeout)
          resolve()
        } else {
          setTimeout(check, 150)
        }
      } catch {
        setTimeout(check, 150)
      }
    }

    check()
  })

  return { proc, url, storeId }
}

const stopTrilogyServe = async (proc: ChildProcess | null): Promise<void> => {
  if (!proc) return
  proc.kill()
  await new Promise<void>((resolve) => {
    proc.on('exit', () => resolve())
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL')
      resolve()
    }, 5000)
  })
}

const shouldSkipCustomStoreTests =
  process.env.TEST_ENV === 'prod' || process.env.TEST_ENV === 'docker'

const customStoreDescribe = shouldSkipCustomStoreTests ? test.describe.skip : test.describe

customStoreDescribe('Custom Model Store', () => {
  let duckServer: ChildProcess | null = null
  let duckServerUrl = ''
  let duckStoreId = ''
  let bqServer: ChildProcess | null = null
  let bqServerUrl = ''
  let bqStoreId = ''

  test.beforeEach(async ({ page }) => {
    await prepareTestPage(page)
  })

  test.beforeAll(async () => {
    const duck = await startTrilogyServe(
      'e2e/fixtures/trilogy-serve-stores/example-duckdb-model',
      'duckdb',
    )
    duckServer = duck.proc
    duckServerUrl = duck.url
    duckStoreId = duck.storeId

    const bq = await startTrilogyServe(
      'e2e/fixtures/trilogy-serve-stores/example-bigquery-model',
      'bigquery',
    )
    bqServer = bq.proc
    bqServerUrl = bq.url
    bqStoreId = bq.storeId
  })

  test.afterAll(async () => {
    await stopTrilogyServe(duckServer)
    await stopTrilogyServe(bqServer)
  })

  test('should add custom store and import a model from it', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')

    await openSidebarScreen(page, 'community-models', isMobile)

    await page.getByRole('button', { name: 'Add Store' }).click()

    await page.waitForSelector('[data-testid="add-store-modal"]', { timeout: 5000 })

    await page.getByTestId('store-type-select').selectOption('generic')

    await page.getByTestId('store-name-input').fill('Local Test Store')
    await page.getByTestId('store-url-input').fill(duckServerUrl)

    await page.getByTestId('add-store-submit').click()

    await page.waitForTimeout(2000)

    const storeId = duckStoreId
    await page.waitForSelector(`[data-testid="community-${storeId}"]`, { timeout: 10000 })

    await page.waitForTimeout(3000)

    await page.getByTestId(`community-${storeId}`).click()

    await page.waitForTimeout(1000)

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }
    await expect(page.getByTestId(`community-${storeId}+duckdb`)).toBeVisible()

    await page.getByTestId(`community-${storeId}+duckdb`).click()
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }
    await expect(
      page.getByTestId(`community-${storeId}+duckdb+example-duckdb-model`),
    ).toBeVisible()

    await page.getByTestId(`community-${storeId}+duckdb+example-duckdb-model`).click()

    await page.waitForTimeout(1000)

    await expect(page.getByTestId('model-card-title-example-duckdb-model')).toBeVisible()
    await expect(page.getByTestId('model-card-description-example-duckdb-model')).toBeVisible()
    await expect(
      page.getByTestId('model-card-description-example-duckdb-model'),
    ).toContainText('A simple example model for testing the generic store feature')

    await page.getByTestId('import-example-duckdb-model').click()

    await page.getByTestId('model-creator-connection').selectOption('New DuckDB')

    await page.getByTestId('model-creation-submit').click()

    await page.waitForTimeout(2000)

    await openSidebarScreen(page, 'connections', isMobile)

    const connectionName = 'example-duckdb-model-connection'

    await expect(page.getByTestId(`expand-connection-${connectionName}`)).toBeVisible()

    await refreshConnection(page, connectionName)
    await waitForConnectionReady(page, connectionName, 10000)

    await openSidebarScreen(page, 'editors', isMobile)

    try {
      await page.getByTestId(`editor-c-local-${connectionName}`).click({ timeout: 1000 })
    } catch (e) {
      await page.getByTestId('editor-s-local').click()
      await page.getByTestId(`editor-c-local-${connectionName}`).click()
    }

    await createEditorFromConnection(page, connectionName, 'trilogy')

    await expect(page.getByTestId(`editor-run-button`)).toBeVisible()
  })

  test('should browse a BigQuery store without DuckDB-specific assumptions', async ({
    page,
    isMobile,
  }) => {
    // Browse-only coverage: validates the non-DuckDB path through store registration,
    // index fetch, model-list render, and detail fetch. Does not run queries (no
    // BQ credentials in the test environment).
    await page.goto('#skipTips=true')

    await openSidebarScreen(page, 'community-models', isMobile)

    await page.getByRole('button', { name: 'Add Store' }).click()

    await page.waitForSelector('[data-testid="add-store-modal"]', { timeout: 5000 })

    await page.getByTestId('store-type-select').selectOption('generic')
    await page.getByTestId('store-name-input').fill('Local BQ Store')
    await page.getByTestId('store-url-input').fill(bqServerUrl)
    await page.getByTestId('add-store-submit').click()

    await page.waitForTimeout(2000)

    const storeId = bqStoreId
    await page.waitForSelector(`[data-testid="community-${storeId}"]`, { timeout: 10000 })
    await page.waitForTimeout(3000)

    await page.getByTestId(`community-${storeId}`).click()
    await page.waitForTimeout(1000)

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }
    await expect(page.getByTestId(`community-${storeId}+bigquery`)).toBeVisible()

    await page.getByTestId(`community-${storeId}+bigquery`).click()
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }
    await expect(
      page.getByTestId(`community-${storeId}+bigquery+example-bigquery-model`),
    ).toBeVisible()

    await page.getByTestId(`community-${storeId}+bigquery+example-bigquery-model`).click()
    await page.waitForTimeout(1000)

    await expect(page.getByTestId('model-card-title-example-bigquery-model')).toBeVisible()
    await expect(
      page.getByTestId('model-card-description-example-bigquery-model'),
    ).toContainText('sample BigQuery model')
  })

  test('should show error for unreachable custom store', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')

    await openSidebarScreen(page, 'community-models', isMobile)

    await page.getByRole('button', { name: 'Add Store' }).click()

    await page.waitForSelector('[data-testid="add-store-modal"]', { timeout: 5000 })

    await page.getByTestId('store-type-select').selectOption('generic')

    await page.getByTestId('store-name-input').fill('Unreachable Store')
    await page.getByTestId('store-url-input').fill('http://localhost:9999')

    await page.getByTestId('add-store-submit').click()

    const failedStoreId = 'localhost:9999'
    await page.waitForSelector(`[data-testid="community-${failedStoreId}"]`, { timeout: 10000 })

    const failedStoreRow = page
      .getByTestId(`community-${failedStoreId}`)
      .filter({ visible: true })
      .first()
      .locator('xpath=ancestor::div[contains(@class,"sidebar-content")][1]')

    const statusIcon = failedStoreRow.getByTestId(`status-icon-${failedStoreId}`).first()
    await expect(statusIcon).toBeVisible()
    await expect(statusIcon).toHaveClass(/failed/, { timeout: 10000 })
  })

  test('should allow removing a custom store', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')

    await openSidebarScreen(page, 'community-models', isMobile)

    await page.getByRole('button', { name: 'Add Store' }).click()

    await page.waitForSelector('[data-testid="add-store-modal"]', { timeout: 5000 })

    await page.getByTestId('store-type-select').selectOption('generic')

    await page.getByTestId('store-name-input').fill('Temporary Store')
    await page.getByTestId('store-url-input').fill(duckServerUrl)

    await page.getByTestId('add-store-submit').click()

    await page.waitForTimeout(2000)

    const storeId = duckStoreId
    await page.waitForSelector(`[data-testid="community-${storeId}"]`, { timeout: 10000 })

    await page.getByTestId(`community-${storeId}`).hover()

    await page.getByTestId(`delete-store-${storeId}`).click()

    await page.getByTestId('confirm-store-deletion').click()

    await page.waitForSelector(`[data-testid="community-${storeId}"]`, {
      state: 'detached',
      timeout: 5000,
    })
  })
})

const autoImportDescribe = shouldSkipCustomStoreTests ? test.describe.skip : test.describe

autoImportDescribe('Asset Auto-Import via URL', () => {
  let duckServer: ChildProcess | null = null
  let duckServerUrl = ''

  test.beforeEach(async ({ page }) => {
    await prepareTestPage(page)
  })

  test.beforeAll(async () => {
    const duck = await startTrilogyServe(
      'e2e/fixtures/trilogy-serve-stores/example-duckdb-model',
      'duckdb',
    )
    duckServer = duck.proc
    duckServerUrl = duck.url
  })

  test.afterAll(async () => {
    await stopTrilogyServe(duckServer)
  })

  test('should auto-import trilogy editor via URL', async ({ page }) => {
    const modelUrl = `${duckServerUrl}/models/example-duckdb-model.json`
    const storeUrl = duckServerUrl
    const assetName = 'example'
    const assetType = 'trilogy'
    const modelName = 'example-duckdb-model'
    const connection = 'duckdb'

    const autoImportUrl =
      `#skipTips=true` +
      `&screen=asset-import` +
      `&import=${encodeURIComponent(modelUrl)}` +
      `&store=${encodeURIComponent(storeUrl)}` +
      `&assetType=${encodeURIComponent(assetType)}` +
      `&assetName=${encodeURIComponent(assetName)}` +
      `&modelName=${encodeURIComponent(modelName)}` +
      `&connection=${encodeURIComponent(connection)}`

    await page.goto(autoImportUrl)

    await page.waitForSelector('.loading-state', { timeout: 10000 })

    await page.waitForFunction(() => window.location.hash.includes('screen=editors'), {
      timeout: 30000,
    })

    await expect(page.getByTestId('editor')).toBeVisible({ timeout: 10000 })
  })

  test('should show error for invalid asset name', async ({ page }) => {
    const modelUrl = `${duckServerUrl}/models/example-duckdb-model.json`
    const storeUrl = duckServerUrl
    const assetName = 'nonexistent-editor'
    const assetType = 'trilogy'
    const modelName = 'example-duckdb-model'
    const connection = 'duckdb'

    const autoImportUrl =
      `#skipTips=true` +
      `&screen=asset-import` +
      `&import=${encodeURIComponent(modelUrl)}` +
      `&store=${encodeURIComponent(storeUrl)}` +
      `&assetType=${encodeURIComponent(assetType)}` +
      `&assetName=${encodeURIComponent(assetName)}` +
      `&modelName=${encodeURIComponent(modelName)}` +
      `&connection=${encodeURIComponent(connection)}`

    await page.goto(autoImportUrl)

    await page.waitForSelector('.error-state', { timeout: 30000 })

    await expect(page.locator('.error-message')).toContainText('was not found')
  })
})
