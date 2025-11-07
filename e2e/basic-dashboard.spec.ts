import { test, expect } from '@playwright/test'

// use this if debug menus is on
// const vegaSelector = '.vega-container .chart-wrapper canvas'
const vegaSelector = '.vega-active canvas'

async function getRelativePixelColor(page, relX, relY) {
  // these cannot use vegaSelector constant as evaluated in the browser context
  const canvasBounds = await page.locator('.vega-active canvas').boundingBox()
  if (!canvasBounds) {
    throw new Error('Could not get canvas bounds')
  }

  // Convert relative coordinates to absolute pixel positions
  const x = Math.round(canvasBounds.width * relX)
  const y = Math.round(canvasBounds.height * relY)

  return getPixelColor(page, x, y)
}

async function getPixelColor(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      // these cannot use vegaSelector constant as evaluated in the browser context
      const canvas = document.querySelector('.vega-active canvas') as HTMLCanvasElement
      if (!canvas) return null

      // Get the canvas's CSS dimensions (how it appears on screen)
      const displayRect = canvas.getBoundingClientRect()

      // Get the canvas's actual dimensions (its internal coordinate system)
      const width = canvas.width
      const height = canvas.height

      // Calculate the scale ratio between display size and actual size
      const scaleX = width / displayRect.width
      const scaleY = height / displayRect.height

      // Convert the coordinates from parent CSS space to canvas internal space
      const canvasX = Math.round(x * scaleX)
      const canvasY = Math.round(y * scaleY)

      // Now use the converted coordinates
      const context = canvas.getContext('2d')
      if (!context) return null
      const pixelData = context.getImageData(canvasX, canvasY, 1, 1).data

      return {
        r: pixelData[0],
        g: pixelData[1],
        b: pixelData[2],
        a: pixelData[3],
        hex: `#${pixelData[0].toString(16).padStart(2, '0')}${pixelData[1].toString(16).padStart(2, '0')}${pixelData[2].toString(16).padStart(2, '0')}`,
      }
    },
    { x, y },
  )
}

