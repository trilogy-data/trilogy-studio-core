import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as net from 'net'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { openSidebarScreen, prepareTestPage } from './test-helpers.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TEST_TOKEN = 'abc123'
const TEST_MODEL_NAME = 'urban_forest'
const TEST_CONNECTION_NAME = `${TEST_MODEL_NAME}-connection`
const TEST_SERVED_MODEL_ID = 'remote-store'

const getAvailablePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = net.createServer()

    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to determine mock server port')))
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

test.describe('Remote Store Auto Import', () => {
  let remoteStoreServer: ChildProcess | null = null
  let remoteStoreUrl = ''

  test.beforeEach(async ({ page }) => {
    await prepareTestPage(page)
  })

  test.skip(
    process.env.TEST_ENV === 'prod' || process.env.TEST_ENV === 'docker',
    'Remote store import test requires a local Trilogy CLI',
  )

  test.beforeAll(async () => {
    const projectRoot = path.join(__dirname, '..')
    const fixturePath = path.join(projectRoot, 'e2e', 'fixtures', 'remote-store')
    const trilogyExecutableCandidates = [
      path.join(projectRoot, '.venv', 'Scripts', 'trilogy.exe'),
      path.join(projectRoot, '.venv', 'bin', 'trilogy'),
      'trilogy',
    ]
    const trilogyExecutable =
      trilogyExecutableCandidates.find((candidate) =>
        candidate === 'trilogy' ? true : fs.existsSync(candidate),
      ) ?? 'trilogy'

    const remoteStorePort = await getAvailablePort()
    remoteStoreUrl = `http://localhost:${remoteStorePort}`

    remoteStoreServer = spawn(
      trilogyExecutable,
      [
        'serve',
        fixturePath,
        'duckdb',
        '--host',
        '127.0.0.1',
        '--port',
        String(remoteStorePort),
        '--no-browser',
        '--auth-token',
        TEST_TOKEN,
      ],
      {
        cwd: projectRoot,
        stdio: 'pipe',
        env: {
          ...process.env,
        },
      },
    )

    remoteStoreServer.stdout?.on('data', (data) => {
      console.log(`Remote store server: ${data}`)
    })

    remoteStoreServer.stderr?.on('data', (data) => {
      console.error(`Remote store server error: ${data}`)
    })

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Remote store server failed to start within 10 seconds'))
      }, 10000)

      const checkServer = async () => {
        try {
          const response = await fetch(`${remoteStoreUrl}/index.json`, {
            headers: {
              'X-Trilogy-Token': TEST_TOKEN,
            },
          })

          if (response.ok) {
            clearTimeout(timeout)
            resolve()
            return
          }
        } catch {
          // Server not ready yet.
        }

        setTimeout(checkServer, 100)
      }

      checkServer()
    })
  })

  test.afterAll(async () => {
    if (!remoteStoreServer) {
      return
    }

    remoteStoreServer.kill()
    await new Promise<void>((resolve) => {
      remoteStoreServer?.on('exit', () => resolve())
      setTimeout(() => {
        if (remoteStoreServer && !remoteStoreServer.killed) {
          remoteStoreServer.kill('SIGKILL')
        }
        resolve()
      }, 5000)
    })
  })

  test('imports authenticated remote store files with nested paths', async ({ page, isMobile }) => {
    const autoImportUrl =
      `#skipTips=true` +
      `&screen=asset-import` +
      `&import=${encodeURIComponent(`${remoteStoreUrl}/models/${TEST_SERVED_MODEL_ID}.json`)}` +
      `&assetType=trilogy` +
      `&assetName=core_local` +
      `&modelName=${encodeURIComponent(TEST_MODEL_NAME)}` +
      `&connection=duckdb` +
      `&store=${encodeURIComponent(remoteStoreUrl)}` +
      `&remote=true` +
      `&token=${encodeURIComponent(TEST_TOKEN)}`

    await page.goto(autoImportUrl)

    await page.waitForSelector('.loading-state', { timeout: 10000 })
    await expect(page.locator('.error-state')).toHaveCount(0)
    await expect(page.getByTestId('editor-name-display')).toContainText('core_local.preql', {
      timeout: 30000,
    })

    await openSidebarScreen(page, 'editors', isMobile)

    await expect(
      page.locator('.truncate-text').filter({ hasText: 'Remote Storage' }).first(),
    ).toBeVisible({
      timeout: 30000,
    })
    await expect(
      page.locator('.truncate-text').filter({ hasText: TEST_CONNECTION_NAME }).first(),
    ).toBeVisible()

    await expect(
      page.locator('.truncate-text').filter({ hasText: 'core_local.preql' }).first(),
    ).toBeVisible()
    await expect(
      page.getByText('undefined.preql', { exact: true }).filter({ visible: true }),
    ).toHaveCount(0)

    const nestedEditorLabel = page
      .locator('.truncate-text')
      .filter({ hasText: 'boston_landmarks.preql' })
      .first()
    await expect(nestedEditorLabel).toBeVisible()
    await nestedEditorLabel.click()

    await expect(page.getByTestId('editor-name-display')).toContainText('boston_landmarks.preql')
    await expect(page.locator('.error-state')).toHaveCount(0)
  })
})
