import { expect } from '@playwright/test'

export async function prepareTestPage(page) {
  const resolverUrl = process.env.VITE_RESOLVER_URL || 'https://trilogy-service.fly.dev'

  await page.addInitScript((url) => {
    if (window.localStorage.getItem('__playwright_prepared') === 'true') {
      return
    }

    window.localStorage.clear()
    window.sessionStorage.clear()
    window.localStorage.setItem(
      'userSettings',
      JSON.stringify({
        theme: '',
        trilogyResolver: url,
        telemetryEnabled: false,
        tipsRead: [],
        skipAllTips: true,
      }),
    )
    window.localStorage.setItem('__playwright_prepared', 'true')
  }, resolverUrl)
}

export async function waitForConnectionReady(page, connectionName, timeout = 15000) {
  await page.waitForFunction(
    (name) => {
      const element = document.querySelector(`[data-testid="status-icon-${name}"]`)
      if (!element) return false

      const style = window.getComputedStyle(element)
      const backgroundColor = style.backgroundColor
      return backgroundColor === 'rgb(0, 128, 0)' || backgroundColor === '#008000'
    },
    connectionName,
    { timeout },
  )
}

async function getVisibleConnectionRow(page, connectionName) {
  const rowByTestIdLabel = page.getByTestId(`connection-${connectionName}`).filter({
    visible: true,
  })
  const rowByTextLabel = page.getByText(connectionName, { exact: true }).filter({
    visible: true,
  })
  const connectionLabel =
    (await rowByTestIdLabel.count()) > 0 ? rowByTestIdLabel.first() : rowByTextLabel.first()

  return connectionLabel.locator('xpath=ancestor::div[contains(@class,"sidebar-content")][1]')
}

export async function refreshConnection(page, connectionName) {
  const directRefresh = page.getByTestId(`refresh-connection-${connectionName}`).filter({
    visible: true,
  })

  if ((await directRefresh.count()) > 0) {
    await directRefresh.first().click()
    return
  }

  const connectionRow = await getVisibleConnectionRow(page, connectionName)

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.locator('[title="Connection actions"]').first().click()
  await page.locator('.context-menu-item', { hasText: 'Refresh connection' }).click()
}

export async function createEditorFromConnectionList(page, connectionName, type = 'trilogy') {
  const connectionRow = await getVisibleConnectionRow(page, connectionName)

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.locator('[title="Connection actions"]').first().click()

  const actionLabel = type === 'sql' ? 'New SQL editor' : 'New Trilogy editor'
  await page.locator('.context-menu-item', { hasText: actionLabel }).click()
}

export async function refreshLLMConnection(page, connectionName) {
  const connectionLabel = page.getByTestId(`llm-connection-${connectionName}`).filter({
    visible: true,
  })
  const connectionRow = connectionLabel.locator('xpath=ancestor::div[contains(@class,"sidebar-content")][1]')

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.locator('[title="Connection actions"]').first().click()
  await page.locator('.context-menu-item', { hasText: 'Refresh Connection' }).click()
}

export async function createEditorFromConnection(page, connectionName, type = 'trilogy') {
  const directButton = page.getByTestId(`quick-new-editor-${connectionName}-${type}`).filter({
    visible: true,
  })

  if ((await directButton.count()) > 0) {
    await directButton.first().click()
    return
  }

  const editorConnectionLabel = page.getByTestId(`editor-c-local-${connectionName}`).filter({
    visible: true,
  })
  const connectionRow = editorConnectionLabel.locator(
    'xpath=ancestor::div[contains(@class,"sidebar-content")][1]',
  )

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.locator('[title="Connection actions"]').first().click()

  const actionLabel = type === 'sql' ? 'New SQL editor' : 'New Trilogy editor'
  await page.locator('.context-menu-item', { hasText: actionLabel }).click()
}

async function openSidebarOverflowMenu(page, labelLocator, tooltip) {
  const row = labelLocator.locator('xpath=ancestor::div[contains(@class,"sidebar-content")][1]')

  await expect(row).toBeVisible()
  await row.hover()
  await row.locator(`[title="${tooltip}"]`).first().click()
}

export async function deleteEditor(page, editorTestId) {
  const editorLabel = page.getByTestId(editorTestId)

  await openSidebarOverflowMenu(page, editorLabel, 'Editor actions')
  await page.locator('.context-menu-item', { hasText: 'Delete editor' }).click()
  await page.getByTestId('confirm-editor-deletion').click()
}

export async function runEditorQueryAndExpectCount(page, expectedCount, timeout = 30000) {
  await page.getByTestId('editor-run-button').click()
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")', { timeout })
  await expect(page.getByTestId('query-results-length')).toContainText(String(expectedCount), {
    timeout,
  })
}

export async function openDashboardItemEditor(page, itemId) {
  const itemCard = page.getByTestId(`dashboard-component-${itemId}`)
  const editButton = page.getByTestId(`edit-dashboard-item-content-${itemId}`)

  await itemCard.scrollIntoViewIfNeeded()
  await itemCard.hover({ force: true })
  await expect(editButton).toBeVisible()
  await editButton.dispatchEvent('click')
}