test('test-create-dashboard-and-pixels', async ({ browser, page, isMobile }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/#skipTips=true')
  // setup
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }

  await page.getByTestId('sidebar-link-community-models').click({ force: true })
  // await page.getByTestId('trilogy-data-trilogy-public-models-main').click({ force: true })
  // await page.getByTestId('community-model-search').click()
  // await page.getByTestId('community-model-search').press('ControlOrMeta+a')
  // await page.getByTestId('community-model-search').fill('faa')
  await page.getByTestId('community-trilogy-data-trilogy-public-models-main+duckdb+faa').click()
  await page.getByTestId('import-faa').click()
  await page.getByTestId('model-creation-submit').click()
  await page.getByTestId('imported-faa')

  // dashboard
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-dashboard').click()
  await page.getByTestId('dashboard-creator-add').click({ force: true })
  await page.getByTestId('dashboard-creator-name').click()
  await page.getByTestId('dashboard-creator-name').fill('faa-test')
  await page.getByTestId('dashboard-creator-connection').selectOption('faa-connection')
  await page.getByTestId('dashboard-creator-import').selectOption('flight')
  await page.getByTestId('dashboard-creator-submit').click()

  //check if the faa-test object eixsts
  if (!isMobile) {
    const elementExists = await page.isVisible('[data-testid="dashboard-d-faa-test"]')
    if (!elementExists) {
      await page.getByTestId('dashboard-s-local').click()
      await page.getByTestId('dashboard-c-local-faa-connection').click()
    }

    await page.getByTestId('dashboard-d-faa-test').click()
  }

  // set up the source
  // await page.getByTestId('dashboard-import-selector').click()
  // await page.getByTestId('set-dashboard-source-flight').locator('div').first().click()
  // if (isMobile) {
  //   await page.getByTestId('close-model-selector').click()
  // }

  // Test the dashboard template functionality
  // Check if quickstart section is visible
  await expect(page.getByText('An Empty Dashboard')).toBeVisible()

  // Add description for the dashboard
  await page.getByPlaceholder('What is this dashboard for?').fill('FAA Flight Dashboard Analysis')
  await page.getByTestId('dashboard-description-save').click()

  // Test template selection
  await page.getByTestId('template-card-summary').click()

  // Verify template components were created (should check for expected number of components)
  await expect(page.getByTestId('dashboard-component-0')).toBeVisible()
  await expect(page.getByTestId('dashboard-component-1')).toBeVisible()
  await expect(page.getByTestId('dashboard-component-2')).toBeVisible()
  await expect(page.getByTestId('dashboard-component-3')).toBeVisible()
  await expect(page.getByTestId('dashboard-component-4')).toBeVisible()
  await expect(page.getByTestId('dashboard-component-5')).toBeVisible()

  //reset it to simplify next test
  await page.getByTestId('clear-items-button').click()

  // Add a custom item to the dashboard

  await page.getByTestId('add-item-button').click()
  await page.getByTestId('dashboard-add-item-confirm').click()
  await page.getByTestId('edit-dashboard-item-content-0').click()

  // set content
  await page.getByTestId('simple-editor-content').click()
  if (browser.browserType().name() === 'webkit') {
    await page.getByTestId('simple-editor-content').click({ clickCount: 3 })
  } else {
    await page.getByTestId('simple-editor-content').press('ControlOrMeta+a')
  }

  await page.keyboard.type('select\n    origin.state,\n    count,\norder by count desc;')
  await page.getByTestId('editor-run-button').click()
  await page.getByTestId('simple-editor-results')

  // save it
  await page.getByTestId('save-dashboard-chart').click()

  // toggle it
  await page.getByTestId('vega-chart-container-2').waitFor({ state: 'visible', timeout: 45000 })
  // await page.getByTestId('vega-chart-container-2').click();
  await page.getByTestId('vega-chart-container-2').hover({ force: true })
  await page.waitForTimeout(500) // wait for the controls to appear
  await page.getByTestId('toggle-chart-controls-btn').click({ force: true })
  await page.getByTestId('chart-type-usa-map').click()

  await page.getByLabel('Geo Field').selectOption('origin_state')
  await page.getByLabel('Color Scale').selectOption('count')

  await page.getByTestId('toggle-chart-controls-btn').click({ force: true })
  await page.waitForTimeout(1000)
  await page.getByTestId('vega-chart-container-2').waitFor({ state: 'visible', timeout: 45000 })

  // Get canvas dimensions
  const canvas = await page.locator(vegaSelector)
  const canvasBounds = await canvas.boundingBox()
  if (!canvasBounds) {
    throw new Error('Could not get canvas bounds')
  }

  // Create a grid of points to sample (5x5 grid)
  const gridSize = 10
  interface PixelColor {
    relX: number
    relY: number
    x: number
    y: number
    color: string
  }
  const results = [] as PixelColor[]

  for (let xStep = 0; xStep < gridSize; xStep++) {
    for (let yStep = 0; yStep < gridSize; yStep++) {
      // Calculate relative position
      const relX = xStep / (gridSize - 1)
      const relY = yStep / (gridSize - 1)

      // Get color at this point
      const color = await getRelativePixelColor(page, relX, relY)

      results.push({
        relX,
        relY,
        x: Math.round(canvasBounds.x + canvasBounds.width * relX),
        y: Math.round(canvasBounds.y + canvasBounds.height * relY),
        color: color.hex,
      })
    }
  }

  // Output results in a format easy to visualize
  console.table(results)

  // Helper function to round values to the nearest 0.5
  const roundToHalf = (value: number): number => {
    return Math.round(value * 2) / 2
  }

  // Define points to check relative to the canvas
  // These are relative coordinates (x%, y%) within the canvas
  const nonWhite = [
    '#86d0bb',
    '#225aa5',
    '#c7e9b5',
    '#472d7b',
    '#450356',
    '#433e85',
    '#471063',
    '#481a6c',
    ' #481668',
  ]

  // Create expanded check points with the main values rounded to nearest 0.5
  // and additional checks at ±0.1 from the rounded value
  const createCheckPoints = (
    baseX: number,
    baseY: number,
  ): Array<{ relX: number; relY: number; expectedColors: string[] }> => {
    const roundedX = roundToHalf(baseX)
    const roundedY = roundToHalf(baseY)

    return [
      // Main point (rounded to nearest 0.5)
      {
        relX: roundedX,
        relY: roundedY,
        expectedColors: nonWhite,
      },
      // Additional check points at x±0.1
      {
        relX: roundedX - 0.1,
        relY: roundedY,
        expectedColors: nonWhite,
      },
      {
        relX: roundedX + 0.1,
        relY: roundedY,
        expectedColors: nonWhite,
      },
      // Additional check points at y±0.1
      {
        relX: roundedX,
        relY: roundedY - 0.1,
        expectedColors: nonWhite,
      },
      {
        relX: roundedX,
        relY: roundedY + 0.1,
        expectedColors: nonWhite,
      },
    ]
  }

  // Original check points
  const texasCheckBase = {
    relX: 0.4,
    relY: 0.5,
  }

  const texasCheck2Base = {
    relX: 0.5,
    relY: 0.5,
  }

  const texasCheck3Base = {
    relX: 0.6,
    relY: 0.5,
  }

  // Generate all check points including the 0.4 and 0.6 variations
  const texasCheckPoints = [
    ...createCheckPoints(texasCheckBase.relX, texasCheckBase.relY),
    ...createCheckPoints(texasCheck2Base.relX, texasCheck2Base.relY),
    ...createCheckPoints(texasCheck3Base.relX, texasCheck3Base.relY),
  ]

  // Log the generated check points for debugging
  console.log(
    'Generated check points:',
    texasCheckPoints.map((p) => `(${p.relX}, ${p.relY})`).join(', '),
  )

  let atLeastOneMatch = false

  // Check each point
  for (const point of texasCheckPoints) {
    // Convert relative coordinates to absolute pixel positions
    console.log(
      `Checking pixel at relative position (${point.relX.toFixed(2)}, ${point.relY.toFixed(2)})`,
    )

    try {
      // Get the pixel color at the calculated position
      const color = await getRelativePixelColor(page, point.relX, point.relY)
      console.log(
        `Pixel at relative (${point.relX.toFixed(2)}, ${point.relY.toFixed(2)}): ${color.hex}`,
      )

      // If the color is in the expected colors list, set the flag to true
      if (point.expectedColors.includes(color.hex)) {
        console.log(
          `✓ Found matching color ${color.hex} at position (${point.relX.toFixed(2)}, ${point.relY.toFixed(2)})`,
        )
        atLeastOneMatch = true
        break // We can exit the loop early once we find a match
      }
    } catch (error) {
      console.error(
        `Error checking pixel at (${point.relX.toFixed(2)}, ${point.relY.toFixed(2)}):`,
        error,
      )
      // Continue with other points even if one fails
    }
  }
  console.log(
    `Final match result: ${atLeastOneMatch ? 'Found at least one matching pixel' : 'No matching pixels found'}`,
  )
  if (!atLeastOneMatch) {
    throw new Error('No pixels matched expected non-white colors in rendered map')
  }

  await page.getByTestId('add-item-button').click()
  await page.getByTestId('dashboard-add-item-type-table').check()
  await page.getByTestId('dashboard-add-item-confirm').click()
  await page.getByTestId('edit-dashboard-item-content-1').click()

  // set content
  await page.getByTestId('simple-editor-content').click()
  if (browser.browserType().name() === 'webkit') {
    await page.getByTestId('simple-editor-content').click({ clickCount: 3 })
  } else {
    await page.getByTestId('simple-editor-content').press('ControlOrMeta+a')
  }

  await page.keyboard.type('select\n    origin.state,\n    count,\norder by count desc;')
  await page.getByTestId('editor-run-button').click()
  await page.getByTestId('simple-editor-results')

  // save it
  await page.getByTestId('save-dashboard-chart').click()

  // TODO: click the pixel we found above, and verify the resulting table is filtered to only one state

  // Find the first matching point from our successful checks
  let clickPoint = null as { relX: number; relY: number; expectedColors: string[] } | null
  for (const point of texasCheckPoints) {
    try {
      const color = await getRelativePixelColor(page, point.relX, point.relY)
      if (point.expectedColors.includes(color.hex)) {
        clickPoint = point
        console.log(
          `Will click on matching point at (${point.relX.toFixed(2)}, ${point.relY.toFixed(2)}) with color ${color.hex}`,
        )
        break
      }
    } catch (error) {
      console.error(`Error checking pixel for click point:`, error)
      continue
    }
  }

  if (!clickPoint) {
    throw new Error('No valid click point found - cannot proceed with cross-filtering test')
  }

  // Click on the map at the identified point
  const canvasElement = page.locator(vegaSelector)
  const bounds = await canvasElement.boundingBox()
  if (!bounds) {
    throw new Error('Could not get canvas bounds for clicking')
  }

  // Convert relative coordinates to absolute screen coordinates
  const clickX = bounds.x + bounds.width * clickPoint.relX
  const clickY = bounds.y + bounds.height * clickPoint.relY

  console.log(`Clicking map at screen coordinates (${Math.round(clickX)}, ${Math.round(clickY)})`)
  await page.mouse.click(clickX, clickY)

  // Wait for the cross-filtering to take effect
  await page.waitForTimeout(1000)

  // Alternative selector in case xpath doesn't work in all browsers
  const tableContainerAlt = page.locator('[data-testid="simple-editor-results"]').nth(1)

  // Try to find the table rows - looking for the actual data rows
  let tableRows

  try {
    // Fallback to alternative selector
    await expect(tableContainerAlt).toBeVisible({ timeout: 5000 })
    tableRows = tableContainerAlt
      .locator('table tbody tr, .table-row, tr')
      .filter({ hasNotText: /^\s*$/ })
    console.log('Using alternative selector for table')
  } catch {
    // Final fallback - look for any table in the dashboard
    tableRows = page.locator('table tbody tr, .table-row').filter({ hasNotText: /^\s*$/ })
    console.log('Using general table selector')
  }

  // Count the visible rows (excluding header rows)
  const rowCount = await tableRows.count()
  console.log(`Found ${rowCount} rows in the filtered table`)

  // Verify that the table now shows only one row (the filtered state)
  expect(rowCount).toBe(2)

  // Optional: Verify that the single row contains data (not empty)
  if (rowCount === 2) {
    const rowText = await tableRows.first().textContent()
    expect(rowText).toBeTruthy()
    expect(rowText.trim()).not.toBe('')
    console.log(`Filtered table row contains: ${rowText}`)
  }

  console.log('✓ Cross-filtering test passed: Map click successfully filtered table to one row')
})

