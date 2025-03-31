import { test, expect } from '@playwright/test'

test('test', async ({ page }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/')
  await page.getByRole('button', { name: 'Docs and Tutorial' }).click()
  await page.getByRole('textbox', { name: 'Search by model name...' }).click()
  await page.getByRole('textbox', { name: 'Search by model name...' }).fill('demo-model')
  await page.getByRole('button', { name: 'Import' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.getByRole('button', { name: '󱘖' }).click()

  // Make sure the connection is active
  await page.getByTestId('refresh-connection-demo-model-connection').click()
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="status-icon-demo-model-connection"]')
    if (!element) return false

    const style = window.getComputedStyle(element)
    const backgroundColor = style.backgroundColor
    console.log(backgroundColor)

    // Check if the background color is green (in RGB format)
    return backgroundColor === 'rgb(0, 128, 0)' || backgroundColor === '#008000'
  })


  //
  await page.getByTestId('editor-creator-add-tutorial').click()
  await page.getByTestId('editor-creator-name-tutorial').click()
  await page.getByTestId('editor-creator-name-tutorial').fill('my-first-editor')
  await page
    .getByTestId('editor-creator-connection-select-tutorial')
    .selectOption('demo-model-connection')
  await page.getByTestId('editor-creator-submit-tutorial').click()
  await expect(page.getByTestId('model-validator')).toContainText(
    `Great work: "demo-model" found ✓`,
  )
  await expect(page.getByTestId('demo-connection-validator')).toContainText(
    `Great work: "demo-model-connection" found and connected with right model ✓`,
  )
  await expect(page.getByTestId('editor-validator')).toContainText(
    `Great work: "my-first-editor" found and connected with right model ✓`,
  )
  await page.getByTestId('editor').click()
  await page.waitForTimeout(500)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  // 3. Delete the selected content
  await page.waitForTimeout(500)
  await page.keyboard.press('Delete')
  // 4. Type or paste new content
  const newContent = `import lineitem as lineitem;
SELECT
    sum(lineitem.extended_price)->sales,
    lineitem.supplier.nation.name,
order by
    sales desc;`
  await page.keyboard.type(newContent)
  await page.getByTestId('editor-run-button').click()
  // Wait for text to change to "Cancel", indicating query execution started.
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Cancel")')
  // Wait for text to change back to "Run", indicating query execution finished.
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")')

  await expect(page.getByTestId('results-tab-button')).toContainText(`Results (25)`)
})
