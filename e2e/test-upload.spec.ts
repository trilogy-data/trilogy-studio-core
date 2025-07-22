import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// Get the directory name in ESM context
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Create a sample CSV for testing
const createSampleCSV = () => {
  const csvContent = `id,name,age,joined_date,is_active
1,John Doe,32,2021-05-15,true
2,Jane Smith,28,2022-01-10,true
3,Bob Johnson,45,2020-11-22,false
4,Alice Brown,33,2021-08-03,true
5,Charlie Davis,22,2023-02-28,true
`
  const testDataDir = path.join(__dirname, 'test-data')
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true })
  }
  const filePath = path.join(testDataDir, 'sample-users.csv')
  fs.writeFileSync(filePath, csvContent)
  return filePath
}

test.describe('CSV Upload and Datasource Creation', () => {
  let csvFilePath: string

  // Set up before tests
  test.beforeAll(async () => {
    // Create sample CSV file for testing
    csvFilePath = createSampleCSV()
  })

  // Clean up after tests
  test.afterAll(async () => {
    // Optionally remove test CSV file
    fs.unlinkSync(csvFilePath)
  })

  test('should upload CSV file and create datasource from it', async ({ page, isMobile }) => {
    // Navigate to the application
    await page.goto('http://localhost:5173/trilogy-studio-core/')

    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }

    // Navigate to connections and create upload connection
    await page.getByTestId('sidebar-link-connections').click()
    await page.getByTestId('connection-creator-add').click()
    await page.getByTestId('connection-creator-name').click()
    await page.getByTestId('connection-creator-name').fill('upload-test')
    await page.getByTestId('connection-creator-submit').click()
    await page.getByTestId('refresh-connection-upload-test').click()

    // Wait for connection to be ready (green status)
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="status-icon-upload-test"]')
      if (!element) return false
      const style = window.getComputedStyle(element)
      const backgroundColor = style.backgroundColor
      // Check if the background color is green (in RGB format)
      return backgroundColor === 'rgb(0, 128, 0)' || backgroundColor === '#008000'
    })

    // Click on the connection to expand it
    await page.getByTestId('connection-upload-test').click()

    // Upload CSV file via drag and drop
    const fileBuffer = fs.readFileSync(csvFilePath)

    // Trigger the drop event on the component
    await page.evaluate(
      async (csvData) => {
        // Create a File object
        const csvFile = new File([new Uint8Array(csvData)], 'sample-users.csv', {
          type: 'text/csv',
        })
        // Create a DataTransfer
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(csvFile)
        // Create and dispatch the drop event
        const dropEvent = new DragEvent('drop', {
          dataTransfer,
          bubbles: true,
          cancelable: true,
        })
        // Get the drop target and dispatch event
        const dropTarget = document.querySelector('.file-upload-container')
        if (!dropTarget) {
          throw new Error('Drop target not found')
        }
        dropTarget.dispatchEvent(dropEvent)
      },
      [...new Uint8Array(fileBuffer)],
    )

    // Wait for the processing to complete - loading indicator should disappear
    await page.waitForSelector('.loading-container', { state: 'detached' })

    // Check for success message
    await expect(page.locator('.success-message')).toContainText('sample_users')

    // expand the connection
    await page.getByTestId('database-upload-test-memory').click()
    // Wait for the table to appear in the connection tree
    await page.getByTestId('schema-upload-test-main').click()
    // The table should appear under the expanded database
    await page.waitForSelector('[data-testid="create-datasource-sample_users"]', { timeout: 10000 })

    // Click the orange database icon to create datasource from the uploaded table
    await page.getByTestId('create-datasource-sample_users').click()

    // Wait for the datasource creation modal to appear
    await page.waitForSelector('[data-testid="datasource-creation-modal"]', { timeout: 5000 })

    // Verify modal title contains the table name
    await expect(page.getByTestId('modal-title')).toContainText('Create Datasource from sample_users')

    // Verify that columns are displayed in the modal
    await expect(page.getByTestId('column-config-id')).toBeVisible()
    await expect(page.getByTestId('column-config-name')).toBeVisible()
    await expect(page.getByTestId('column-config-age')).toBeVisible()
    await expect(page.getByTestId('column-config-joined_date')).toBeVisible()
    await expect(page.getByTestId('column-config-is_active')).toBeVisible()

    // Select 'id' as a grain key (primary key)
    await page.getByTestId('grain-key-checkbox-id').check()

    // Add descriptions to some fields
    await page.getByTestId('description-input-id').fill('Unique identifier for users')
    await page.getByTestId('description-input-name').fill('Full name of the user')
    await page.getByTestId('description-input-age').fill('Age in years')

    // Edit a column alias - click on the name field to edit it
    await page.getByTestId('edit-column-name-name').click()
    await page.getByTestId('column-name-input-name').fill('user_name')
    await page.keyboard.press('Enter')

    // Verify the datasource preview updates
    await expect(page.getByTestId('datasource-preview')).toContainText('key id')
    await expect(page.getByTestId('datasource-preview')).toContainText('key user_name')
    await expect(page.getByTestId('datasource-preview')).toContainText('name:user_name')

    // Verify sample data is loaded and displayed
    await expect(page.getByTestId('sample-data-table')).toBeVisible()
    await expect(page.getByTestId('sample-data-info')).toContainText('Showing')

    // Create the datasource
    await page.getByTestId('create-datasource-button').click()

    // Wait for modal to close
    await page.waitForSelector('[data-testid="datasource-creation-modal"]', { state: 'detached', timeout: 5000 })

    // Verify we're redirected to the editors screen  
    await expect(page.getByTestId('edit-editor-name')).toBeVisible()

    // Verify the new editor contains the generated datasource code
    await expect(page.getByTestId('editor')).toContainText('datasource sample_users')
    await expect(page.getByTestId('editor')).toContainText('key id')
    await expect(page.getByTestId('editor')).toContainText('grain (id, user_name)')

  })


})