// // Add a specific test for testing the AI assistance feature
// test('test-ai-assisted-dashboard-creation', async ({ page, isMobile }) => {
//   await page.goto('http://localhost:5173/trilogy-studio-core/')

//   // Setup dashboard
//   if (isMobile) {
//     await page.getByTestId('mobile-menu-toggle').click()
//   }
//   await page.getByTestId('sidebar-link-dashboard').click()
//   if (isMobile) {
//     await page.getByTestId('dashboard-creator-add').click()
//   }
//   await page.getByTestId('dashboard-creator-name').click()
//   await page.getByTestId('dashboard-creator-name').fill('ai-generated-dashboard')
//   await page.getByTestId('dashboard-creator-submit').click()
//   await page.getByText('ai-generated-dashboard').click()

//   // Set up the source
//   await page.getByTestId('dashboard-import-selector').click()
//   await page.getByTestId('set-dashboard-source-flight').locator('div').first().click()
//   if (isMobile) {
//     await page.getByTestId('close-model-selector').click()
//   }

//   // Add description for the AI to use
//   await page.getByPlaceholder('What is this dashboard for?').fill('Create a dashboard showing flight delays by state and carrier')
//   await page.getByTestId('dashboard-description-save').click()

//   // Check if AI assistance section is visible and click the generate button
//   await expect(page.getByTestId('llm-generate-button')).toBeVisible()
//   await page.getByTestId('llm-generate-button').click()

