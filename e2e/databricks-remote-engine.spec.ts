// Databricks through the remote engine, end to end in the browser.
//
// Opt-in: needs a running engine (engine/, its own service, not the resolver)
// and a live warehouse, so it is skipped unless E2E_ENGINE_KEY is set. Locally:
//
//   TRILOGY_ENGINE_API_KEYS="dev:<sha256 of key>" DATABRICKS_HOST=... \
//   DATABRICKS_HTTP_PATH=... DATABRICKS_TOKEN=... \
//     uvicorn app:app --port 5680           (in engine/)
//   E2E_ENGINE_KEY=<key> pnpm exec playwright test databricks-remote-engine --project chromium
//
// E2E_ENGINE_URL overrides the engine address (default http://127.0.0.1:5680).
// `python engine/remote_engine.py new-key dev` mints a key and its digest.
import { test, expect } from './console-capture'
import {
  drillMobileTree,
  localConnectionId,
  openSidebarScreen,
  prepareTestPage,
  refreshConnection,
  replaceEditorContent,
  runEditorQueryAndExpectCount,
  waitForConnectionReady,
} from './test-helpers.js'

const ENGINE_KEY = process.env.E2E_ENGINE_KEY || ''
const ENGINE_URL = process.env.E2E_ENGINE_URL || 'http://127.0.0.1:5680'

test.skip(!ENGINE_KEY, 'E2E_ENGINE_KEY not set: needs a running remote engine')

test.beforeEach(async ({ page }) => {
  await prepareTestPage(page)
})

test('query Databricks on the engine warehouse', async ({ page, isMobile }) => {
  test.setTimeout(240000)
  await page.goto('#skipTips=true')
  await openSidebarScreen(page, 'connections', isMobile)
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').fill('dbx-engine')
  await page.locator('#connection-type').selectOption('databricks')
  await expect(page.getByTestId('connection-creator-databricks-hint')).toBeVisible()
  await page.getByTestId('connection-creator-databricks-engine-key').fill(ENGINE_KEY)
  await page.getByTestId('connection-creator-databricks-engine-url').fill(ENGINE_URL)
  await page.getByTestId('connection-creator-submit').click()
  await refreshConnection(page, 'dbx-engine')
  // The first connect may wait on a stopped warehouse's metadata call.
  await waitForConnectionReady(page, 'dbx-engine', 120000)

  await openSidebarScreen(page, 'editors', isMobile)
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').fill('dbx-query')
  await page.getByTestId('editor-creator-type').selectOption('sql')
  await page.getByTestId('editor-creator-connection-select').selectOption({ label: 'dbx-engine' })
  await page.getByTestId('editor-creator-submit').click()
  if (isMobile) {
    await drillMobileTree(page, ['Browser Storage', 'dbx-engine'])
  }
  await page.getByTestId(`editor-e-local-${localConnectionId('dbx-engine')}-dbx-query`).click()

  await replaceEditorContent(page, 'SELECT id, id * 2 AS twice FROM range(7)', 'editor')
  await runEditorQueryAndExpectCount(page, 7, 180000)
})
