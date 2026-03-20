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

export async function openSidebarScreen(page, screen, isMobile = false) {
  if (isMobile) {
    const mobileMenuToggle = page.getByTestId('mobile-menu-toggle')
    await expect(mobileMenuToggle).toBeVisible({ timeout: 10000 })
    await mobileMenuToggle.click()

    const mobileSidebarIcon = page.getByTestId(`sidebar-icon-${screen}`)

    await expect(mobileSidebarIcon).toBeVisible({ timeout: 5000 })
    await mobileSidebarIcon.scrollIntoViewIfNeeded()
    await mobileSidebarIcon.click({ force: true })
    return
  }

  const sidebarIcon = page.getByTestId(`sidebar-icon-${screen}`).filter({ visible: true }).first()
  await expect(sidebarIcon).toBeVisible({ timeout: 10000 })
  await sidebarIcon.click({ force: true })
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
  await connectionRow.getByTestId(`connection-actions-${connectionName}-trigger`).click()
  await page.getByTestId(`connection-actions-${connectionName}-refresh`).click()
}

export async function createEditorFromConnectionList(page, connectionName, type = 'trilogy') {
  const connectionRow = await getVisibleConnectionRow(page, connectionName)

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.getByTestId(`connection-actions-${connectionName}-trigger`).click()

  const actionId = type === 'sql' ? 'new-sql' : 'new-trilogy'
  await page.getByTestId(`connection-actions-${connectionName}-${actionId}`).click()
}

export async function refreshLLMConnection(page, connectionName) {
  const connectionLabel = page.getByTestId(`llm-connection-${connectionName}`).filter({
    visible: true,
  })
  const connectionRow = connectionLabel.locator(
    'xpath=ancestor::div[contains(@class,"sidebar-content")][1]',
  )

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.getByTestId(`llm-connection-actions-${connectionName}-trigger`).click()
  await page.getByTestId(`llm-connection-actions-${connectionName}-refresh`).click()
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
  await connectionRow.getByTestId(`editor-actions-c-local-${connectionName}-trigger`).click()

  const actionId = type === 'sql' ? 'new-sql' : 'new-trilogy'
  await page.getByTestId(`editor-actions-c-local-${connectionName}-${actionId}`).click()
}

async function openSidebarOverflowMenu(page, labelLocator, triggerTestId) {
  const row = labelLocator.locator('xpath=ancestor::div[contains(@class,"sidebar-content")][1]')

  await expect(row).toBeVisible()
  await row.hover()
  await row.getByTestId(triggerTestId).click()
}

export async function deleteEditor(page, editorTestId, isMobile = false) {
  const visibleEditorLabel = page.getByTestId(editorTestId).filter({ visible: true })
  const editorKey = editorTestId.replace(/^editor-/, '')

  if ((await visibleEditorLabel.count()) === 0 && isMobile) {
    await openSidebarScreen(page, 'editors', true)
  }

  await openSidebarOverflowMenu(
    page,
    page.getByTestId(editorTestId).filter({ visible: true }).first(),
    `editor-actions-${editorKey}-trigger`,
  )
  await page
    .getByTestId(`editor-actions-${editorKey}-delete-editor`)
    .filter({ visible: true })
    .click()
  await page.getByTestId('confirm-editor-deletion').filter({ visible: true }).click()
}

export async function waitForEditorQueryComplete(page, timeout = 60000) {
  await Promise.race([
    page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")', { timeout }),
    page.getByTestId('query-results-length').waitFor({ state: 'visible', timeout }),
    page.getByTestId('error-text').waitFor({ state: 'visible', timeout }),
  ])
}

export async function runEditorQueryAndExpectCount(page, expectedCount, timeout = 60000) {
  await page.getByTestId('editor-run-button').click()
  await waitForEditorQueryComplete(page, timeout)

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