//   // Verify AI generated components appear
//   // This will depend on your AI implementation, but we can add expectations for common components
//   await expect(page.getByTestId('ai-generated-component')).toBeVisible({ timeout: 10000 })

//   // Check that the dashboard has the expected number of components
//   const componentCount = await page.getByTestId(/^dashboard-component-/).count()
//   expect(componentCount).toBeGreaterThan(3)
// })

const connectionName = 'duckdb-test2'

test('test-custom-editor-dashboard', async ({ page, isMobile }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/#skipTips=true')
  // Setup connection
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
    // Check if the background color is green (in RGB format)
    return backgroundColor === 'rgb(0, 128, 0)' || backgroundColor === '#008000'
  })

  // Create custom editor
  await page.getByTestId('sidebar-link-editors').click()
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').click()
  await page.getByTestId('editor-creator-name').fill('test_one')
  await page.getByTestId('editor-creator-type').selectOption('preql')
  await page.getByTestId('editor-creator-connection-select').selectOption(connectionName)
  await page.getByTestId('editor-creator-submit').click()

  // Switch to test_one editor and add content
  await page.getByTestId('editor-e-local-duckdb-test2-test_one').click()
  const editor = page.getByTestId('editor')
  await editor.click({ clickCount: 3 })
  // await page.keyboard.press('Control+A')
  // 3. Delete the selected content
  await page.keyboard.press('Delete')
  const testOneContent = `
auto x <- [1,2,3,4,5];

auto rows <- unnest(x);
select rows;
`
  await page.keyboard.type(testOneContent)
  await page.getByTestId('editor-run-button').click()
  await expect(page.getByTestId('query-results-length')).toContainText('5')

  // Navigate to dashboard creation
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-dashboard').click()

  // Create dashboard with custom editor as source
  await page.getByTestId('dashboard-creator-add').click()
  await page.getByTestId('dashboard-creator-name').fill('custom-editor-dashboard')
  await page.getByTestId('dashboard-creator-connection').selectOption(connectionName)
  await page.getByTestId('dashboard-creator-import').selectOption('test_one') // Use the custom editor as source
  await page.getByTestId('dashboard-creator-submit').click()

  // Navigate to the created dashboard
  if (!isMobile) {
    const elementExists = await page.isVisible(
      '[data-testid="dashboard-d-custom-editor-dashboard"]',
    )
    if (!elementExists) {
      await page.getByTestId('dashboard-s-local').click()
      await page.getByTestId(`dashboard-c-local-${connectionName}`).click()
    }
    await page.getByTestId('dashboard-c-local-duckdb-test2').click()
  }

  // Verify dashboard is using custom editor as source
  await expect(page.getByText('An Empty Dashboard')).toBeVisible()

  // Add description for the dashboard
  await page
    .getByPlaceholder('What is this dashboard for?')
    .fill('Dashboard using custom editor data source')
  await page.getByTestId('dashboard-description-save').click()

  // Add a custom item to the dashboard
  await page.getByTestId('add-item-button').click()
  await page.getByTestId('dashboard-add-item-confirm').click()
  await page.getByTestId('edit-dashboard-item-content-0').click()

  // Set content using the custom editor query
  await page.getByTestId('simple-editor-content').click()
  await page.getByTestId('simple-editor-content').press('ControlOrMeta+a')
  await page.keyboard.type('select rows;') // Reference the custom editor
  await page.getByTestId('editor-run-button').click()

  // Save the dashboard item
  await page.getByTestId('save-dashboard-chart').click()

  // Verify the chart container is visible
  await page.getByTestId('vega-chart-container-2').waitFor({ state: 'visible', timeout: 45000 })

  // Add a second dashboard item as a table
  await page.getByTestId('add-item-button').click()
  await page.getByTestId('dashboard-add-item-type-table').check()
  await page.getByTestId('dashboard-add-item-confirm').click()
  await page.getByTestId('edit-dashboard-item-content-1').click()

  // Set content for table
  await page.getByTestId('simple-editor-content').click()
  await page.getByTestId('simple-editor-content').press('ControlOrMeta+a')
  await page.keyboard.type('select rows;')

  // Save the table
  await page.getByTestId('save-dashboard-chart').click()

  // Verify both dashboard components are visible
  await expect(page.getByTestId('dashboard-component-0')).toBeVisible()
  await expect(page.getByTestId('dashboard-component-1')).toBeVisible()

  await page.getByRole('gridcell', { name: '2' }).click()
  console.log('✓ Custom editor dashboard creation test passed')
})

