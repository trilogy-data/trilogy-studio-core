import { test, expect } from './console-capture'
import { setupOpenAIMocks, createCompletionHandler, createToolCallResponse } from './mock-openai'
import { cacheDuckDBCdn, openSidebarScreen } from './test-helpers.js'

// The global chat panel is desktop-only in v1 (MobileIDE has no rail icon or
// right column).
test.skip(({ isMobile }) => !!isMobile, 'Global chat panel is desktop-only in v1')

test.beforeEach(async ({ page }) => {
  await cacheDuckDBCdn(page)
})

async function setupLLMConnection(page: any, connectionName = 'test-openai') {
  await openSidebarScreen(page, 'llms', false)
  await page.getByTestId('llm-connection-creator-add').click()
  await page.getByTestId('llm-connection-creator-name').fill(connectionName)
  await page.getByTestId('llm-connection-creator-type').selectOption({ label: 'OpenAI' })
  await page.getByTestId('llm-connection-creator-api-key').fill('test-api-key')
  await page.getByTestId('llm-connection-creator-submit').click()
  await expect(page.getByTestId(`llm-connection-${connectionName}`)).toBeVisible({ timeout: 5000 })
}

test.describe('Global chat panel', () => {
  test.setTimeout(60000)

  test.beforeEach(async ({ page }) => {
    await setupOpenAIMocks(page, {
      completionHandler: createCompletionHandler({
        // First turn: plain text. The tool loop then re-prompts with the
        // no-tool-call reminder, which we answer with return_to_user so the
        // run terminates cleanly instead of spinning to maxIterations.
        'You must call a tool': createToolCallResponse('', [
          { name: 'return_to_user', input: { message: 'Done.' } },
        ]),
        Hello: 'Hi there! I can help with your data.',
        default: 'Mocked response.',
      }),
    })
  })

  test('opens and closes via the sidebar AI icon', async ({ page }) => {
    await page.goto('#skipTips=true')

    await expect(page.getByTestId('sidebar-icon-ai-panel')).toBeVisible({ timeout: 10000 })
    await page.getByTestId('sidebar-icon-ai-panel').click()

    await expect(page.getByTestId('global-chat-panel')).toBeVisible({ timeout: 5000 })
    expect(page.url()).toContain('chatPanel=')

    await page.getByTestId('global-chat-close').click()
    await expect(page.getByTestId('global-chat-panel')).not.toBeVisible()
    expect(page.url()).not.toContain('chatPanel=')
  })

  test('toggles with the keyboard shortcut', async ({ page }) => {
    await page.goto('#skipTips=true')
    await expect(page.getByTestId('sidebar-icon-ai-panel')).toBeVisible({ timeout: 10000 })

    await page.keyboard.press('Control+Shift+Period')
    await expect(page.getByTestId('global-chat-panel')).toBeVisible({ timeout: 5000 })

    await page.keyboard.press('Control+Shift+Period')
    await expect(page.getByTestId('global-chat-panel')).not.toBeVisible()
  })

  test('restores open state from the URL on reload', async ({ page }) => {
    await page.goto('#skipTips=true')
    await expect(page.getByTestId('sidebar-icon-ai-panel')).toBeVisible({ timeout: 10000 })
    await page.getByTestId('sidebar-icon-ai-panel').click()
    await expect(page.getByTestId('global-chat-panel')).toBeVisible({ timeout: 5000 })

    await page.reload()
    await expect(page.getByTestId('global-chat-panel')).toBeVisible({ timeout: 10000 })
  })

  test('sends a message and receives a response', async ({ page }) => {
    await page.goto('#skipTips=true')
    await setupLLMConnection(page)

    await page.getByTestId('sidebar-icon-ai-panel').click()
    const panel = page.getByTestId('global-chat-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })

    // No conversations yet: the panel falls back to the list view.
    await expect(panel.getByTestId('global-chat-new-conversation')).toBeVisible({ timeout: 5000 })
    await panel.getByTestId('global-chat-new-conversation').click()

    await panel.getByTestId('input-textarea').fill('Hello')
    await panel.getByTestId('send-button').click()

    await expect(panel.getByTestId('message-user-0')).toContainText('Hello', { timeout: 5000 })
    await expect(panel.getByTestId('message-assistant-1')).toContainText('Hi there', {
      timeout: 10000,
    })
  })

  test('persists conversation across screen navigation', async ({ page }) => {
    await page.goto('#skipTips=true')
    await setupLLMConnection(page)

    await page.getByTestId('sidebar-icon-ai-panel').click()
    const panel = page.getByTestId('global-chat-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })
    await panel.getByTestId('global-chat-new-conversation').click()

    await panel.getByTestId('input-textarea').fill('Hello')
    await panel.getByTestId('send-button').click()
    await expect(panel.getByTestId('message-assistant-1')).toBeVisible({ timeout: 10000 })

    // Switch main screens; the panel and its conversation must survive the
    // screen unmount/remount cycle.
    await openSidebarScreen(page, 'tutorial', false)
    await expect(panel).toBeVisible({ timeout: 5000 })
    await expect(panel.getByTestId('message-user-0')).toContainText('Hello')

    await openSidebarScreen(page, 'editors', false)
    await expect(panel).toBeVisible({ timeout: 5000 })
    await expect(panel.getByTestId('message-user-0')).toContainText('Hello')
  })

  test('manages conversations: create, rename, switch, delete', async ({ page }) => {
    await page.goto('#skipTips=true')
    await setupLLMConnection(page)

    await page.getByTestId('sidebar-icon-ai-panel').click()
    const panel = page.getByTestId('global-chat-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })

    // Create two conversations.
    await panel.getByTestId('global-chat-new-conversation').click()
    await expect(panel.getByTestId('global-chat-title-display')).toBeVisible({ timeout: 5000 })
    await panel.getByTestId('global-chat-new').click()

    // Rename the active conversation.
    await panel.getByTestId('global-chat-title-display').click()
    await panel.getByTestId('global-chat-title-input').fill('My Renamed Chat')
    await panel.getByTestId('global-chat-title-input').press('Enter')
    await expect(panel.getByTestId('global-chat-title-display')).toContainText('My Renamed Chat')

    // The list shows both conversations.
    await panel.getByTestId('global-chat-list-toggle').click()
    const rows = panel.locator('[data-testid^="global-chat-conversation-"]')
    await expect(rows).toHaveCount(2)
    await expect(panel.getByText('My Renamed Chat')).toBeVisible()

    // Delete the active conversation (accept the confirm dialog). The panel
    // auto-falls-back to the remaining conversation and returns to
    // conversation view.
    page.once('dialog', (dialog) => dialog.accept())
    const renamedRow = panel
      .locator('[data-testid^="global-chat-conversation-"]')
      .filter({ hasText: 'My Renamed Chat' })
    await renamedRow.hover()
    await renamedRow.locator('[data-testid^="global-chat-delete-"]').click()
    await expect(panel.getByTestId('global-chat-title-display')).toBeVisible({ timeout: 5000 })
    await expect(panel.getByTestId('global-chat-title-display')).not.toContainText(
      'My Renamed Chat',
    )

    // The list now shows only the remaining conversation.
    await panel.getByTestId('global-chat-list-toggle').click()
    await expect(rows).toHaveCount(1)
  })
})
