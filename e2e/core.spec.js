// tests/example.spec.js
import { test, expect } from '@playwright/test'

test('user settings', async ({ page, isMobile }) => {
  const requestPromise = page.waitForRequest((request) => {
    // Identify the specific request by URL pattern or other criteria
    return request.url().includes('https://trilogy-service.fly.dev/validate_query')
  })

  // Mock the API response for this endpoint
  await page.route('https://trilogy-service.fly.dev/validate_query', (route) => {
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
  await page.goto('/#skipTips=true')
  await expect(page).toHaveTitle(/Trilogy Studio/)
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-icon-settings').click()
  expect(page.getByTestId('settings-trilogyResolver')).toHaveValue('http://127.0.0.1:5678')
  await page.getByRole('button', { name: 'Reset to Defaults' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-connections').click()
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').click()
  await page.getByTestId('connection-creator-name').fill('test')
  await page.getByTestId('connection-creator-submit').click()
  await page.getByTestId('new-trilogy-editor-test').click()
  // since we reset settings, we need to dismiss modal again
  if (!isMobile) {
    await page.getByTestId('exit-modal').click()
  }
  
  await page.getByTestId('editor-run-button').click()
  const request = await requestPromise

  // Assert that the URL is exactly what we expect
  expect(request.url()).toBe('https://trilogy-service.fly.dev/validate_query')
})
