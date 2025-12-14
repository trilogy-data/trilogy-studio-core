import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'child_process'
import * as path from 'path'
import { fileURLToPath } from 'url'

// Get the directory name in ESM context
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Custom Model Store', () => {
  let mockServer: ChildProcess | null = null

  // Start the mock server before all tests
  test.beforeAll(async () => {
    const projectRoot = path.join(__dirname, '..')
    const serverPath = path.join(projectRoot, 'pyserver', 'mock_model_server.py')

    // Determine the Python executable path based on OS
    const isWindows = process.platform === 'win32'
    const pythonExecutable = isWindows
      ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
      : path.join(projectRoot, '.venv', 'bin', 'python')

    console.log(`Starting mock server with ${pythonExecutable}...`)

    // Start the mock server
    mockServer = spawn(pythonExecutable, [serverPath], {
      cwd: path.join(projectRoot, 'pyserver'),
      stdio: 'pipe',
    })

    // Log server output
    mockServer.stdout?.on('data', (data) => {
      console.log(`Mock server: ${data}`)
    })

    mockServer.stderr?.on('data', (data) => {
      console.error(`Mock server error: ${data}`)
    })

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Mock server failed to start within 10 seconds'))
      }, 10000)

      const checkServer = async () => {
        try {
          const response = await fetch('http://localhost:8100/')
          if (response.ok) {
            clearTimeout(timeout)
            console.log('Mock server is ready!')
            resolve()
          } else {
            setTimeout(checkServer, 100)
          }
        } catch (error) {
          // Server not ready yet, try again
          setTimeout(checkServer, 100)
        }
      }

      checkServer()
    })
  })

  // Stop the mock server after all tests
  test.afterAll(async () => {
    if (mockServer) {
      console.log('Stopping mock server...')
      mockServer.kill()
      // Wait for the process to exit
      await new Promise<void>((resolve) => {
        mockServer?.on('exit', () => {
          console.log('Mock server stopped')
          resolve()
        })
        // Force kill after 5 seconds if it doesn't exit gracefully
        setTimeout(() => {
          if (mockServer && !mockServer.killed) {
            mockServer.kill('SIGKILL')
            resolve()
          }
        }, 5000)
      })
    }
  })

  test('should add custom store and import a model from it', async ({ page, isMobile }) => {
    // Navigate to the application
    await page.goto('#skipTips=true')

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Navigate to Community Models
    await page.getByTestId('sidebar-link-community-models').click()

    // Click "Add Store" button
    await page.getByRole('button', { name: 'Add Store' }).click()

    // Wait for the modal to appear
    await page.waitForSelector('[data-testid="add-store-modal"]', { timeout: 5000 })

    // Select "Generic URL" store type
    await page.getByTestId('store-type-select').selectOption('generic')

    // Fill in store details
    await page.getByTestId('store-name-input').fill('Local Test Store')
    await page.getByTestId('store-url-input').fill('http://localhost:8100')

    // Submit the form
    await page.getByTestId('add-store-submit').click()

    // Wait for the store to be added and fetched
    await page.waitForTimeout(2000)

    // Verify the store appears in the sidebar with a connected status
    const storeId = 'localhost:8100'
    await page.waitForSelector(`[data-testid="community-${storeId}"]`, { timeout: 10000 })

    // Verify the status icon shows connected (wait for fetch to complete)
    await page.waitForTimeout(3000)

    // Expand the custom store
    await page.getByTestId(`community-${storeId}`).click()

    // Wait for models to load
    await page.waitForTimeout(1000)

    // Verify we can see the DuckDB engine category
    await expect(page.getByTestId(`community-${storeId}+duckdb`)).toBeVisible()

    // Expand the DuckDB category
    await page.getByTestId(`community-${storeId}+duckdb`).click()

    // Verify we can see the Example DuckDB Model
    await expect(page.getByTestId(`community-${storeId}+duckdb+Example DuckDB Model`)).toBeVisible()

    // Click on the model to view details
    await page.getByTestId(`community-${storeId}+duckdb+Example DuckDB Model`).click()

    // Wait for the model details page to load
    await page.waitForTimeout(1000)

    // Verify model information is displayed using data-testids
    await expect(page.getByTestId('model-card-title-Example DuckDB Model')).toBeVisible()
    await expect(page.getByTestId('model-card-description-Example DuckDB Model')).toBeVisible()
    await expect(page.getByTestId('model-card-description-Example DuckDB Model')).toContainText(
      'A simple example model for testing the generic store feature',
    )

    // Import the model
    await page.getByTestId('import-Example DuckDB Model').click()

    // Select connection (create new DuckDB)
    await page.getByTestId('model-creator-connection').selectOption('New DuckDB')

    // Submit import
    await page.getByTestId('model-creation-submit').click()

    // Wait for import to complete
    await page.waitForTimeout(2000)

    // Navigate to connections to verify the model was imported
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }
    await page.getByTestId('sidebar-link-connections').click()

    const connectionName = 'Example DuckDB Model-connection'

    // Verify the connection was created
    await expect(page.getByTestId(`expand-connection-${connectionName}`)).toBeVisible()

    // Test the connection
    await page.getByTestId(`refresh-connection-${connectionName}`).click()

    // Wait for connection to be ready (green status)
    await page.waitForFunction(
      (connName) => {
        const element = document.querySelector(`[data-testid="status-icon-${connName}"]`)
        if (!element) return false

        const style = window.getComputedStyle(element)
        const backgroundColor = style.backgroundColor

        // Check if the background color is green (in RGB format)
        return backgroundColor === 'rgb(0, 128, 0)' || backgroundColor === '#008000'
      },
      connectionName,
      { timeout: 10000 },
    )

    // Navigate to editors
    await page.getByTestId('sidebar-link-editors').click()

    // Verify the model appears in the editors tree
    try {
      await page.getByTestId(`editor-c-local-${connectionName}`).click({ timeout: 1000 })
    } catch (e) {
      // May need to expand first
      await page.getByTestId('editor-s-local').click()
      await page.getByTestId(`editor-c-local-${connectionName}`).click()
    }

    // Create a new editor for the model
    await page
      .getByTestId(`quick-new-editor-${connectionName}-trilogy`)
      .filter({ visible: true })
      .click()

    // Verify editor is created with the imported model content
    await expect(page.getByTestId('editor')).toBeVisible()
  })

  test('should show error for unreachable custom store', async ({ page, isMobile }) => {
    // Navigate to the application
    await page.goto('#skipTips=true')

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Navigate to Community Models
    await page.getByTestId('sidebar-link-community-models').click()

    // Click "Add Store" button
    await page.getByRole('button', { name: 'Add Store' }).click()

    // Wait for the modal to appear
    await page.waitForSelector('[data-testid="add-store-modal"]', { timeout: 5000 })

    // Select "Generic URL" store type
    await page.getByTestId('store-type-select').selectOption('generic')

    // Fill in store details with unreachable URL
    await page.getByTestId('store-name-input').fill('Unreachable Store')
    await page.getByTestId('store-url-input').fill('http://localhost:9999')

    // Submit the form
    await page.getByTestId('add-store-submit').click()

    // Verify the store appears in the sidebar
    const failedStoreId = 'localhost:9999'
    await page.waitForSelector(`[data-testid="community-${failedStoreId}"]`, { timeout: 10000 })

    // Verify the store shows a failed status icon
    await expect(page.getByTestId(`status-icon-${failedStoreId}`)).toBeVisible()

    // Check that the status icon has the failed class (red background)
    const statusIcon = page.getByTestId(`status-icon-${failedStoreId}`)
    await expect(statusIcon).toHaveClass(/failed/)
  })

  test('should allow removing a custom store', async ({ page, isMobile }) => {
    // Navigate to the application
    await page.goto('#skipTips=true')

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Navigate to Community Models
    await page.getByTestId('sidebar-link-community-models').click()

    // Click "Add Store" button
    await page.getByRole('button', { name: 'Add Store' }).click()

    // Wait for the modal to appear
    await page.waitForSelector('[data-testid="add-store-modal"]', { timeout: 5000 })

    // Select "Generic URL" store type
    await page.getByTestId('store-type-select').selectOption('generic')

    // Fill in store details
    await page.getByTestId('store-name-input').fill('Temporary Store')
    await page.getByTestId('store-url-input').fill('http://localhost:8100')

    // Submit the form
    await page.getByTestId('add-store-submit').click()

    // Wait for the store to be added
    await page.waitForTimeout(2000)

    // Verify the store appears
    const storeId = 'localhost:8100'
    await page.waitForSelector(`[data-testid="community-${storeId}"]`, { timeout: 10000 })

    // Hover over the store item to show the delete button
    await page.getByTestId(`community-${storeId}`).hover()

    // Click the delete button
    await page.getByTestId(`delete-store-${storeId}`).click()

    // Confirm deletion in the modal
    await page.getByTestId('confirm-store-deletion').click()

    // Verify the store is removed
    await page.waitForSelector(`[data-testid="community-${storeId}"]`, {
      state: 'detached',
      timeout: 5000,
    })
  })
})
