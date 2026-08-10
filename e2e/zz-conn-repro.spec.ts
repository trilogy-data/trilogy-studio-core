import { test, expect } from './console-capture'
import { localConnectionId, openSidebarScreen, prepareTestPage } from './test-helpers.js'

test.beforeEach(async ({ page }) => {
  await prepareTestPage(page)
})

async function createConnection(page, name: string) {
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').click()
  await page.getByTestId('connection-creator-name').fill(name)
  await page.getByTestId('connection-creator-submit').click()
}

test('repro: header connection blank after wizard create', async ({ page, isMobile }) => {
  test.setTimeout(120000)
  await page.goto('#skipTips=true')

  await page
    .locator('[data-testid^="sidebar-icon-"]')
    .first()
    .waitFor({ state: 'attached', timeout: 120000 })
  await openSidebarScreen(page, 'connections', isMobile)
  await createConnection(page, 'alpha-conn')
  await createConnection(page, 'beta-conn')

  await openSidebarScreen(page, 'dashboard', isMobile)
  await page.getByTestId('dashboard-creator-add').click({ force: true })
  await page.getByTestId('dashboard-creator-name').fill('repro-dash')
  await page.getByTestId('dashboard-creator-connection').selectOption('beta-conn')
  const importSelect = page.getByTestId('dashboard-creator-import')
  if (await importSelect.isVisible()) {
    const opts = await importSelect.locator('option').allTextContents()
    console.log('WIZARD IMPORT OPTIONS >>>', JSON.stringify(opts))
    await importSelect.selectOption({ index: 0 })
  }
  await page.getByTestId('dashboard-creator-submit').click()

  const elementExists = await page.isVisible('[data-testid="dashboard-d-repro-dash"]')
  if (!elementExists) {
    await page.getByTestId('dashboard-s-local').click()
    await page.getByTestId(`dashboard-c-local-${localConnectionId('beta-conn')}`).click()
  }
  await page.getByTestId('dashboard-d-repro-dash').click()

  await expect(page.getByTestId('connection-selector')).toBeVisible()

  const readSelect = () =>
    page.evaluate(() => {
      const sel = document.querySelector(
        '[data-testid="connection-selector"]',
      ) as HTMLSelectElement | null
      const dashRaw = localStorage.getItem('dashboards')
      return {
        value: sel?.value,
        selectedIndex: sel?.selectedIndex,
        options: Array.from(sel?.options || []).map((o) => o.value),
        title: sel?.getAttribute('title'),
        storedConn: dashRaw ? (JSON.parse(dashRaw)[0] || {}).connectionId : undefined,
      }
    })

  console.log('AFTER CREATE >>>', JSON.stringify(await readSelect()))
  await page.reload()
  await expect(page.getByTestId('connection-selector')).toBeVisible({ timeout: 30000 })
  console.log('AFTER RELOAD >>>', JSON.stringify(await readSelect()))
  await page.waitForTimeout(2000)
  console.log('AFTER RELOAD+2s >>>', JSON.stringify(await readSelect()))
})
