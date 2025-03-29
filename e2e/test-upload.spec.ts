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

test.describe('CSV Upload Component', () => {
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
  test('should upload and process CSV file using drag and drop', async ({ page, isMobile }) => {
    await page.goto('http://localhost:5173/trilogy-studio-core/')
    if (isMobile) {
      await page.getByTestId('mobile-menu-toggle').click()
    }
    await page.getByTestId('sidebar-icon-connections').locator('i').click()
    await page.getByTestId('connection-creator-add').click()
    await page.getByTestId('connection-creator-name').click()
    await page.getByTestId('connection-creator-name').fill('upload-test')
    await page.getByTestId('connection-creator-submit').click()
    await page.getByTestId('refresh-connection-upload-test').click()
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="status-icon-upload-test"]')
      if (!element) return false

      const style = window.getComputedStyle(element)
      const backgroundColor = style.backgroundColor
      console.log(backgroundColor)

      // Check if the background color is green (in RGB format)
      return backgroundColor === 'rgb(0, 128, 0)' || backgroundColor === '#008000'
    })
    await page.getByTestId('connection-upload-test').click()
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
        const dropTarget = document.querySelector('.csv-upload-container')
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
  })
})
