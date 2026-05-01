import { test, expect } from '@playwright/test'
import { prepareTestPage } from './test-helpers.js'

test.beforeEach(async ({ page }) => {
  await prepareTestPage(page)
})

// Validates that the tutorial article container is a real scroll surface in
// every browser project (chromium, firefox, webkit, mobile chrome/safari).
// Firefox previously failed to scroll because the container had no constrained
// height — see lib/views/TutorialPage.vue.
test('tutorial article container scrolls', async ({ page }) => {
  await page.goto(
    '#screen=tutorial&sidebarScreen=tutorial&tutorial=article%2BStudio%2BWelcome&skipTips=true',
  )

  const container = page.getByTestId('tutorial-container')
  await expect(container).toBeVisible({ timeout: 15000 })

  // Wait for content to render so scrollHeight stabilises above the viewport.
  await expect
    .poll(
      async () =>
        await container.evaluate((el) => el.scrollHeight - el.clientHeight),
      { timeout: 15000 },
    )
    .toBeGreaterThan(50)

  const { scrollHeight, clientHeight } = await container.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }))
  expect(clientHeight).toBeGreaterThan(0)
  expect(scrollHeight).toBeGreaterThan(clientHeight)

  // Confirm the element itself is the scroll container — i.e. setting its
  // scrollTop actually moves it. If the height isn't constrained (the Firefox
  // bug), scrollTop stays at 0.
  expect(await container.evaluate((el) => el.scrollTop)).toBe(0)

  const target = Math.min(200, scrollHeight - clientHeight)
  await container.evaluate((el, top) => {
    el.scrollTop = top
  }, target)

  await expect
    .poll(async () => await container.evaluate((el) => el.scrollTop), { timeout: 5000 })
    .toBeGreaterThan(0)
})
