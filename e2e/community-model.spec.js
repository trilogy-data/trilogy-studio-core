import { test, expect } from '@playwright/test'

test('test', async ({ page, isMobile }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/')
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-icon-community-model').click()
  await page.getByTestId('import-github').click()
  await page.getByTestId('model-creator-connection').selectOption('New DuckDB')
  await page.getByTestId('model-creation-submit').click()


})
