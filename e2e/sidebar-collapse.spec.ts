import { test, expect, type Page, type Locator } from '@playwright/test'
import {
  localConnectionId,
  openSidebarScreen,
  prepareTestPage,
  refreshConnection,
  waitForConnectionReady,
} from './test-helpers.js'

const CONNECTION_NAME = 'collapse-test'
const CONNECTION_ID = localConnectionId(CONNECTION_NAME)

test.beforeEach(async ({ page }) => {
  await prepareTestPage(page)
})

/**
 * Clicks a chevron closed and open again, asserting the child row follows.
 *
 * Only expanding is not enough coverage: when a list ignores its collapsed map
 * the children are always rendered, so an expand-only test passes against a
 * chevron that does nothing.
 */
async function expectChevronToggles(chevron: Locator, child: Locator) {
  await expect(chevron).toBeVisible()

  // Normalise to expanded first — the initial state depends on which item the
  // URL hash points at.
  if (!(await child.isVisible().catch(() => false))) {
    await chevron.click()
  }
  await expect(child).toBeVisible()

  await chevron.click()
  await expect(child).toBeHidden()

  await chevron.click()
  await expect(child).toBeVisible()
}

/**
 * `openSidebarScreen` only allows 10s for the icon rail, which a cold start can
 * exceed. Wait for the shell explicitly so a slow boot doesn't read as a
 * missing sidebar.
 */
async function gotoStudio(page: Page) {
  await page.goto('#skipTips=true')
  await expect(page.getByTestId('sidebar-icons')).toBeVisible({ timeout: 30000 })
}

async function createDuckdbConnection(page: Page) {
  await openSidebarScreen(page, 'connections')
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').fill(CONNECTION_NAME)
  await page.getByTestId('connection-creator-submit').click()
  await refreshConnection(page, CONNECTION_NAME)
  await waitForConnectionReady(page, CONNECTION_NAME)
}

async function createEditor(page: Page, name: string) {
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').fill(name)
  await page.getByTestId('editor-creator-type').selectOption('sql')
  await page
    .getByTestId('editor-creator-connection-select')
    .selectOption({ label: CONNECTION_NAME })
  await page.getByTestId('editor-creator-submit').click()
}

// Mobile hides the chevrons entirely (MobileTreeList drills into branches
// instead), so these are desktop-only.
test.describe('sidebar chevrons collapse and expand', () => {
  test.skip(({ isMobile }) => !!isMobile, 'chevrons are hidden in the mobile tree')

  test('documentation sidebar', async ({ page }) => {
    await gotoStudio(page)
    await openSidebarScreen(page, 'tutorial')

    await expectChevronToggles(
      page.getByTestId('expand-documentation-documentation+Studio'),
      page.getByTestId('documentation-article+Studio+Model Tutorial'),
    )
  })

  test('editors sidebar at storage, connection and folder levels', async ({ page }) => {
    test.setTimeout(180000)
    await gotoStudio(page)
    await createDuckdbConnection(page)

    await openSidebarScreen(page, 'editors')
    await createEditor(page, 'analysis/reports/sales-report')
    await createEditor(page, 'top-level')

    const connectionRow = page.getByTestId(`editor-c-local-${CONNECTION_ID}`)
    const analysisFolder = page.getByTestId(`editor-f-local-${CONNECTION_ID}-analysis`)
    const reportsFolder = page.getByTestId(`editor-f-local-${CONNECTION_ID}-analysis/reports`)
    await expect(connectionRow).toBeVisible()

    // Folder level.
    await expectChevronToggles(
      page.getByTestId(`expand-editor-f-local-${CONNECTION_ID}-analysis`),
      reportsFolder,
    )

    // Connection level.
    await expectChevronToggles(
      page.getByTestId(`expand-editor-c-local-${CONNECTION_ID}`),
      analysisFolder,
    )

    // Storage level.
    await expectChevronToggles(page.getByTestId('expand-editor-s-local'), connectionRow)
  })

  test('connections sidebar', async ({ page }) => {
    test.setTimeout(180000)
    await gotoStudio(page)
    await createDuckdbConnection(page)

    await expectChevronToggles(
      page.getByTestId(`expand-connection-${CONNECTION_ID}`),
      page.getByTestId(`connection-${CONNECTION_ID}+memory`),
    )
  })

  test('dashboards sidebar', async ({ page }) => {
    test.setTimeout(180000)
    await gotoStudio(page)
    await createDuckdbConnection(page)

    await openSidebarScreen(page, 'dashboard')
    await page.getByTestId('dashboard-creator-add').click()
    await page.getByTestId('dashboard-creator-name').fill('collapse-dash')
    await page.getByTestId('dashboard-creator-connection').selectOption(CONNECTION_ID)
    await page.getByTestId('dashboard-creator-submit').click()

    // Dashboard ids are generated, so match the row by its testid prefix.
    const dashboardRow = page.locator('[data-testid^="dashboard-d-"]').first()
    await expect(dashboardRow).toBeVisible()

    await expectChevronToggles(
      page.getByTestId(`expand-dashboard-c-local-${CONNECTION_ID}`),
      dashboardRow,
    )
    await expectChevronToggles(
      page.getByTestId('expand-dashboard-s-local'),
      page.getByTestId(`dashboard-c-local-${CONNECTION_ID}`),
    )
  })
})
