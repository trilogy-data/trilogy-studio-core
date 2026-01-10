import { test, expect } from '@playwright/test'
import { setupOpenAIMocks, createCompletionHandler } from './mock-openai'

test.describe('LLM Chat with Artifacts Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set up our mocks before each test
    await setupOpenAIMocks(page, {
      models: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }, { id: 'text-davinci-003' }],
      completionHandler: createCompletionHandler({
        'Hello': 'Hello! How can I help you today?',
        'What is SQL': 'SQL (Structured Query Language) is a programming language used to manage and manipulate relational databases.',
        'Write a query': '```sql\nSELECT * FROM users WHERE active = true;\n```',
        default: 'I understand your question. Here is my response.',
      }),
    })
  })

  test('should display chat interface and send messages', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Set up LLM connection first
    await page.getByTestId('sidebar-link-llms').click()
    await page.getByTestId('llm-connection-creator-add').click()
    await page.getByTestId('llm-connection-creator-name').fill('test-openai')
    await page.getByTestId('llm-connection-creator-type').selectOption({ label: 'OpenAI' })
    await page.getByTestId('llm-connection-creator-api-key').fill('test-api-key')
    await page.getByTestId('llm-connection-creator-submit').click()

    // Wait for connection to be created
    await expect(page.getByTestId('llm-connection-test-openai')).toBeVisible()

    // Click on the connection to expand/select it
    await page.getByTestId('llm-connection-test-openai').click()

    // Navigate to LLM validation page which now has the chat view
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }
    await page.getByTestId('sidebar-link-llm-validation').click()

    // Should see the view tabs
    await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Validation Tests' })).toBeVisible()

    // Chat tab should be active by default
    await expect(page.getByRole('button', { name: 'Chat' })).toHaveClass(/active/)

    // Chat container should be visible
    await expect(page.getByTestId('llm-chat-container')).toBeVisible()

    // Input should be visible
    await expect(page.getByTestId('input-textarea')).toBeVisible()

    // Type and send a message
    await page.getByTestId('input-textarea').fill('Hello')
    await page.getByTestId('send-button').click()

    // Wait for the response
    await expect(page.getByTestId('message-user-0')).toBeVisible()
    await expect(page.getByTestId('message-user-0')).toContainText('Hello')

    // Wait for assistant response
    await expect(page.getByTestId('message-assistant-1')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('message-assistant-1')).toContainText('How can I help you')
  })

  test('should switch between chat and validation tabs', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Set up LLM connection first
    await page.getByTestId('sidebar-link-llms').click()
    await page.getByTestId('llm-connection-creator-add').click()
    await page.getByTestId('llm-connection-creator-name').fill('test-openai')
    await page.getByTestId('llm-connection-creator-type').selectOption({ label: 'OpenAI' })
    await page.getByTestId('llm-connection-creator-api-key').fill('test-api-key')
    await page.getByTestId('llm-connection-creator-submit').click()

    // Navigate to LLM validation page
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }
    await page.getByTestId('sidebar-link-llm-validation').click()

    // Chat tab should be active by default
    await expect(page.getByRole('button', { name: 'Chat' })).toHaveClass(/active/)
    await expect(page.getByTestId('llm-chat-container')).toBeVisible()

    // Click on Validation Tests tab
    await page.getByRole('button', { name: 'Validation Tests' }).click()

    // Validation Tests tab should now be active
    await expect(page.getByRole('button', { name: 'Validation Tests' })).toHaveClass(/active/)

    // Validation container should be visible (debug-container class)
    await expect(page.locator('.debug-container')).toBeVisible()

    // Switch back to Chat
    await page.getByRole('button', { name: 'Chat' }).click()
    await expect(page.getByTestId('llm-chat-container')).toBeVisible()
  })

  test('should handle code blocks in responses', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Set up LLM connection
    await page.getByTestId('sidebar-link-llms').click()
    await page.getByTestId('llm-connection-creator-add').click()
    await page.getByTestId('llm-connection-creator-name').fill('test-openai')
    await page.getByTestId('llm-connection-creator-type').selectOption({ label: 'OpenAI' })
    await page.getByTestId('llm-connection-creator-api-key').fill('test-api-key')
    await page.getByTestId('llm-connection-creator-submit').click()

    // Navigate to LLM validation page
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }
    await page.getByTestId('sidebar-link-llm-validation').click()

    // Send a message that triggers a code block response
    await page.getByTestId('input-textarea').fill('Write a query')
    await page.getByTestId('send-button').click()

    // Wait for the response with code block
    await expect(page.getByTestId('message-assistant-1')).toBeVisible({ timeout: 10000 })

    // The code block should be rendered (look for the code-container class from CodeBlock component)
    await expect(page.locator('.code-container')).toBeVisible()
  })

  test('should show loading indicator while waiting for response', async ({ page, isMobile }) => {
    // Set up slow mock to see loading state
    await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
      // Delay the response to see loading state
      await new Promise(resolve => setTimeout(resolve, 1000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: 'Delayed response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      })
    })

    await page.goto('#skipTips=true')

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Set up LLM connection
    await page.getByTestId('sidebar-link-llms').click()
    await page.getByTestId('llm-connection-creator-add').click()
    await page.getByTestId('llm-connection-creator-name').fill('test-openai')
    await page.getByTestId('llm-connection-creator-type').selectOption({ label: 'OpenAI' })
    await page.getByTestId('llm-connection-creator-api-key').fill('test-api-key')
    await page.getByTestId('llm-connection-creator-submit').click()

    // Navigate to LLM validation page
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }
    await page.getByTestId('sidebar-link-llm-validation').click()

    // Send a message
    await page.getByTestId('input-textarea').fill('Test message')
    await page.getByTestId('send-button').click()

    // Loading indicator should be visible
    await expect(page.getByTestId('loading-indicator')).toBeVisible()

    // Wait for loading to complete
    await expect(page.getByTestId('loading-indicator')).not.toBeVisible({ timeout: 5000 })

    // Response should be visible
    await expect(page.getByTestId('message-assistant-1')).toBeVisible()
  })

  test('should disable send button when input is empty', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Set up LLM connection
    await page.getByTestId('sidebar-link-llms').click()
    await page.getByTestId('llm-connection-creator-add').click()
    await page.getByTestId('llm-connection-creator-name').fill('test-openai')
    await page.getByTestId('llm-connection-creator-type').selectOption({ label: 'OpenAI' })
    await page.getByTestId('llm-connection-creator-api-key').fill('test-api-key')
    await page.getByTestId('llm-connection-creator-submit').click()

    // Navigate to LLM validation page
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }
    await page.getByTestId('sidebar-link-llm-validation').click()

    // Send button should be disabled when input is empty
    await expect(page.getByTestId('send-button')).toBeDisabled()

    // Type something
    await page.getByTestId('input-textarea').fill('Test')

    // Send button should now be enabled
    await expect(page.getByTestId('send-button')).not.toBeDisabled()

    // Clear the input
    await page.getByTestId('input-textarea').fill('')

    // Send button should be disabled again
    await expect(page.getByTestId('send-button')).toBeDisabled()
  })
})
