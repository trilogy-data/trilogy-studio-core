import { test, expect } from '@playwright/test'

// use this if debug menus i on
// const vegaSelector = '.vega-container .chart-wrapper canvas'
const vegaSelector = '.vega-container canvas'

async function getRelativePixelColor(page, relX, relY) {
  const canvasBounds = await page.locator('.vega-container canvas').boundingBox()
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
      const canvas = document.querySelector('.vega-container canvas')
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
  await page.goto('http://localhost:5173/trilogy-studio-core/')
  // setup
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-community-models').click()
  await page.getByTestId('community-model-search').click()
  await page.getByTestId('community-model-search').press('ControlOrMeta+a')
  await page.getByTestId('community-model-search').fill('faa')
  await page.getByTestId('import-faa').click()
  await page.getByTestId('model-creation-submit').click()
  await page.getByTestId('imported-faa')

  // dashboard
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-link-dashboard').click()
  if (isMobile) {
    await page.getByTestId('dashboard-creator-add').click()
  }
  await page.getByTestId('dashboard-creator-name').click()
  await page.getByTestId('dashboard-creator-name').fill('faa-test')
  await page.getByTestId('dashboard-creator-submit').click()
  await page.getByText('faa-test').click()

  // set up the source
  await page.getByTestId('dashboard-import-selector').click()
  await page.getByTestId('set-dashboard-source-flight').locator('div').first().click()
  if (isMobile) {
    await page.getByTestId('close-model-selector').click()
  }

  // ad our first dashboarrd
  await page.getByTestId('add-item-button').click()
  await page.getByTestId('dashboard-add-item-confirm').click()
  await page.getByTestId('edit-dashboard-item-content').click()

  // set content
  await page.getByTestId('simple-editor-content').click()
  if (browser.browserType().name() === 'webkit') {
    await page.getByTestId('simple-editor-content').click({ clickCount: 3 })
  } else {
    await page.getByTestId('simple-editor-content').press('ControlOrMeta+a')
  }

  await page.keyboard.type('select\n    origin.state,\n    count\norder by count desc;')
  await page.getByTestId('editor-run-button').click()
  await page.getByTestId('simple-editor-results')

  // save it
  await page.getByTestId('save-dashboard-chart').click()

  // toggle it
  await page.getByTestId('toggle-chart-controls-btn').click()
  await page.getByTestId('chart-type-usa-map').click()

  await page.getByLabel('Geo Field').selectOption('origin_state')
  await page.getByLabel('Color Scale').selectOption('count')

  await page.getByTestId('toggle-chart-controls-btn').click()
  await page.waitForTimeout(1000)
  await page.waitForSelector(vegaSelector, { state: 'visible' })

  // Get canvas dimensions
  const canvas = await page.locator(vegaSelector)
  const canvasBounds = await canvas.boundingBox()
  if (!canvasBounds) {
    throw new Error('Could not get canvas bounds')
  }

  console.log(`Canvas dimensions: ${canvasBounds.width}x${canvasBounds.height}`)
  console.log(`Canvas position: ${canvasBounds.x}, ${canvasBounds.y}`)

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

  // Define points to check relative to the canvas
  // These are relative coordinates (x%, y%) within the canvas
  const nonWhite = ['#86d0bb', '#225aa5', '#c7e9b5']
  const texasCheck = {
    relX: 0.555555555555555,
    relY: 0.555555555555555,
    expectedColors: nonWhite, // Adjust this hex value if needed for exact matching
  }

  const texasCheck2 = {
    relX: 0.5555555555555556,
    relY: 0.6666666666666666,
    expectedColors: nonWhite, // Adjust this hex value if needed for exact matching
  }

  const texasCheck3 = {
    relX: 0.5555555555555556,
    relY: 0.8888888888888888,
    expectedColors: nonWhite, // Adjust this hex value if needed for exact matching
  }

  const relativePointsToCheck = [texasCheck, texasCheck2, texasCheck3]

  let atLeastOneMatch = false

  // Check each point
  for (const point of relativePointsToCheck) {
    // Convert relative coordinates to absolute pixel positions
    console.log(`Checking pixel at relative position (${point.relX}, ${point.relY})`)
    // Get the pixel color at the calculated position
    const color = await getRelativePixelColor(page, point.relX, point.relY)
    console.log(`Pixel at relative (${point.relX}, ${point.relY}): ${color.hex}`)

    // If the color is in the expected colors list, set the flag to true
    if (point.expectedColors.includes(color.hex)) {
      atLeastOneMatch = true
      break // We can exit the loop early once we find a match
    }
  }

  // Final assertion that checks if at least one pixel matched
  expect(atLeastOneMatch).toBe(true)
})
