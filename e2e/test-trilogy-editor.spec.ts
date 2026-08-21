import type { Browser, Page } from '@playwright/test'
import { test, expect } from './console-capture'
import {
  drillMobileTree,
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

/**
 * Focus the main editor and select everything in it, so the next keystrokes
 * replace the content. Webkit runs a macOS monaco where `ControlOrMeta+a`
 * resolves to a cursor move rather than select-all, hence the triple click.
 */
async function selectAllEditorContent(page: Page, browser: Browser) {
  // Mobile stacks the editor and the results into tabs and flips to results
  // when a query starts, so the editor is off-screen after the first run.
  const editorTab = page.getByTestId('editor-tab')
  if (await editorTab.isVisible().catch(() => false)) {
    await editorTab.click()
  }
  const editor = page.getByTestId('editor')
  await editor.click()
  if (browser.browserType().name() === 'webkit') {
    await editor.click({ clickCount: 3 })
  } else {
    await editor.press('ControlOrMeta+a')
  }
}

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
  if (isMobile) {
    await drillMobileTree(page, ['Browser Storage', connectionName])
  }
  await page.getByTestId(`editor-e-local-${localConnectionId(connectionName)}-test-one`).click()
  await selectAllEditorContent(page, browser)

  const testOneContent = `
auto x <- [1,2,3,4,5];

select unnest(x) as rows;
`

  await page.keyboard.type(testOneContent)

  await runEditorQueryAndExpectCount(page, 5)

  // A `chart ...` statement is an explicit request for a visualization: the
  // editor runs the layer's query AND lands on the rendered chart rather than
  // leaving the author on the result grid.
  await selectAllEditorContent(page, browser)
  await page.keyboard.type(`
auto vals <- [1,2,3,4,5];
auto rows <- unnest(vals);
auto doubled <- rows * 2;

chart layer bar (x_axis <- rows, y_axis <- doubled);
`)

  // The layer's rows are there behind the chart...
  await runEditorQueryAndExpectCount(page, 5)
  // ...and the pane opened on the chart the statement declared.
  await expect(page.locator('.vega-active canvas').first()).toBeVisible({ timeout: 30000 })

  // A multi-layer statement renders every layer. Each one compiles to its own
  // SELECT over its own grain, so this exercises the whole chain: per-layer
  // columns on the wire, one execution per layer, and a Vega-Lite `layer` array
  // with per-layer data.
  await selectAllEditorContent(page, browser)
  await page.keyboard.type(`
auto vals <- [1,2,3,4,5];
auto rows <- unnest(vals);
auto doubled <- rows * 2;
auto halved <- rows / 2;

chart
  set show_title
  layer bar  (x_axis <- rows, y_axis <- doubled)
  layer line (x_axis <- rows, y_axis <- halved)
  place hline at 4 as target;
`)

  await runEditorQueryAndExpectCount(page, 5)
  await expect(page.locator('.vega-active canvas').first()).toBeVisible({ timeout: 30000 })
  // Layering is not an error path: the warnings strip that used to explain the
  // dropped layers is gone, and the spec built cleanly.
  await expect(page.locator('.chart-statement-warnings')).toHaveCount(0)
  await expect(page.getByTestId('chart-spec-error')).toHaveCount(0)
})

test('test_demo_deep_link', async ({ page }) => {
  // #demo=true lands directly in a connected demo editor with no clicks
  await page.goto('#skipTips=true&demo=true')
  await runEditorQueryAndExpectCount(page, 4, 120000)
  await page.getByRole('gridcell', { name: 'R' }).click()
})

test('test_demo_deep_link_with_persisted_state', async ({ page, isMobile }) => {
  // Regression: the demo bootstrap must not race persisted-workspace
  // hydration. A revisit with existing IndexedDB/localStorage data hydrates
  // stores asynchronously; running the deep link before hydration finishes
  // used to let hydration clobber the fresh demo connection (or duplicate the
  // demo workspace) on mobile, which skipped the storesLoaded guard.
  await page.goto('#skipTips=true&demo=true')
  await runEditorQueryAndExpectCount(page, 4, 120000)

  // Revisit: cold document load with the deep link AND persisted state.
  // replaceState avoids firing hashchange before the reload so this exercises
  // the mounted() bootstrap path, not the hashchange relaunch path.
  await page.evaluate(() => {
    window.history.replaceState(null, '', '#skipTips=true&demo=true')
  })
  await page.reload()
  await runEditorQueryAndExpectCount(page, 4, 120000)

  // The repeat bootstrap reused the existing workspace: exactly one demo editor
  await openSidebarScreen(page, 'editors', isMobile)
  if (isMobile) {
    await drillMobileTree(page, ['Browser Storage', 'demo-model-connection'])
  }
  await expect(
    page.getByTestId(
      `editor-e-local-${localConnectionId('demo-model-connection')}-tutorial_one_basic`,
    ),
  ).toHaveCount(1)
})

test('test_demo_deep_link_same_document', async ({ page }) => {
  // Regression: navigating to #demo=true while the app is ALREADY loaded
  // (Safari restoring a tab, tapping the link twice) is a same-document
  // navigation — mounted never re-runs. The demo must still launch from the
  // hashchange, not strand the user on the welcome screen with a spinner.
  await page.goto('#skipTips=true')
  await expect(page.getByTestId('demo-editor-button')).toBeVisible()

  // Only the hash differs, so this does not reload the document
  await page.goto('#skipTips=true&demo=true')
  await runEditorQueryAndExpectCount(page, 4, 120000)
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
  // Any opened tab triggers tip selection; the tutorial tab avoids the
  // network-bound demo import so the CTA appears immediately
  await page.goto('#screen=tutorial&sidebarScreen=tutorial&tutorial=article%2BStudio%2BWelcome')

  // Unread tips surface as a pulsing CTA, not a blocking modal
  const cta = page.getByTestId('tips-cta-button')
  await expect(cta).toBeVisible({ timeout: 15000 })
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
  await runEditorQueryAndExpectCount(page, 4, 120000)
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
  if (isMobile) {
    await expect(page.locator('.current-tab-title')).toContainText('lineitem')
  } else {
    await expect(page.getByTestId('editor-name-display')).toContainText('lineitem')
  }
})
