import { test, expect } from './console-capture'
import {
  openSidebarScreen,
  prepareTestPage,
  refreshConnection,
  waitForConnectionReady,
} from './test-helpers.js'

/**
 * End-to-end coverage for the dashboard container theme picker.
 *
 * The unit suite proves the resolver and the picker's emit contract in
 * isolation. What only a browser can prove is the last link in the chain: that
 * a click in the dialog reaches the dashboard root as real CSS custom
 * properties, and that "reset" actually restores the pre-theming values rather
 * than leaving a half-applied theme behind.
 *
 * Deliberately runs no queries, so it needs no trilogy resolver — the theme is
 * pure container styling and an empty dashboard exercises it fully.
 */

const connectionName = 'duckdb-theme-test'

test.beforeEach(async ({ page }) => {
  await prepareTestPage(page)
})

/** Read the custom properties the theme writes onto the dashboard root. */
async function readThemeVars(page: any) {
  return page.evaluate(() => {
    const el = document.querySelector('.dashboard-container') as HTMLElement | null
    if (!el) return null
    const read = (name: string) => el.style.getPropertyValue(name)
    return {
      radius: read('--dashboard-card-radius'),
      borderWidth: read('--dashboard-card-border-width'),
      gutter: read('--dashboard-gutter'),
      accent: read('--special-text'),
      accentRgb: read('--special-text-rgb'),
      cardBg: read('--dashboard-card-bg'),
    }
  })
}

test('dashboard theme picker applies, persists, and resets', async ({ page, isMobile }) => {
  test.setTimeout(180000)
  // The theme control is desktop-only: the mobile filter row is a fixed dock
  // with room for a handful of actions, and theming yields its slot there.
  test.skip(isMobile, 'theme picker is not exposed on the mobile dock')

  await page.goto('#skipTips=true')

  // The IDE is a lazy chunk; on a cold dev server it can outlast the sidebar
  // helper's own timeout while it compiles.
  await page
    .locator('[data-testid^="sidebar-icon-"]')
    .first()
    .waitFor({ state: 'attached', timeout: 120000 })

  await openSidebarScreen(page, 'connections', isMobile)
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').click()
  await page.getByTestId('connection-creator-name').fill(connectionName)
  await page.getByTestId('connection-creator-submit').click()
  await refreshConnection(page, connectionName)
  await waitForConnectionReady(page, connectionName)

  await openSidebarScreen(page, 'dashboard', isMobile)
  await page.getByTestId('dashboard-creator-add').click()
  await page.getByTestId('dashboard-creator-name').fill('theme-demo')
  await page.getByTestId('dashboard-creator-connection').selectOption(connectionName)
  await page.getByTestId('dashboard-creator-submit').click()
  await expect(page.getByText('An Empty Dashboard')).toBeVisible({ timeout: 30000 })

  // An untouched dashboard resolves to exactly the pre-theming literals.
  const initial = await readThemeVars(page)
  expect(initial?.radius).toBe('14px')
  expect(initial?.borderWidth).toBe('1px')
  expect(initial?.accent).toBe('')

  await page.getByTestId('dashboard-theme-button').click()
  await expect(page.getByTestId('dashboard-theme-popup')).toBeVisible()

  // Paper drops the card ring in favour of elevation.
  await page.getByTestId('theme-preset-paper').click()
  expect((await readThemeVars(page))?.borderWidth).toBe('0px')

  // A color set through the text field reaches the root, and the accent brings
  // its rgb triple with it — chips and hover states consume that inside rgba().
  const accent = page.getByTestId('theme-color-accentColor')
  await accent.scrollIntoViewIfNeeded()
  await accent.fill('#c2410c')
  await accent.press('Enter')

  const themed = await readThemeVars(page)
  expect(themed?.accent).toBe('#c2410c')
  expect(themed?.accentRgb).toBe('194, 65, 12')

  // A value the vocabulary rejects is refused in place, and nothing is applied.
  const cardBg = page.getByTestId('theme-color-cardBackground')
  await cardBg.fill('url(https://evil.example/pixel.png)')
  await cardBg.press('Enter')
  await expect(cardBg).toHaveClass(/invalid/)
  expect((await readThemeVars(page))?.cardBg).toBe('')

  await page.getByTestId('theme-done-button').click()
  await expect(page.getByTestId('dashboard-theme-popup')).toBeHidden()

  // The theme is on the dashboard model, so it survives leaving and returning.
  await openSidebarScreen(page, 'editors', isMobile)
  await openSidebarScreen(page, 'dashboard', isMobile)
  await expect(page.getByTestId('dashboard-theme-button')).toBeVisible()

  const persisted = await readThemeVars(page)
  expect(persisted?.borderWidth).toBe('0px')
  expect(persisted?.accent).toBe('#c2410c')

  // Reset restores the untouched rendering rather than a half-applied theme.
  await page.getByTestId('dashboard-theme-button').click()
  await page.getByTestId('theme-reset-button').click()
  await page.getByTestId('theme-done-button').click()

  expect(await readThemeVars(page)).toEqual(initial)
})
