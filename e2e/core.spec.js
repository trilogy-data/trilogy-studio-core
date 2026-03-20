// tests/example.spec.js
import { test, expect } from '@playwright/test'
import { createEditorFromConnectionList, openSidebarScreen } from './test-helpers.js'

test('user settings', async ({ page, isMobile }) => {
  const requestPromise = page.waitForRequest((request) => {
    return request.url().includes('/validate_query')
  })

  // Mock the API response for this endpoint
  await page.route('**/validate_query', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [],
        completion_items: [
          {
            label: 'echo',
            type: 'concept',
            datatype: 'int',
            insertText: 'echo',
            trilogyType: 'concept',
            trilogySubType: 'const',
            description: null,
            calculation: '2',
            keys: null,
          },
        ],
        imports: [],
      }),
    })
  })
  await page.goto('#skipTips=true')
  await expect(page).toHaveTitle(/Trilogy Studio/)
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-icon-settings').click()
  const resolverInput = page.getByTestId('settings-trilogyResolver')
  await expect(resolverInput).toHaveValue(/.+/)
  await page.getByRole('button', { name: 'Reset to Defaults' }).click()
  const resolverAfterReset = await resolverInput.inputValue()
  await page.getByRole('button', { name: 'Save' }).click()
  await openSidebarScreen(page, 'connections')
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').click()
  await page.getByTestId('connection-creator-name').fill('test')
  await page.getByTestId('connection-creator-submit').click()
  await createEditorFromConnectionList(page, 'test', 'trilogy')
  // since we reset settings, we need to dismiss modal again
  if (!isMobile) {
    await page.getByTestId('exit-modal').click()
  }
  await openSidebarScreen(page, 'editors')
  await page.locator('[data-testid^="editor-e-local-test-new-editor-"]').last().click()
  const skipTipsButton = page.getByRole('button', { name: 'Skip' })
  if (await skipTipsButton.count()) {
    await skipTipsButton.first().click()
  }

  await page.getByTestId('editor-run-button').click()
  const request = await requestPromise

  // Assert that the URL is exactly what we expect
  expect(request.url()).toContain('/validate_query')
  expect(request.url().startsWith(resolverAfterReset.replace(/\/$/, ''))).toBeTruthy()
})
