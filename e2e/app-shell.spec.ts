// Does the app shell boot at all?
//
// Every other spec assumes it does, and when it doesn't they all fail with the
// same useless "waiting for locator" message. This one runs the smallest
// possible check and reports *why* the shell didn't come up: the uncaught
// exception, the 404'd chunk, the console error.
//
// src/main.ts calls removeLoadingScreen() synchronously during module
// evaluation, immediately before app.mount('#app'). So:
//   - #loading-screen still in the DOM  → main.ts never finished evaluating
//   - #loading-screen gone but #app empty → mount threw
// Both are fatals, and both are distinguishable here.
import { test, expect } from './console-capture'
import { prepareTestPage } from './test-helpers.js'

const BOOT_TIMEOUT = 30000

test.beforeEach(async ({ page }) => {
  await prepareTestPage(page)
})

test('app shell boots without a fatal browser error', async ({ page, diagnostics }) => {
  await page.goto('/')

  // Don't let the assertion be the thing that times out — poll ourselves so a
  // failure carries the browser errors rather than a bare locator message.
  const loadingScreen = page.locator('#loading-screen')
  const booted = await loadingScreen
    .waitFor({ state: 'detached', timeout: BOOT_TIMEOUT })
    .then(() => true)
    .catch(() => false)

  const fatals = diagnostics.pageErrors()

  if (!booted) {
    const scripts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src]')).map((s) => (s as HTMLScriptElement).src),
    )
    throw new Error(
      `Loading screen never went away — src/main.ts did not finish evaluating.\n\n` +
        `${diagnostics.format()}\n\n` +
        `## Script tags on the page\n\n${scripts.map((s) => `- ${s}`).join('\n') || '(none)'}\n`,
    )
  }

  // Shell swapped: now confirm Vue actually rendered into it.
  const appHtmlLength = await page.locator('#app').evaluate((el) => el.innerHTML.length)
  expect(
    appHtmlLength,
    `#app is empty after the loading screen was removed — app.mount() threw.\n\n${diagnostics.format()}`,
  ).toBeGreaterThan(0)

  expect(
    fatals.map((i) => i.text),
    'Uncaught exception(s) during app boot',
  ).toEqual([])
})

test('no browser console errors during a cold load', async ({ page, diagnostics }) => {
  await page.goto('/')
  await expect(page.locator('#loading-screen')).toHaveCount(0, { timeout: BOOT_TIMEOUT })

  // Give async work kicked off at mount (monaco config, connection restore,
  // telemetry) a moment to fail if it's going to.
  await page.waitForTimeout(3000)

  // Reported, not asserted: console.error is used for recoverable conditions in
  // this app, so a hard assertion here would be noise. The attachment on the
  // HTML report is the deliverable — `browser-errors.md` under this test.
  const nonFatal = diagnostics.issues.filter((i) => i.kind !== 'pageerror')
  if (nonFatal.length > 0) {
    console.log(`[browser] ${nonFatal.length} non-fatal issue(s) during cold load`)
    console.log(diagnostics.format())
  }

  expect(
    diagnostics.pageErrors().map((i) => i.text),
    'Uncaught exception(s) within 3s of boot',
  ).toEqual([])
})
