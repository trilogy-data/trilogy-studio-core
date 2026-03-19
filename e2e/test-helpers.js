import { expect } from '@playwright/test'

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

export async function refreshConnection(page, connectionName) {
  const directRefresh = page.getByTestId(`refresh-connection-${connectionName}`).filter({
    visible: true,
  })

  if ((await directRefresh.count()) > 0) {
    await directRefresh.first().click()
    return
  }

  const rowByTestIdLabel = page.getByTestId(`connection-${connectionName}`)
  const rowByTextLabel = page.getByText(connectionName, { exact: true })
  const connectionLabel =
    (await rowByTestIdLabel.count()) > 0 ? rowByTestIdLabel.first() : rowByTextLabel.first()
  const connectionRow = connectionLabel.locator(
    'xpath=ancestor::div[contains(@class,"sidebar-content")][1]',
  )

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.locator('[title="Connection actions"]').first().click()
  await page.locator('.context-menu-item', { hasText: 'Refresh connection' }).click()
}

export async function createEditorFromConnection(page, connectionName, type = 'trilogy') {
  const directButton = page.getByTestId(`quick-new-editor-${connectionName}-${type}`).filter({
    visible: true,
  })

  if ((await directButton.count()) > 0) {
    await directButton.first().click()
    return
  }

  const editorConnectionLabel = page.getByTestId(`editor-c-local-${connectionName}`)
  const connectionRow = editorConnectionLabel.locator(
    'xpath=ancestor::div[contains(@class,"sidebar-content")][1]',
  )

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.locator('[title="Connection actions"]').first().click()

  const actionLabel = type === 'sql' ? 'New SQL editor' : 'New Trilogy editor'
  await page.locator('.context-menu-item', { hasText: actionLabel }).click()
}

export async function openDashboardItemEditor(page, itemId) {
  const itemCard = page.getByTestId(`dashboard-component-${itemId}`)
  const editButton = page.getByTestId(`edit-dashboard-item-content-${itemId}`)

  await itemCard.scrollIntoViewIfNeeded()
  await itemCard.hover({ force: true })
  await expect(editButton).toBeVisible()
  await editButton.dispatchEvent('click')
}
