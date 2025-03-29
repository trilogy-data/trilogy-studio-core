import { test, expect } from '@playwright/test'

test('test', async ({ page, isMobile }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/')
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-icon-connections').click()
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

  await page.getByTestId('sidebar-icon-editors').click()
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').click()
  await page.getByTestId('editor-creator-name').fill('test-one')

  await page.getByTestId('editor-creator-type').selectOption('sql')
  await page.getByTestId('editor-creator-connection-select').selectOption('duckdb-test')
  await page.getByTestId('editor-creator-submit').click()
  await page.getByTestId('editor-list-id-e-local-duckdb-test-test-one').click()
  await page.getByTestId('editor-run-button').click()
  await expect(page.getByTestId('query-results-length')).toContainText('1')
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('delete-editor-test-one').click()
  await page.getByTestId('confirm-editor-deletion').click()
  await page.reload()
  // confirm we've deleted it
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  const count = await page.getByTestId('editor-list-id-e-local-duckdb-test-test-one').count()
  expect(count).toBe(0)

  // now let's look at the connection history
  await page.getByTestId('sidebar-icon-connections').click()
  await page.getByTestId('connection-duckdb-test').click()

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
