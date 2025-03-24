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
  await page.reload();
  // confirm we've deleted it
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  const count = await page.getByTestId('editor-list-id-e-local-duckdb-test-test-one').count();
  expect(count).toBe(0);

})
