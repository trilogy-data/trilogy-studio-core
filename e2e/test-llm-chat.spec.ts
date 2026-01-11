import { test, expect } from '@playwright/test'
import { setupOpenAIMocks, createCompletionHandler } from './mock-openai'

test.describe('LLM Chat with Artifacts Tests', () => {
  // Set a reasonable timeout for all tests
  test.setTimeout(60000)

  test.beforeEach(async ({ page }) => {
    // Set up our mocks before each test
    await setupOpenAIMocks(page, {
      models: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }, { id: 'text-davinci-003' }],
      completionHandler: createCompletionHandler({
        Hello: 'Hello! How can I help you today?',
        'What is SQL':
          'SQL (Structured Query Language) is a programming language used to manage and manipulate relational databases.',
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

    // Wait for connection to be created and click on it to open the LLM view
    await expect(page.getByTestId('llm-connection-test-openai')).toBeVisible({ timeout: 5000 })
    await page.getByTestId('llm-connection-test-openai').click()

    // On mobile, close the sidebar to see the main content
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // The LLM view should now be visible with the chat tabs
    // Should see the view tabs
    await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Validation Tests' })).toBeVisible({
      timeout: 5000,
    })

    // Chat tab should be active by default
    await expect(page.getByRole('button', { name: 'Chat' })).toHaveClass(/active/)

    // Chat container should be visible
    await expect(page.getByTestId('llm-chat-container')).toBeVisible({ timeout: 5000 })

    // Input should be visible
    await expect(page.getByTestId('input-textarea')).toBeVisible({ timeout: 5000 })

    // Type and send a message
    await page.getByTestId('input-textarea').fill('Hello')
    await page.getByTestId('send-button').click()

    // Wait for the user message to appear
    await expect(page.getByTestId('message-user-0')).toBeVisible({ timeout: 5000 })
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

    // Click on the connection to open the LLM view
    await expect(page.getByTestId('llm-connection-test-openai')).toBeVisible({ timeout: 5000 })
    await page.getByTestId('llm-connection-test-openai').click()

    // On mobile, close the sidebar to see the main content
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Chat tab should be active by default
    await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Chat' })).toHaveClass(/active/)
    await expect(page.getByTestId('llm-chat-container')).toBeVisible({ timeout: 5000 })

    // Click on Validation Tests tab
    await page.getByRole('button', { name: 'Validation Tests' }).click()

    // Validation Tests tab should now be active
    await expect(page.getByRole('button', { name: 'Validation Tests' })).toHaveClass(/active/)

    // Validation container should be visible (debug-container class)
    await expect(page.locator('.debug-container')).toBeVisible({ timeout: 5000 })

    // Switch back to Chat
    await page.getByRole('button', { name: 'Chat' }).click()
    await expect(page.getByTestId('llm-chat-container')).toBeVisible({ timeout: 5000 })
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

    // Click on the connection to open the LLM view
    await expect(page.getByTestId('llm-connection-test-openai')).toBeVisible({ timeout: 5000 })
    await page.getByTestId('llm-connection-test-openai').click()

    // On mobile, close the sidebar to see the main content
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Wait for chat to be visible
    await expect(page.getByTestId('llm-chat-container')).toBeVisible({ timeout: 10000 })

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
