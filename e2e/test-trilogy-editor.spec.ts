import { test, expect } from '@playwright/test'

const connectionName = 'duckdb-test2'

test('test', async ({ page, isMobile }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/')
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-connections').click()
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').click()
  await page.getByTestId('connection-creator-name').fill(connectionName)
  await page.getByTestId('connection-creator-submit').click()
  await page.getByTestId('refresh-connection-duckdb-test2').click()
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="status-icon-duckdb-test2"]')
    if (!element) return false

    const style = window.getComputedStyle(element)
    const backgroundColor = style.backgroundColor
    console.log(backgroundColor)

    // Check if the background color is green (in RGB format)
    return backgroundColor === 'rgb(0, 128, 0)' || backgroundColor === '#008000'
  })

  await page.getByTestId('sidebar-link-editors').click()

  // Create first editor (regular name)
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').click()
  await page.getByTestId('editor-creator-name').fill('test-one')
  await page.getByTestId('editor-creator-type').selectOption('preql')
  await page.getByTestId('editor-creator-connection-select').selectOption(connectionName)
  await page.getByTestId('editor-creator-submit').click()

  // Switch to test-one editor and add content
  await page.getByTestId('editor-list-id-e-local-duckdb-test2-test-one').click()
  const editor = page.getByTestId('editor')
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')

  const testOneContent = `
auto x <- [1,2,3,4,5];

select unnest(x) as rows;
`

  await page.keyboard.type(testOneContent)

  await page.getByTestId('editor-run-button').click()

  await expect(page.getByTestId('query-results-length')).toContainText('5')
})
