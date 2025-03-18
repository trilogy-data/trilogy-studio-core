import { test, expect } from '@playwright/test'

test('test', async ({ page }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/')
  await page.getByTestId('sidebar-icon-connections').click()
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').click()
  await page.getByTestId('connection-creator-name').fill('duckdb-test')
  await page.getByTestId('connection-creator-submit').click()
  await page.getByTestId('sidebar-icon-editors').click()
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').click()
  await page.getByTestId('editor-creator-name').fill('test-one')

  await page.getByTestId('editor-creator-type').selectOption('sql')
  await page.getByTestId('editor-creator-connection-select').selectOption('duckdb-test')
  await page.getByTestId('editor-creator-submit').click()
  await page.getByTestId('editor-list-id-e-local-duckdb-test-test-one').click()
  await page.getByTestId('editor-run-button').click()
  await expect(page.getByTestId('results-tab-button')).toContainText(`Results (1)`)
})
