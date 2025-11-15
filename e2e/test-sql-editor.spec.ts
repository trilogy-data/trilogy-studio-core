import { test, expect } from '@playwright/test'

test('test', async ({ page, isMobile }) => {
  await page.goto('#skipTips=true')
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-connections').click()
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').click()
  await page.getByTestId('connection-creator-name').fill('duckdb-test')
  await page.getByTestId('connection-creator-submit').click()
  await page.getByTestId('refresh-connection-duckdb-test').click()
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="status-icon-duckdb-test"]')
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
  await page.getByTestId('editor-creator-type').selectOption('sql')
  await page.getByTestId('editor-creator-connection-select').selectOption('duckdb-test')
  await page.getByTestId('editor-creator-submit').click()

  // Create second editor with folder structure
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').click()
  await page.getByTestId('editor-creator-name').fill('analysis/reports/sales-report')
  await page.getByTestId('editor-creator-type').selectOption('sql')
  await page.getByTestId('editor-creator-connection-select').selectOption('duckdb-test')
  await page.getByTestId('editor-creator-submit').click()

  // Create third editor in same folder structure
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').click()
  await page.getByTestId('editor-creator-name').fill('analysis/data/customer-data')
  await page.getByTestId('editor-creator-type').selectOption('sql')
  await page.getByTestId('editor-creator-connection-select').selectOption('duckdb-test')
  await page.getByTestId('editor-creator-submit').click()

  // Verify folder structure is created
  // Check that analysis folder exists
  const analysisFolder = page.getByTestId('editor-f-local-duckdb-test-analysis')
  await expect(analysisFolder).toBeVisible()

  // Check that reports folder exists (should be collapsed initially)
  // pause for debugging 10 seconds
  // we do not need to expand it, because newly created editors are always expanded
  // await analysisFolder.click() // Expand analysis folder

  const reportsFolder = page.getByTestId('editor-f-local-duckdb-test-analysis/reports')
  await expect(reportsFolder).toBeVisible()

  // Check that data folder exists
  const dataFolder = page.getByTestId('editor-f-local-duckdb-test-analysis/data')
  await expect(dataFolder).toBeVisible()

  // Expand reports folder and verify sales-report editor is there
  // await reportsFolder.click()
  // we do not need to expand it, because newly created editors are always expanded
  //editor-list-id-e-local-duckdb-test-analysis/reports/sales-report
  const salesReportEditor = page.getByTestId(
    'editor-e-local-duckdb-test-analysis/reports/sales-report',
  )
  await expect(salesReportEditor).toBeVisible()

  // Expand data folder and verify customer-data editor is there
  // we do not need to expand it, because newly created editors are always expanded
  // await dataFolder.click()
  const customerDataEditor = page.getByTestId(
    'editor-e-local-duckdb-test-analysis/data/customer-data',
  )
  await expect(customerDataEditor).toBeVisible()

  // ==== SCROLL POSITION TESTING START ====

  // Test clicking on the sales-report editor and add content to make it scrollable
  await salesReportEditor.click()

  // Clear existing content and add multi-line SQL to enable scrolling
  const editor = page.getByTestId('editor')
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')

  // Add enough SQL content to make the editor scrollable
  const longSqlContent = `-- Sales Report Query
-- This is a long query to test scroll position
SELECT 1;

-- Line 5
-- Line 6
-- Line 7
-- Line 8
-- Line 9
-- Line 10
-- Line 11
-- Line 12
-- Line 13
-- Line 14
-- Line 15
-- Line 16
-- Line 17
-- Line 18
-- Line 19
-- Line 20
-- Line 21
-- Line 22
-- Line 23
-- Line 24
-- Line 25
-- Line 26
-- Line 27
-- Line 28
-- Line 29
-- Line 30
-- Line 31
-- Line 32
-- Line 33
-- Line 34
-- Line 35
-- Line 36
-- Line 37
-- Line 38
-- Line 39
-- Line 40
-- Line 41
-- Line 42
-- Line 43
-- Line 44
-- Line 45
-- Line 46
-- Line 47
-- Line 48
-- Line 49
-- Line 50`

  await page.keyboard.type(longSqlContent)

  // Scroll down in sales-report editor using Monaco's API
  const salesReportScrollPosition = await page.evaluate(() => {
    const monaco = (window as any).monaco
    if (monaco) {
      const editor = monaco.editor.getModels()[0]?._associatedEditor
      if (editor) {
        editor.setScrollTop(500)
        return editor.getScrollTop()
      }
    }
    return 0
  })

  // Wait a bit for the scroll position to be saved
  await page.waitForTimeout(150)
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
    // await page.getByTestId('editor-e-local-duckdb-test-analysis/data').click()
  }

  // Switch to customer-data editor and add different content
  await customerDataEditor.click()
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')

  const customerDataContent = `-- Customer Data Query
SELECT 1;
-- Customer Line 3
-- Customer Line 4
-- Customer Line 5
-- Customer Line 6
-- Customer Line 7
-- Customer Line 8
-- Customer Line 9
-- Customer Line 10
-- Customer Line 11
-- Customer Line 12
-- Customer Line 13
-- Customer Line 14
-- Customer Line 15
-- Customer Line 16
-- Customer Line 17
-- Customer Line 18
-- Customer Line 19
-- Customer Line 20
-- Customer Line 21
-- Customer Line 22
-- Customer Line 23
-- Customer Line 24
-- Customer Line 25
-- Customer Line 26
-- Customer Line 27
-- Customer Line 28
-- Customer Line 29
-- Customer Line 30
-- Customer Line 31
-- Customer Line 32
-- Customer Line 33
-- Customer Line 34
-- Customer Line 35
-- Customer Line 36
-- Customer Line 37
-- Customer Line 38
-- Customer Line 39
-- Customer Line 40`

  await page.keyboard.type(customerDataContent)

  // Scroll to a different position in customer-data editor
  const customerDataScrollPosition = await page.evaluate(() => {
    const monaco = (window as any).monaco
    if (monaco) {
      const editor = monaco.editor.getModels()[0]?._associatedEditor
      if (editor) {
        editor.setScrollTop(300)
        return editor.getScrollTop()
      }
    }
    return 0
  })

  await page.waitForTimeout(150)
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }

  // Switch to test-one editor and add content
  await page.getByTestId('editor-e-local-duckdb-test-test-one').click()
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')

  const testOneContent = `-- Test One Query
SELECT 1;
-- Test Line 3
-- Test Line 4
-- Test Line 5
-- Test Line 6
-- Test Line 7
-- Test Line 8
-- Test Line 9
-- Test Line 10
-- Test Line 11
-- Test Line 12
-- Test Line 13
-- Test Line 14
-- Test Line 15
-- Test Line 16
-- Test Line 17
-- Test Line 18
-- Test Line 19
-- Test Line 20
-- Test Line 21
-- Test Line 22
-- Test Line 23
-- Test Line 24
-- Test Line 25
-- Test Line 26
-- Test Line 27
-- Test Line 28
-- Test Line 29
-- Test Line 30`

  await page.keyboard.type(testOneContent)

  // Scroll to a position in test-one editor
  const testOneScrollPosition = await page.evaluate(() => {
    const monaco = (window as any).monaco
    if (monaco) {
      const editor = monaco.editor.getModels()[0]?._associatedEditor
      if (editor) {
        editor.setScrollTop(150)
        return editor.getScrollTop()
      }
    }
    return 0
  })

  await page.waitForTimeout(150)

  // Now switch back to sales-report and verify scroll position is preserved
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
    // await page.getByTestId('editor-f-local-duckdb-test-analysis').click()
    // await page.getByTestId('editor-f-local-duckdb-test-analysis/reports').click()
  }

  await salesReportEditor.click()
  await page.waitForTimeout(300) // Wait for editor to load

  const restoredSalesReportScroll = await page.evaluate(() => {
    const monaco = (window as any).monaco
    if (monaco) {
      const editor = monaco.editor.getModels()[0]?._associatedEditor
      if (editor) {
        return editor.getScrollTop()
      }
    }
    return 0
  })

  // Verify the scroll position is close to what we set (allowing for small differences)
  expect(Math.abs(restoredSalesReportScroll - salesReportScrollPosition)).toBeLessThan(50)

  // Switch back to customer-data and verify its scroll position
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
    // await page.getByTestId('editor-f-local-duckdb-test-analysis').click()
    // await page.getByTestId('editor-f-local-duckdb-test-analysis/data').click()
  }

  await customerDataEditor.click()
  await page.waitForTimeout(300)

  const restoredCustomerDataScroll = await page.evaluate(() => {
    const monaco = (window as any).monaco
    if (monaco) {
      const editor = monaco.editor.getModels()[0]?._associatedEditor
      if (editor) {
        return editor.getScrollTop()
      }
    }
    return 0
  })

  expect(Math.abs(restoredCustomerDataScroll - customerDataScrollPosition)).toBeLessThan(50)

  // Switch back to test-one and verify its scroll position
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }

  await page.getByTestId('editor-e-local-duckdb-test-test-one').click()
  await page.waitForTimeout(300)

  const restoredTestOneScroll = await page.evaluate(() => {
    const monaco = (window as any).monaco
    if (monaco) {
      const editor = monaco.editor.getModels()[0]?._associatedEditor
      if (editor) {
        return editor.getScrollTop()
      }
    }
    return 0
  })

  expect(Math.abs(restoredTestOneScroll - testOneScrollPosition)).toBeLessThan(50)

  // Test scroll persistence across page reload
  // First, set a specific scroll position in the current editor (test-one)
  const scrollBeforeReload = await page.evaluate(() => {
    const monaco = (window as any).monaco
    if (monaco) {
      const editor = monaco.editor.getModels()[0]?._associatedEditor
      if (editor) {
        editor.setScrollTop(200)
        return editor.getScrollTop()
      }
    }
    return 0
  })

  await page.waitForTimeout(160) // Wait for scroll position to be saved

  // Reload the page
  await page.reload()

  // Navigate back to the editors
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-editors').click()

  // Click on test-one editor
  await page.getByTestId('editor-e-local-duckdb-test-test-one').click()
  await page.waitForTimeout(500) // Wait for editor to fully load

  // Verify scroll position is restored after reload
  const scrollAfterReload = await page.evaluate(() => {
    const monaco = (window as any).monaco
    if (monaco) {
      const editor = monaco.editor.getModels()[0]?._associatedEditor
      if (editor) {
        return editor.getScrollTop()
      }
    }
    return 0
  })

  expect(Math.abs(scrollAfterReload - scrollBeforeReload)).toBeLessThan(50)

  // ==== SCROLL POSITION TESTING END ====

  // Continue with the rest of the original test...
  // Run the query to verify it works
  await page.getByTestId('editor-run-button').click()
  // we need to wait again, as we reloaded the page
  await page.waitForTimeout(5000)
  await expect(page.getByTestId('query-results-length')).toContainText('1')

  // Test folder collapse/expand functionality
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }

  await analysisFolder.click() // Expand analysis folder again
  await expect(reportsFolder).toBeVisible()
  await expect(dataFolder).toBeVisible()

  // check for errors
  if (isMobile) {
    await page.getByTestId('editor-e-local-duckdb-test-test-one').click()
    await page.getByTestId('editor-tab').click()
  }
  await page.getByTestId('editor').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  const newContent = `import lineitem as lineitem;
SELECT
    sum(lineitem.extended_price)->sales,
    lineitem.supplier.nation.name,
order by
    sales desc;`
  await page.keyboard.type(newContent)
  await page.getByTestId('editor-run-button').click()
  await expect(page.getByTestId('error-text')).toContainText(
    'Parser Error: syntax error at or near "lineitem" LINE 1: import lineitem',
  )

  // Delete editors and verify folder structure updates
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }

  await page.getByTestId('editor-f-local-duckdb-test-analysis/reports').click()
  await page.getByTestId('editor-f-local-duckdb-test-analysis/data').click()

  await page.getByTestId('delete-editor-sales-report').click()
  await page.getByTestId('confirm-editor-deletion').click()

  // if (isMobile) {
  //   await page.getByTestId('editor-list-id-e-local-duckdb-test-analysis/reports/sales-report').click()
  // }

  // Delete the customer-data editor

  await page.getByTestId('delete-editor-customer-data').click()
  await page.getByTestId('confirm-editor-deletion').click()

  // Delete the regular editor
  await page.getByTestId('delete-editor-test-one').click()
  await page.getByTestId('confirm-editor-deletion').click()

  await page.getByTestId('trilogy-icon').click()
  await page.waitForTimeout(1200) // 1000ms animation + 200ms buffer

  await page.reload()

  // Confirm all editors are deleted
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }

  const testOneCount = await page.getByTestId('editor-e-local-duckdb-test-test-one').count()
  expect(testOneCount).toBe(0)

  const salesReportCount = await page.getByTestId('editor-e-local-duckdb-test-sales-report').count()
  expect(salesReportCount).toBe(0)

  const customerDataCount = await page
    .getByTestId('editor-e-local-duckdb-test-customer-data')
    .count()
  expect(customerDataCount).toBe(0)

  // Verify folders are also cleaned up when empty
  const analysisFolderCount = await page.getByTestId('editor-f-local-duckdb-test-analysis').count()
  expect(analysisFolderCount).toBe(0)

  // now let's look at the connection history
  await page.getByTestId('sidebar-link-connections').click()
  await page.getByTestId('connection-duckdb-test').click()

  await page.waitForSelector('.query-history')

  // Ensure we're not seeing the loading or empty states
  const loadingElement = page.locator('.query-history-loading')
  const emptyElement = page.locator('.query-history-empty')
  const errorElement = page.locator('.query-history-error')

  await expect(loadingElement).not.toBeVisible()
  await expect(emptyElement).not.toBeVisible()
  await expect(errorElement).not.toBeVisible()

  // Check that the history list is visible
  const historyList = page.locator('.query-history-list')
  await expect(historyList).toBeVisible()

  // Verify that at least one history item is displayed
  const historyItems = page.locator('.query-history-item')
  const historyCount = await historyItems.count()
  expect(historyCount).toBeGreaterThan(0)

  // Optionally, check for specific content in the first history item
  const firstItemPreview = page.locator('.query-history-item-preview').first()
  await expect(firstItemPreview).toBeVisible()
  await expect(firstItemPreview).not.toHaveText('')

  // You can also test the expand functionality
  const firstItemHeader = page.locator('.query-history-item-header').first()
  await firstItemHeader.click()

  // After clicking, the details should be visible
  const firstItemDetails = page.locator('.query-history-item-details').first()
  await expect(firstItemDetails).toBeVisible()
})
