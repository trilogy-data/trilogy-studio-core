import { test, expect } from './console-capture'
import {
  createEditorFromConnection,
  drillMobileTree,
  localConnectionId,
  openSidebarScreen,
  prepareTestPage,
  refreshConnection,
  runEditorQueryAndExpectCount,
  waitForConnectionReady,
} from './test-helpers.js'

test.beforeEach(async ({ page }) => {
  await prepareTestPage(page)
})

test('test', async ({ page, isMobile }) => {
  await page.goto('#skipTips=true')
  await openSidebarScreen(page, 'community-models', isMobile)
  if (isMobile) {
    await drillMobileTree(page, ['Trilogy Public Models', 'duckdb'])
  } else {
    // The store lists five engines, so none of them is opened for you. Desktop
    // has to walk down to duckdb the same way drillMobileTree does above.
    await page.getByTestId('community-trilogy-data-trilogy-public-models-main+duckdb').click()
  }
  await page.getByTestId('community-trilogy-data-trilogy-public-models-main+duckdb+titanic').click()
  await page.getByTestId('import-titanic').click()
  await page.getByTestId('model-creator-connection').click()
  await page.getByTestId('model-creator-connection-option-new-duckdb').click()
  await page.getByTestId('model-creation-submit').click()
  await openSidebarScreen(page, 'connections', isMobile)
  await refreshConnection(page, 'titanic-connection')
  await waitForConnectionReady(page, 'titanic-connection')
  await openSidebarScreen(page, 'editors', isMobile)
  await createEditorFromConnection(page, 'titanic-connection', 'trilogy')
  await runEditorQueryAndExpectCount(page, 1)
})

test('a databricks model defaults to a new Databricks connection', async ({ page, isMobile }) => {
  await page.goto('#skipTips=true')
  await openSidebarScreen(page, 'community-models', isMobile)
  if (isMobile) {
    await drillMobileTree(page, ['Trilogy Public Models', 'databricks'])
  } else {
    await page.getByTestId('community-trilogy-data-trilogy-public-models-main+databricks').click()
  }
  await page
    .getByTestId('community-trilogy-data-trilogy-public-models-main+databricks+bakehouse')
    .click()
  await page.getByTestId('import-bakehouse').click()
  const picker = page.getByTestId('model-creator-connection')
  await expect(picker).toContainText('New Databricks (Beta)')
  await expect(page.getByTestId('model-creator-databricks-engine-key')).toBeVisible()
  await expect(page.getByTestId('model-creation-submit')).toBeDisabled()

  // The picker searches: narrowing to DuckDB and choosing it hides the
  // Databricks fields.
  await picker.click()
  await page.getByTestId('model-creator-connection-search').fill('duck')
  await expect(page.getByTestId('model-creator-connection-option-new-databricks')).toHaveCount(0)
  await page.getByTestId('model-creator-connection-search').press('Enter')
  await expect(picker).toContainText('New DuckDB')
  await expect(page.getByTestId('model-creator-databricks-engine-key')).toHaveCount(0)
})
