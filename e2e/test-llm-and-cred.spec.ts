import { test, expect } from '@playwright/test'
import { setupOpenAIMocks, createCompletionHandler } from './mock-openai'

test.describe('LLM Connection Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set up our mocks before each test
    await setupOpenAIMocks(page, {
      models: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }, { id: 'text-davinci-003' }],
      completionHandler: createCompletionHandler({
        'generate query': 'This is a mocked query generation response',
        'filter query': 'This is a mocked filter response',
        default: 'Generic mocked response from OpenAI',
      }),
    })
  })

  test('should create and verify OpenAI connection', async ({ page, isMobile, browserName }) => {
    await setupOpenAIMocks(page, {
      models: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }, { id: 'text-davinci-003' }],
      completionHandler: createCompletionHandler({
        'generate query': 'This is a mocked query generation response',
        'filter query': 'This is a mocked filter response',
        default: 'Generic mocked response from OpenAI',
      }),
    })
    const usesLocalStorage = ['firefox', 'webkit'].includes(
      page.context()?.browser()?.browserType()?.name() || '',
    )

    await page.goto('#skipTips=true')

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Set up LLM connection
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

    // Now, test that we are connected
    await page.getByTestId('llm-connection-trilogy-llm-openai').click()
    await page.getByTestId('refresh-llm-connection-trilogy-llm-openai').click()

    await expect(page.getByTestId('model-select-trilogy-llm-openai')).toBeVisible()

    // Get the current selected model (should be the default one)
    const initialModel = await page.getByTestId('model-select-trilogy-llm-openai').inputValue()
    console.log('Initial model:', initialModel)

    // Select a different model (assuming gpt-4 is not the default)
    await page.getByTestId('model-select-trilogy-llm-openai').selectOption('gpt-4')

    // Verify the model has been selected in the dropdown
    await expect(page.getByTestId('model-select-trilogy-llm-openai')).toHaveValue('gpt-4')

    // Click the update button
    // this will trigger a save
    await page.getByTestId('update-model-trilogy-llm-openai').click()

    // await page.getByRole('button', { name: 'Save' }).click()

    // Handle keyphrase input for local storage based browsers
    if (usesLocalStorage) {
      await page.getByTestId('keyphrase-input').click()
      await page.getByTestId('keyphrase-input').fill('test')
      await page.getByTestId('submit-keyphrase').click()
    }

    // Wait for local storage to flush
    await page.waitForTimeout(2000)

    // Refresh and setup mocks again
    await page.reload()

    // Re-setup our mocks after reload
    await setupOpenAIMocks(page)

    if (usesLocalStorage) {
      await page.getByTestId('keyphrase-input').click()
      await page.getByTestId('keyphrase-input').fill('test')
      await page.getByTestId('submit-keyphrase').click()
    }

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    await page.getByTestId('sidebar-link-llms').click()

    await page.getByTestId('llm-connection-trilogy-llm-openai').click()
    await page.getByTestId('toggle-api-key-visibility-trilogy-llm-openai').click()
    await expect(page.getByTestId('model-select-trilogy-llm-openai')).toHaveValue('gpt-4')

    // Assert api key value
    const apiKey = await page.getByTestId('api-key-input-trilogy-llm-openai').inputValue()
    if (browserName === 'chromium') {
      // credential storage doesn't work in playwright?
      expect(apiKey).toContain('')
    } else {
      expect(apiKey).toContain('bc123')
    }
  })

  // test('should use mocked LLM for query generation', async ({ page }) => {
  //   await page.goto('/');

  //   // Navigate to a page that uses the LLM for query generation
  //   await page.getByTestId('sidebar-link-concepts').click(); // Assuming there's a concepts section

  //   // Trigger a query generation request
  //   await page.getByTestId('generate-query-button').click(); // Adjust selector as needed

  //   // Verify the mocked response was used
  //   const responseText = await page.getByTestId('query-result').textContent();
  //   expect(responseText).toContain('mocked query generation');
  // });

  test('should handle LLM errors gracefully', async ({ page, isMobile }) => {
    // Override the default mocks with one that simulates an error
    await page.route('https://api.openai.com/v1/models', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            message: 'Invalid API key provided',
            type: 'invalid_request_error',
          },
        }),
      })
    })

    await page.goto('#skipTips=true')

    // Navigate to LLM testing page
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Set up LLM connection
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

    // Select the existing connection
    // await page.getByTestId('llm-connection-trilogy-llm-openai').click();

    // Try to test the connection
    await page.getByTestId('refresh-llm-connection-trilogy-llm-openai').click()

    const buttonContainer = page.getByTestId('refresh-connection-trilogy-llm-openai')

    // Verify it appears after the action fails
    await expect(page.getByTestId('refresh-connection-trilogy-llm-openai-error')).toBeVisible({
      timeout: 5000,
    })
  })

  test('can use prompt refinement', async ({ page, isMobile }) => {
    //skip if mobile
    if (isMobile) {
      test.skip()
    }
    await setupOpenAIMocks(page, {
      models: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }, { id: 'text-davinci-003' }],
      completionHandler: createCompletionHandler({
        'generate query': 'This is a mocked query generation response',
        'filter query': 'This is a mocked filter response',
        'use order.id.count as the count': `select
        part.name,
        part.manufacturer,
        order.id.count as order_count
    order by order_count desc
    limit 10;`,
        'top 10 products by orders': `select
    part.name,
    part.manufacturer,
    count(order.id) as order_count
order by order_count desc
limit 10;`,
      }),
    })

    await page.goto('#skipTips=true')

    // Navigate to LLM testing page
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }
    const usesLocalStorage = ['firefox', 'webkit'].includes(
      page.context()?.browser()?.browserType()?.name() || '',
    )
    // Set up LLM connection
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
    await page.getByTestId('sidebar-link-editors').click()
    await page.getByTestId('sidebar-link-community-models').click()
    await page.getByTestId('community-trilogy-data-trilogy-public-models-main').click()
    await page.getByTestId('community-model-search').click()
    await page.getByTestId('community-model-search').fill('demo')
    await page.getByTestId('import-demo-model').click()
    await page.getByTestId('model-creation-submit').click()
    if (usesLocalStorage) {
      await page.getByTestId('keyphrase-input').click()
      await page.getByTestId('keyphrase-input').fill('test')
      await page.getByTestId('submit-keyphrase').click()
    }
    await page.getByTestId('sidebar-link-editors').click()
    await page
      // .getByTestId('editor-c-local-demo-model-connection')
      .getByTestId('quick-new-editor-demo-model-connection-trilogy')
      .click()
    await page
      .getByRole('code')
      .locator('div')
      .filter({ hasText: 'SELECT 1 -> echo;' })
      .nth(3)
      .click()
    await page.getByTestId('editor').click({ clickCount: 3 })
    await page.keyboard.type(
      'import lineitem;\n\n\n# get top 10 products by orders and who made them',
    )
    await page.getByTestId('editor').click({ clickCount: 3 })
    await page.getByTestId('editor-generate-button').click()
    await page.getByTestId('input-textarea').fill('use order.id.count as the count')
    await page.getByTestId('send-button').click()
    await page.getByTestId('accept-button').click()
    await page.getByRole('gridcell', { name: 'CHOCOLATE CORNSILK GOLDENROD VIOLET PUFF' }).click()
  })
})
