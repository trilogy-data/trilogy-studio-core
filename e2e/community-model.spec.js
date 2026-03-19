import { test, expect } from '@playwright/test'
import {
  createEditorFromConnection,
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
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-community-models').click()
  await page.getByTestId('community-trilogy-data-trilogy-public-models-main+duckdb+titanic').click()
  await page.getByTestId('import-titanic').click()
  await page.getByTestId('model-creator-connection').selectOption('New DuckDB')
  await page.getByTestId('model-creation-submit').click()
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-connections').click()
  await refreshConnection(page, 'titanic-connection')
  await waitForConnectionReady(page, 'titanic-connection')
  await page.getByTestId('sidebar-link-editors').click()
  // make sure the button has fully loaded

  // this status is flaky depending on device
  // so handle both cases - where we need to expand or not
  try {
    await page.getByTestId('editor-c-local-titanic-connection').click({ timeout: 1000 })
  } catch (e) {
    await page.getByTestId('editor-s-local').click()
    await page.getByTestId('editor-c-local-titanic-connection').click()
  }
  await createEditorFromConnection(page, 'titanic-connection', 'trilogy')
  await runEditorQueryAndExpectCount(page, 1)
})
