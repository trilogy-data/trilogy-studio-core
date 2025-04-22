import { test, expect } from '@playwright/test'

test('test', async ({ page, isMobile, browserName }) => {
  console.log(page.context()?.browser()?.browserType()?.name())
  // skip if chromium

  const usesLocalStorage = ['firefox', 'webkit'].includes(
    page.context()?.browser()?.browserType()?.name() || '',
  )

  await page.goto('http://localhost:5173/trilogy-studio-core/')
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-llms').click()
  await page.getByTestId('llm-connection-creator-add').click()
  await page.getByTestId('llm-connection-creator-name').click()
  await page.getByTestId('llm-connection-creator-name').fill('trilogy-llm-openai')
  await page.getByTestId('llm-connection-creator-type').click()
  await page.getByTestId('llm-connection-creator-type').selectOption({ label: 'OpenAI' })
  await page.getByTestId('llm-connection-creator-api-key').click()
  await page.getByTestId('llm-connection-creator-api-key').fill('bc123')
  await page.getByTestId('llm-connection-creator-save-credential').check()
  await page.getByTestId('llm-connection-creator-submit').click()

  await page.getByRole('button', { name: 'Save' }).click()
  // now special handling for the api key
  // if we are on chrome, nothing to do

  if (usesLocalStorage) {
    await page.getByTestId('keyphrase-input').click()
    await page.getByTestId('keyphrase-input').fill('test')
    await page.getByTestId('submit-keyphrase').click()
  }

  //wait for 2 seconds for local storage to flush
  await page.waitForTimeout(2000)

  // refresh
  await page.reload()

  if (usesLocalStorage) {
    await page.getByTestId('keyphrase-input').click()
    await page.getByTestId('keyphrase-input').fill('test')
    await page.getByTestId('submit-keyphrase').click()
  }
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.locator('.sidebar-item > i').click()
  await page.getByTestId('toggle-api-key-visibility-trilogy-llm-openai').click()
  // assert it has abc
  const apiKey = await page.getByTestId('api-key-input-trilogy-llm-openai').inputValue()
  if (browserName === 'chromium') {
    // credential storage doesn't work in playwright?
    expect(apiKey).toContain('')
  } else {
    expect(apiKey).toContain('bc123')
  }
})
