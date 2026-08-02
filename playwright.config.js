// playwright.config.js
import { defineConfig, devices } from '@playwright/test'
import { getBaseUrl, needsWebServer } from './e2e/test-env.js'

const usePreview = process.env.PLAYWRIGHT_USE_PREVIEW === 'true'

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  // 56 test blocks across 5 projects is 280 runs; at one worker with retries
  // that has no practical ceiling, so a single hung worker can run until the
  // GitHub job timeout. Abort the whole run instead — this fires before the
  // job's timeout-minutes, so the HTML report still uploads and shows which
  // test was in flight.
  globalTimeout: process.env.CI ? 30 * 60 * 1000 : undefined,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: getBaseUrl(),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: needsWebServer()
    ? {
        command: usePreview ? 'pnpm preview --port 5173' : 'pnpm dev',
        port: 5173,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
})
