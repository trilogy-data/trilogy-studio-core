// playwright.config.js
import { defineConfig, devices } from '@playwright/test'

const usePreview = process.env.PLAYWRIGHT_USE_PREVIEW === 'true'
const inDocker = process.env.TEST_ENV === 'docker'
const inProd = process.env.TEST_ENV === 'prod'

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: inProd ? 'https://trilogydata.dev/trilogy-studio-core' : inDocker ? 'http://localhost:8080' : 'http://localhost:5173',
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
  webServer: (inDocker || inProd)
    ? undefined
    : {
        command: usePreview ? 'pnpm preview --port 5173' : 'pnpm dev',
        port: 5173,
        reuseExistingServer: !process.env.CI,
      },
})
