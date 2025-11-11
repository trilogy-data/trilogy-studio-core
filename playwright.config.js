// playwright.config.js
import { defineConfig, devices } from '@playwright/test'

const usePreview = process.env.PLAYWRIGHT_USE_PREVIEW === 'true'

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
    baseURL: process.env.TEST_ENV ==='docker'? 'http://localhost:8080' : 'http://localhost:5173',
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
  webServer: {
    // if in docker; 
    command: usePreview ? 'pnpm preview --port 5173' : 'pnpm dev',
    // command: 'pnpm preview --port 5173',
    port: 5173,
    // in docker tests, we are running the image, use that as abase
    reuseExistingServer: process.env.TEST_ENV ==='docker' || !process.env.CI,
  },
})
