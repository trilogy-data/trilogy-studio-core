import { expect } from '@playwright/test'
import { getResolverUrl } from './test-env.js'

export { getResolverUrl }

// Mirrors lib/connections/base.ts computeConnectionId for the local storage
// path used by every Playwright fixture. Connection rows now key their test
// ids off the deterministic connection id rather than the display name so two
// connections sharing a name (e.g. local + remote) don't collide.
export function localConnectionId(name) {
  return `local:${name}`
}

// Remote-storage analogue. The auto-import flow accepts an explicit `storeId`
// URL param so tests can pin the id to a known value (see
// `remote-store-import.spec.ts`).
export function remoteConnectionId(storeId, name) {
  return `remote:${storeId}:${name}`
}

export async function prepareTestPage(page) {
  const resolverUrl = getResolverUrl()

  await page.addInitScript((url) => {
    if (window.localStorage.getItem('__playwright_prepared') === 'true') {
      return
    }

    window.localStorage.clear()
    window.sessionStorage.clear()
    const userSettings = {
      theme: '',
      telemetryEnabled: false,
      tipsRead: [],
      skipAllTips: true,
    }
    if (url) {
      userSettings.trilogyResolver = url
    }
    window.localStorage.setItem('userSettings', JSON.stringify(userSettings))
    window.localStorage.setItem('__playwright_prepared', 'true')
  }, resolverUrl)
}

async function ensureConnectionsSidebarVisible(page, connectionName) {
  const connectionTestId = `connection-${localConnectionId(connectionName)}`
  const visibleRow = page.getByTestId(connectionTestId).filter({ visible: true })
  if ((await visibleRow.count()) > 0) {
    return
  }

  const mobileMenuToggle = page.getByTestId('mobile-menu-toggle').filter({ visible: true })
  if ((await mobileMenuToggle.count()) > 0) {
    await mobileMenuToggle.first().click()
    await page.getByTestId(`sidebar-icon-connections`).click()
    await expect(
      page.getByTestId(connectionTestId).filter({ visible: true }).first(),
    ).toBeVisible()
  }
}

export async function waitForConnectionReady(page, connectionName, timeout = 60000) {
  await ensureConnectionsSidebarVisible(page, connectionName)
  await expect(
    page.getByTestId(`status-icon-${connectionName}`).filter({ visible: true }).first(),
  ).toHaveClass(/connected/, { timeout })
}

export async function openSidebarScreen(page, screen, isMobile = false) {
  if (isMobile) {
    const mobileMenuToggle = page.getByTestId('mobile-menu-toggle')
    await expect(mobileMenuToggle).toBeVisible({ timeout: 10000 })

    const sidebarIcon = page.getByTestId(`sidebar-icon-${screen}`).first()

    if (!(await sidebarIcon.isVisible().catch(() => false))) {
      await mobileMenuToggle.click({ force: true })
      await expect(sidebarIcon).toBeVisible({ timeout: 10000 })
    }

    await sidebarIcon.click({ force: true })
    return
  }

  const expandedSidebarContent = page.locator(
    '.sidebar-container > .sidebar-content:not(.sidebar-content-collapsed)',
  )
  const selectedSidebarIcon = page
    .locator(`[data-testid="sidebar-icon-${screen}"].selected`)
    .first()

  if ((await selectedSidebarIcon.count()) > 0 && (await expandedSidebarContent.isVisible())) {
    return
  }

  const sidebarIcon = page.getByTestId(`sidebar-icon-${screen}`).filter({ visible: true }).first()
  await expect(sidebarIcon).toBeVisible({ timeout: 10000 })
  await sidebarIcon.click({ force: true })
  await expect(sidebarIcon).toHaveClass(/selected/, { timeout: 10000 })
  await expect(expandedSidebarContent).toBeVisible({ timeout: 10000 })
}

async function getVisibleConnectionRow(page, connectionName) {
  await ensureConnectionsSidebarVisible(page, connectionName)
  const rowByTestIdLabel = page
    .getByTestId(`connection-${localConnectionId(connectionName)}`)
    .filter({
      visible: true,
    })
  const rowByTextLabel = page.getByText(connectionName, { exact: true }).filter({
    visible: true,
  })
  const connectionLabel =
    (await rowByTestIdLabel.count()) > 0 ? rowByTestIdLabel.first() : rowByTextLabel.first()

  return connectionLabel.locator('xpath=ancestor::div[contains(@class,"sidebar-content")][1]')
}

async function clickMenuItem(page, testId) {
  const item = page.getByTestId(testId).filter({ visible: true }).first()
  await expect(item).toBeVisible()
  await item.click()
}

export async function refreshConnection(page, connectionName) {
  const directRefresh = page.getByTestId(`refresh-connection-${connectionName}`).filter({
    visible: true,
  })

  if ((await directRefresh.count()) > 0) {
    await directRefresh.first().click()
    return
  }

  const connectionId = localConnectionId(connectionName)
  const connectionRow = await getVisibleConnectionRow(page, connectionName)

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.getByTestId(`connection-actions-${connectionId}-trigger`).click()
  await clickMenuItem(page, `connection-actions-${connectionId}-refresh`)
}

export async function createEditorFromConnectionList(page, connectionName, type = 'trilogy') {
  const connectionId = localConnectionId(connectionName)
  const connectionRow = await getVisibleConnectionRow(page, connectionName)

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.getByTestId(`connection-actions-${connectionId}-trigger`).click()

  const actionId = type === 'sql' ? 'new-sql' : 'new-trilogy'
  await page.getByTestId(`connection-actions-${connectionId}-${actionId}`).click()
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
  await clickMenuItem(page, `llm-connection-actions-${connectionName}-refresh`)
}

export async function createEditorFromConnection(
  page,
  connectionName,
  type = 'trilogy',
  remoteStoreId = null,
) {
  const directButton = page.getByTestId(`quick-new-editor-${connectionName}-${type}`).filter({
    visible: true,
  })

  if ((await directButton.count()) > 0) {
    await directButton.first().click()
    return
  }

  // Editor sidebar rows key off the connection id (`editor-c-local-local:foo`
  // or `editor-c-remote-remote:<storeId>:<name>`). Callers pass an explicit
  // `remoteStoreId` when targeting a remote row; otherwise we resolve the
  // local row deterministically.
  const isRemote = remoteStoreId != null
  const editorConnId = isRemote
    ? remoteConnectionId(remoteStoreId, connectionName)
    : localConnectionId(connectionName)
  const storage = isRemote ? 'remote' : 'local'
  const editorConnectionLabel = page
    .getByTestId(`editor-c-${storage}-${editorConnId}`)
    .filter({ visible: true })
  const connectionRow = editorConnectionLabel
    .first()
    .locator('xpath=ancestor::div[contains(@class,"sidebar-content")][1]')

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  const actionId = type === 'sql' ? 'new-sql' : 'new-trilogy'
  await connectionRow
    .getByTestId(`editor-actions-c-${storage}-${editorConnId}-trigger`)
    .click()
  await page.getByTestId(`editor-actions-c-${storage}-${editorConnId}-${actionId}`).click()
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
