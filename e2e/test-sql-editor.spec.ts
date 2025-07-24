import { test, expect } from '@playwright/test'

test('test', async ({ page, isMobile }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/')
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-connections').click()
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').click()
  await page.getByTestId('connection-creator-name').fill('duckdb-test')
  await page.getByTestId('connection-creator-submit').click()
  await page.getByTestId('refresh-connection-duckdb-test').click()
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="status-icon-duckdb-test"]')
    if (!element) return false

    const style = window.getComputedStyle(element)
    const backgroundColor = style.backgroundColor
    console.log(backgroundColor)

    // Check if the background color is green (in RGB format)
    return backgroundColor === 'rgb(0, 128, 0)' || backgroundColor === '#008000'
  })

  await page.getByTestId('sidebar-link-editors').click()

  // Create first editor (regular name)
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').click()
  await page.getByTestId('editor-creator-name').fill('test-one')
  await page.getByTestId('editor-creator-type').selectOption('sql')
  await page.getByTestId('editor-creator-connection-select').selectOption('duckdb-test')
  await page.getByTestId('editor-creator-submit').click()

  // Create second editor with folder structure
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').click()
  await page.getByTestId('editor-creator-name').fill('analysis/reports/sales-report')
  await page.getByTestId('editor-creator-type').selectOption('sql')
  await page.getByTestId('editor-creator-connection-select').selectOption('duckdb-test')
  await page.getByTestId('editor-creator-submit').click()

  // Create third editor in same folder structure
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').click()
  await page.getByTestId('editor-creator-name').fill('analysis/data/customer-data')
  await page.getByTestId('editor-creator-type').selectOption('sql')
  await page.getByTestId('editor-creator-connection-select').selectOption('duckdb-test')
  await page.getByTestId('editor-creator-submit').click()

  // Verify folder structure is created
  // Check that analysis folder exists
  const analysisFolder = page.getByTestId('editor-list-id-f-local-duckdb-test-analysis')
  await expect(analysisFolder).toBeVisible()

  // Check that reports folder exists (should be collapsed initially)
  // pause for debugging 10 seconds
  // we do not need to expand it, because newly created editors are always expanded
  // await analysisFolder.click() // Expand analysis folder

  const reportsFolder = page.getByTestId('editor-list-id-f-local-duckdb-test-analysis/reports')
  await expect(reportsFolder).toBeVisible()

  // Check that data folder exists
  const dataFolder = page.getByTestId('editor-list-id-f-local-duckdb-test-analysis/data')
  await expect(dataFolder).toBeVisible()

  // Expand reports folder and verify sales-report editor is there
  // await reportsFolder.click()
  // we do not need to expand it, because newly created editors are always expanded
  //editor-list-id-e-local-duckdb-test-analysis/reports/sales-report
  const salesReportEditor = page.getByTestId(
    'editor-list-id-e-local-duckdb-test-analysis/reports/sales-report',
  )
  await expect(salesReportEditor).toBeVisible()

  // Expand data folder and verify customer-data editor is there
  // we do not need to expand it, because newly created editors are always expanded
  // await dataFolder.click()
  const customerDataEditor = page.getByTestId(
    'editor-list-id-e-local-duckdb-test-analysis/data/customer-data',
  )
  await expect(customerDataEditor).toBeVisible()

  // Test clicking on the folder editor
  await salesReportEditor.click()
  await page.getByTestId('editor-run-button').click()
  await expect(page.getByTestId('query-results-length')).toContainText('1')

  // Test folder collapse/expand functionality
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await analysisFolder.click() // Collapse analysis folder
  await expect(reportsFolder).not.toBeVisible()
  await expect(dataFolder).not.toBeVisible()

  await analysisFolder.click() // Expand analysis folder again
  await expect(reportsFolder).toBeVisible()
  await expect(dataFolder).toBeVisible()

  // Test regular editor (non-folder)
  await page.getByTestId('editor-list-id-e-local-duckdb-test-test-one').click()
  await page.getByTestId('editor-run-button').click()
  await expect(page.getByTestId('query-results-length')).toContainText('1')

  // check for errors
  if (isMobile) {
    await page.getByTestId('editor-tab').click()
  }
  await page.getByTestId('editor').click()
  const newContent = `import lineitem as lineitem;
SELECT
    sum(lineitem.extended_price)->sales,
    lineitem.supplier.nation.name,
order by
    sales desc;`
  await page.keyboard.type(newContent)
  await page.getByTestId('editor-run-button').click()
  await expect(page.getByTestId('error-text')).toContainText(
    'Parser Error: syntax error at or near "lineitem" LINE 1: SELECT 1;import lineitem as lineitem; ^',
  )

  // Delete editors and verify folder structure updates
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }

  // Delete the sales-report editor
  if (isMobile) {
    await page.getByTestId('editor-list-id-f-local-duckdb-test-analysis').click()
    await page.getByTestId('editor-list-id-f-local-duckdb-test-analysis/reports').click()
    await page.getByTestId('editor-list-id-f-local-duckdb-test-analysis/data').click()
  }
  await page.getByTestId('delete-editor-sales-report').click()
  await page.getByTestId('confirm-editor-deletion').click()

  // if (isMobile) {
  //   await page.getByTestId('editor-list-id-e-local-duckdb-test-analysis/reports/sales-report').click()
  // }

  // Delete the customer-data editor
  await page.getByTestId('delete-editor-customer-data').click()
  await page.getByTestId('confirm-editor-deletion').click()

  // Delete the regular editor
  await page.getByTestId('delete-editor-test-one').click()
  await page.getByTestId('confirm-editor-deletion').click()

  await page.getByTestId('trilogy-icon').click()
  await page.waitForTimeout(1200) // 1000ms animation + 200ms buffer

  await page.reload()

  // Confirm all editors are deleted
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }

  const testOneCount = await page.getByTestId('editor-list-id-e-local-duckdb-test-test-one').count()
  expect(testOneCount).toBe(0)

  const salesReportCount = await page
    .getByTestId('editor-list-id-e-local-duckdb-test-sales-report')
    .count()
  expect(salesReportCount).toBe(0)

  const customerDataCount = await page
    .getByTestId('editor-list-id-e-local-duckdb-test-customer-data')
    .count()
  expect(customerDataCount).toBe(0)

  // Verify folders are also cleaned up when empty
  const analysisFolderCount = await page
    .getByTestId('editor-list-id-f-local-duckdb-test-analysis')
    .count()
  expect(analysisFolderCount).toBe(0)

  // now let's look at the connection history
  await page.getByTestId('sidebar-link-connections').click()
  await page.getByTestId('connection-duckdb-test').click()

  if (isMobile) {
    await page.getByTestId('toggle-history-duckdb-test').click()
  }

  await page.waitForSelector('.query-history')

  // Ensure we're not seeing the loading or empty states
  const loadingElement = page.locator('.query-history-loading')
  const emptyElement = page.locator('.query-history-empty')
  const errorElement = page.locator('.query-history-error')

  await expect(loadingElement).not.toBeVisible()
  await expect(emptyElement).not.toBeVisible()
  await expect(errorElement).not.toBeVisible()

  // Check that the history list is visible
  const historyList = page.locator('.query-history-list')
  await expect(historyList).toBeVisible()

  // Verify that at least one history item is displayed
  const historyItems = page.locator('.query-history-item')
  const historyCount = await historyItems.count()
  expect(historyCount).toBeGreaterThan(0)

  // Optionally, check for specific content in the first history item
  const firstItemPreview = page.locator('.query-history-item-preview').first()
  await expect(firstItemPreview).toBeVisible()
  await expect(firstItemPreview).not.toHaveText('')

  // You can also test the expand functionality
  const firstItemHeader = page.locator('.query-history-item-header').first()
  await firstItemHeader.click()

  // After clicking, the details should be visible
  const firstItemDetails = page.locator('.query-history-item-details').first()
  await expect(firstItemDetails).toBeVisible()
})
