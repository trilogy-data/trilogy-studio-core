import { test, expect } from '@playwright/test'
import {
  localConnectionId,
  openSidebarScreen,
  prepareTestPage,
  refreshConnection,
  runEditorQueryAndExpectCount,
  waitForConnectionReady,
} from './test-helpers.js'

const connectionName = 'duckdb-test2'

test.beforeEach(async ({ page }) => {
  await prepareTestPage(page)
})

test('test', async ({ page, isMobile, browser }) => {
  await page.goto('#skipTips=true')
  await openSidebarScreen(page, 'connections', isMobile)
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').click()
  await page.getByTestId('connection-creator-name').fill(connectionName)
  await page.getByTestId('connection-creator-submit').click()
  await refreshConnection(page, connectionName)
  await waitForConnectionReady(page, connectionName)

  await openSidebarScreen(page, 'editors', isMobile)

  // Create first editor (regular name)
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').click()
  await page.getByTestId('editor-creator-name').fill('test-one')
  await page.getByTestId('editor-creator-type').selectOption('preql')
  await page.getByTestId('editor-creator-connection-select').selectOption({ label: connectionName })
  await page.getByTestId('editor-creator-submit').click()

  // Switch to test-one editor and add content
  await page.getByTestId(`editor-e-local-${localConnectionId(connectionName)}-test-one`).click()
  const editor = page.getByTestId('editor')
  await editor.click()
  if (browser.browserType().name() === 'webkit') {
    await page.getByTestId('editor').click({ clickCount: 3 })
  } else {
    await page.getByTestId('editor').press('ControlOrMeta+a')
  }

  const testOneContent = `
auto x <- [1,2,3,4,5];

select unnest(x) as rows;
`

  await page.keyboard.type(testOneContent)

  await runEditorQueryAndExpectCount(page, 5)
})

test('test_demo_deep_link', async ({ page }) => {
  // #demo=true lands directly in a connected demo editor with no clicks
  await page.goto('#skipTips=true&demo=true')
  await page.getByTestId('editor-run-button').click()
  await page.getByRole('gridcell', { name: 'R' }).click()
})

test('test_tips_cta', async ({ page, isMobile }) => {
  test.skip(isMobile, 'tips CTA is rendered by the desktop IDE only')
  // Re-enable tips (prepareTestPage seeds skipAllTips=true)
  await page.addInitScript(() => {
    const settings = JSON.parse(window.localStorage.getItem('userSettings') || '{}')
    settings.skipAllTips = false
    settings.tipsRead = []
    window.localStorage.setItem('userSettings', JSON.stringify(settings))
  })
  await page.goto('#demo=true')

  // Unread tips surface as a pulsing CTA, not a blocking modal
  const cta = page.getByTestId('tips-cta-button')
  await expect(cta).toBeVisible()
  await expect(page.getByTestId('tutorial-popup-dialog')).toHaveCount(0)

  // Clicking expands the tips popup; skipping marks all read and dismisses the CTA
  await cta.click()
  await expect(page.getByTestId('tutorial-popup-dialog')).toBeVisible()
  await page.getByTestId('skip-sequence').click()
  await expect(page.getByTestId('tutorial-popup-dialog')).toHaveCount(0)
  await expect(cta).toHaveCount(0)
})

test('test_demo_editor', async ({ page, isMobile, browser }) => {
  await page.goto('#skipTips=true&sidebarScreen=editors&screen=welcome&welcome=welcome')

  await page.getByTestId('demo-editor-button').click()
  await page.getByTestId('editor-run-button').click()
  page.once('dialog', (dialog) => {
    console.log(`Dialog message: ${dialog.message()}`)
    dialog.dismiss().catch(() => {})
  })
  await page.getByRole('gridcell', { name: 'R' }).click()
  if (isMobile) {
    await page.getByTestId('editor-tab').click()
  }
  await page
    .getByTestId('editor')
    .getByText('lineitem')
    .click({
      modifiers: ['ControlOrMeta'],
    })
  await expect(page.getByTestId('editor-name-display')).toContainText('lineitem')
})
