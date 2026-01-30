import { test, expect } from '@playwright/test'
import { setupOpenAIMocks, createCompletionHandler } from './mock-openai'

/**
 * Helper function to set up an LLM connection for tests
 */
async function setupLLMConnection(page: any, isMobile: boolean, connectionName = 'test-openai') {
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }

  await page.getByTestId('sidebar-link-llms').click()
  await page.getByTestId('llm-connection-creator-add').click()
  await page.getByTestId('llm-connection-creator-name').fill(connectionName)
  await page.getByTestId('llm-connection-creator-type').selectOption({ label: 'OpenAI' })
  await page.getByTestId('llm-connection-creator-api-key').fill('test-api-key')
  await page.getByTestId('llm-connection-creator-submit').click()

  // On mobile, the element may need to be scrolled into view
  const connectionElement = page.getByTestId(`llm-connection-${connectionName}`)
  await connectionElement.scrollIntoViewIfNeeded({ timeout: 5000 })
  await expect(connectionElement).toBeVisible({ timeout: 5000 })
}

/**
 * Helper to navigate to chat view by creating a new chat
 */
async function navigateToChatView(page: any, connectionName = 'test-openai', isMobile = false) {
  await page.getByTestId(`llm-connection-${connectionName}`).click()

  // Both mobile and desktop use the chat creator modal
  await expect(page.getByTestId(`llm-connection-${connectionName}-new-chat`)).toBeVisible({
    timeout: 5000,
  })
  await page.getByTestId(`llm-connection-${connectionName}-new-chat`).click()

  // Chat creator modal should appear - create the chat
  await expect(page.getByTestId('chat-creator-modal')).toBeVisible({ timeout: 5000 })
  await page.getByTestId('create-chat-btn').click()

  await expect(page.getByTestId('llm-chat-container')).toBeVisible({ timeout: 10000 })
}

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
    await setupLLMConnection(page, isMobile)
    await navigateToChatView(page, 'test-openai', isMobile)

    // Should see the view tabs
    await expect(page.getByTestId('llm-view-tab-chat')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('llm-view-tab-validation')).toBeVisible({
      timeout: 5000,
    })

    // Chat tab should be active by default
    await expect(page.getByTestId('llm-view-tab-chat')).toHaveClass(/active/)

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
    await setupLLMConnection(page, isMobile)
    await navigateToChatView(page, 'test-openai', isMobile)

    // Chat tab should be active by default
    await expect(page.getByTestId('llm-view-tab-chat')).toHaveClass(/active/)

    // Click on Validation Tests tab
    await page.getByTestId('llm-view-tab-validation').click()

    // Validation Tests tab should now be active
    await expect(page.getByTestId('llm-view-tab-validation')).toHaveClass(/active/)

    // Validation container should be visible (debug-container class)
    await expect(page.locator('.debug-container')).toBeVisible({ timeout: 5000 })

    // Switch back to Chat
    await page.getByTestId('llm-view-tab-chat').click()
    await expect(page.getByTestId('llm-chat-container')).toBeVisible({ timeout: 5000 })
  })

  test('should disable send button when input is empty', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')
    await setupLLMConnection(page, isMobile)
    await navigateToChatView(page, 'test-openai', isMobile)

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

  test('should send message with Enter key', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')
    await setupLLMConnection(page, isMobile)
    await navigateToChatView(page, 'test-openai', isMobile)

    // Type a message
    await page.getByTestId('input-textarea').fill('Hello')

    // Press Enter to send
    await page.getByTestId('input-textarea').press('Enter')

    // Wait for the user message to appear
    await expect(page.getByTestId('message-user-0')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('message-user-0')).toContainText('Hello')

    // Wait for assistant response
    await expect(page.getByTestId('message-assistant-1')).toBeVisible({ timeout: 10000 })
  })

  test('should display sidebar tabs (Fields and Artifacts)', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')
    await setupLLMConnection(page, isMobile)
    await navigateToChatView(page, 'test-openai', isMobile)

    // Verify sidebar tabs are visible
    await expect(page.getByTestId('llm-sidebar-tab-fields')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('llm-sidebar-tab-artifacts')).toBeVisible({ timeout: 5000 })

    // Fields tab should be active by default
    await expect(page.getByTestId('llm-sidebar-tab-fields')).toHaveClass(/active/)

    // Click on Artifacts tab
    await page.getByTestId('llm-sidebar-tab-artifacts').click()

    // Artifacts tab should now be active
    await expect(page.getByTestId('llm-sidebar-tab-artifacts')).toHaveClass(/active/)

    // Should show no artifacts message
    await expect(page.locator('.no-artifacts')).toBeVisible({ timeout: 5000 })

    // Switch back to Fields
    await page.getByTestId('llm-sidebar-tab-fields').click()
    await expect(page.getByTestId('llm-sidebar-tab-fields')).toHaveClass(/active/)
  })

  test('should create new chat from sidebar', async ({ page, isMobile }) => {

    await page.goto('#skipTips=true')
    await setupLLMConnection(page, isMobile)

    // Expand the connection
    await page.getByTestId('llm-connection-test-openai').click()

    // Click on "New Chat" button in sidebar
    await expect(page.getByTestId('llm-connection-test-openai-new-chat')).toBeVisible({
      timeout: 5000,
    })
    await page.getByTestId('llm-connection-test-openai-new-chat').click()

    // Chat creator modal should appear
    await expect(page.getByTestId('chat-creator-modal')).toBeVisible({ timeout: 5000 })

    // LLM connection should be pre-selected
    await expect(page.getByTestId('llm-connection-select')).toHaveValue('test-openai')

    // Create the chat
    await page.getByTestId('create-chat-btn').click()

    // Should navigate to chat view
    await expect(page.getByTestId('llm-chat-container')).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to validation tests from sidebar', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')
    await setupLLMConnection(page, isMobile)

    // Expand the connection
    await page.getByTestId('llm-connection-test-openai').click()

    // Click on Validation Tests in sidebar
    await expect(page.getByTestId('llm-connection-test-openai-open-validation')).toBeVisible({
      timeout: 5000,
    })
    await page.getByTestId('llm-connection-test-openai-open-validation').click()

    // Wait for the view tabs to be visible
    await expect(page.getByTestId('llm-view-tab-validation')).toBeVisible({
      timeout: 10000,
    })

    // The sidebar navigation should switch to validation tab, but click it if chat is still showing
    const validationTab = page.getByTestId('llm-view-tab-validation')
    const isValidationActive = await validationTab.evaluate((el) => el.classList.contains('active'))
    if (!isValidationActive) {
      await validationTab.click()
    }

    // Should show validation view with test scenarios
    await expect(page.locator('.debug-container')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.scenarios-container')).toBeVisible({ timeout: 5000 })

    // Should have Run All Tests button
    await expect(page.getByRole('button', { name: 'Run All Tests' })).toBeVisible({ timeout: 5000 })
  })

  test('should display validation test scenarios', async ({ page, isMobile }) => {
    await page.goto('#skipTips=true')
    await setupLLMConnection(page, isMobile)
    await navigateToChatView(page, 'test-openai', isMobile)

    // Switch to Validation Tests tab
    await page.getByTestId('llm-view-tab-validation').click()
    await expect(page.locator('.debug-container')).toBeVisible({ timeout: 5000 })

    // Should show scenarios list
    await expect(page.locator('.scenarios-list')).toBeVisible({ timeout: 5000 })

    // Should have at least one test scenario
    await expect(page.locator('.scenario-item').first()).toBeVisible({ timeout: 5000 })

    // Provider selector should be visible
    await expect(page.locator('#provider-select')).toBeVisible({ timeout: 5000 })
  })
})