test('test-drilldown', async ({ page, isMobile }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/#skipTips=true')
  // Setup connection
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
    // Check if the background color is green (in RGB format)
    return backgroundColor === 'rgb(0, 128, 0)' || backgroundColor === '#008000'
  })

  // Create custom editor
  await page.getByTestId('sidebar-link-editors').click()
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').click()
  await page.getByTestId('editor-creator-name').fill('test_one')
  await page.getByTestId('editor-creator-type').selectOption('preql')
  await page.getByTestId('editor-creator-connection-select').selectOption(connectionName)
  await page.getByTestId('editor-creator-submit').click()

  // Switch to test_one editor and add content
  await page.getByTestId('editor-e-local-duckdb-test2-test_one').click()
  const editor = page.getByTestId('editor')
  await editor.click({ clickCount: 3 })
  // await page.keyboard.press('Control+A')
  // 3. Delete the selected content
  await page.keyboard.press('Delete')
  const testOneContent = `
auto x <- [1,2,3,4,5];

auto rows <- unnest(x);
auto alt_labels<- case when rows = 5 then 'massive' else 'small' end;
auto alt_labels_two <-case when rows >=3 then 'big' else 'tiny' end;
select rows;
`
  await page.keyboard.type(testOneContent)
  await page.getByTestId('editor-run-button').click()
  await expect(page.getByTestId('query-results-length')).toContainText('5')

  // Navigate to dashboard creation
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-dashboard').click()

  // Create dashboard with custom editor as source
  await page.getByTestId('dashboard-creator-add').click()
  await page.getByTestId('dashboard-creator-name').fill('custom-editor-dashboard')
  await page.getByTestId('dashboard-creator-connection').selectOption(connectionName)
  await page.getByTestId('dashboard-creator-import').selectOption('test_one') // Use the custom editor as source
  await page.getByTestId('dashboard-creator-submit').click()

  // Navigate to the created dashboard
  if (!isMobile) {
    const elementExists = await page.isVisible(
      '[data-testid="dashboard-d-custom-editor-dashboard"]',
    )
    if (!elementExists) {
      await page.getByTestId('dashboard-s-local').click()
      await page.getByTestId(`dashboard-c-local-${connectionName}`).click()
    }
    await page.getByTestId('dashboard-c-local-duckdb-test2').click()
  }

  // Verify dashboard is using custom editor as source
  await expect(page.getByText('An Empty Dashboard')).toBeVisible()

  // Add description for the dashboard
  await page
    .getByPlaceholder('What is this dashboard for?')
    .fill('Dashboard using custom editor data source')
  await page.getByTestId('dashboard-description-save').click()

  // Add a custom item to the dashboard
  await page.getByTestId('add-item-button').click()
  await page.getByTestId('dashboard-add-item-confirm').click()
  await page.getByTestId('edit-dashboard-item-content-0').click()

  // Set content using the custom editor query
  await page.getByTestId('simple-editor-content').click()
  await page.getByTestId('simple-editor-content').click({ clickCount: 3 })
  // await page.keyboard.press('Control+A')
  // 3. Delete the selected content
  await page.keyboard.press('Delete')
  await page.keyboard.type('select alt_labels, sum(rows) as value;') // Reference the custom editor
  await page.getByTestId('editor-run-button').click()

  // Save the dashboard item
  await page.getByTestId('save-dashboard-chart').click()

  // Verify the chart container is visible
  await page.getByTestId('vega-chart-container-2').waitFor({ state: 'visible', timeout: 45000 })

  await page.locator('canvas').click({
    modifiers: ['ControlOrMeta'],
    position: {
      // one third of canvas width
      x: (await page.locator(vegaSelector).boundingBox()).width / 3,
      // middle of canvas height
      y: (await page.locator(vegaSelector).boundingBox()).height / 2,
    },
  })
  await page.getByRole('textbox', { name: 'Search dimensions...' }).fill('alt_labels_two')
  //enter enter
  await page.getByRole('textbox', { name: 'Search dimensions...' }).press('Enter')
  await page.getByRole('textbox', { name: 'Search dimensions...' }).press('Enter')
  await page.getByTestId('vega-chart-container-2').waitFor({ state: 'visible', timeout: 45000 })
  console.log('✓ Custom editor dashboard creation test passed')
})
