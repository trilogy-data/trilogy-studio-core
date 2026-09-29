import { test, expect } from './console-capture'
import type { Page } from '@playwright/test'
import {
  drillMobileTree,
  openSidebarScreen,
  prepareTestPage,
  refreshConnection,
  replaceEditorContent,
} from './test-helpers.js'

async function saveEditor(page: Page) {
  // Saving writes IndexedDB asynchronously; wait for completion before reload.
  await Promise.all([
    page.waitForEvent('console', (message) => message.text() === 'Editors saved'),
    page.getByTestId('editor-save-button').click(),
  ])
}

test('startup failure identifies the script and database error in the connection popup', async ({
  page,
  isMobile,
}) => {
  await prepareTestPage(page)
  await page.goto('#skipTips=true', { waitUntil: 'domcontentloaded' })
  await openSidebarScreen(page, 'connections', isMobile)
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').fill('startup-test')
  await page.locator('#connection-type').selectOption('duckdb')
  await page.getByTestId('connection-creator-submit').click()

  for (const [name, sql] of [
    ['healthy.sql', 'SELECT 1;'],
    ['load_sales.sql', 'SELECT * FROM startup_missing_table;'],
  ]) {
    await openSidebarScreen(page, 'editors', isMobile)
    await page.getByTestId('editor-creator-add').click()
    await page.getByTestId('editor-creator-name').fill(name)
    await page.getByTestId('editor-creator-type').selectOption('sql')
    await page
      .getByTestId('editor-creator-connection-select')
      .selectOption({ label: 'startup-test' })
    await page.getByTestId('editor-creator-submit').click()
    if (isMobile) {
      await drillMobileTree(page, ['Browser Storage', 'startup-test'])
    }
    await page.getByTestId(`editor-e-local-local:startup-test-${name}`).click()
    await replaceEditorContent(page, sql, 'editor')
    await saveEditor(page)
    // Enabling Startup on an already saved file must itself be persisted.
    await page.getByTestId('editor-set-startup-script').click()
    await expect(page.getByTestId('editor-set-startup-script')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await saveEditor(page)
  }

  // Reopen the saved configuration so this is a fresh connection even if
  // editor metadata loading connected it while the scripts were being edited.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openSidebarScreen(page, 'connections', isMobile)
  await refreshConnection(page, 'startup-test')

  const popup = page.getByTestId('connection-error-popup-startup-test')
  // The first connect also loads and initializes DuckDB WASM.
  await expect(popup).toBeVisible({ timeout: 30000 })
  await expect(popup).toContainText(
    'Startup script "load_sales.sql" failed on connection "startup-test"',
  )
  await expect(popup).toContainText('startup_missing_table')
  await expect(popup).toContainText('does not exist')
  await expect(popup).not.toContainText('healthy.sql')
  await expect(
    page.getByTestId('connect-connection-startup-test').filter({ visible: true }).first(),
  ).toBeVisible()
})
