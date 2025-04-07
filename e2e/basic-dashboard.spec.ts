import { test, expect } from '@playwright/test';
async function getRelativePixelColor(page, relX, relY) {
  const canvasBounds = await page.locator('.vega-container .chart-wrapper canvas').boundingBox();
  if (!canvasBounds) {
    throw new Error('Could not get canvas bounds');
  }
  
  // Convert relative coordinates to absolute pixel positions
  const x = Math.round(canvasBounds.x + (canvasBounds.width * relX));
  const y = Math.round(canvasBounds.y + (canvasBounds.height * relY));
  
  return getPixelColor(page, x, y);
}

async function getPixelColor(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('.vega-container .chart-wrapper canvas');
    if (!canvas) return null;
    
    const context = canvas.getContext('2d');
    const pixelData = context.getImageData(x, y, 1, 1).data;
    
    return {
      r: pixelData[0],
      g: pixelData[1],
      b: pixelData[2],
      a: pixelData[3],
      hex: `#${pixelData[0].toString(16).padStart(2, '0')}${pixelData[1].toString(16).padStart(2, '0')}${pixelData[2].toString(16).padStart(2, '0')}`
    };
  }, { x, y });
}


test('test-create-dashboard-and-pixels', async ({ page, isMobile  }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/');
  // setup
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-icon-community-models').click()
  await page.getByTestId('community-model-search').click();
  await page.getByTestId('community-model-search').press('ControlOrMeta+a');
  await page.getByTestId('community-model-search').fill('faa');
  await page.getByTestId('import-faa').click();
  await page.getByTestId('model-creation-submit').click();
  await page.getByTestId('imported-faa')

  // dashboard
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
    await page.getByTestId('dashboard-creator-add').click()
  }
  await page.getByTestId('sidebar-icon-dashboard').click()
  await page.getByTestId('dashboard-creator-name').click();
  await page.getByTestId('dashboard-creator-name').fill('faa-test');
  await page.getByTestId('dashboard-creator-submit').click();
  await page.getByText('faa-test').click();
  // set up the source
  await page.getByTestId('dashboard-import-selector').click();
  await page.getByTestId('set-dashboard-source-flight').locator('div').first().click();

  // ad our first dashboarrd
  await page.getByTestId('add-item-button').click();
  await page.getByTestId('dashboard-add-item-confirm').click();
  await page.getByTestId('edit-dashboard-item-content').click();

  // set content
  await page.getByTestId('simple-editor-content').click();
  await page.getByTestId('simple-editor-content').press('ControlOrMeta+a');
  await page.keyboard.type('select\n    origin.state,\n    count\n\norder by count desc;');
  await page.getByTestId('editor-run-button').click();

  // save it
  await page.getByTestId('save-dashboard-chart').click();

  // toggle it
  await page.getByTestId('toggle-chart-controls-btn').click();
  await page.getByTestId('chart-type-usa-map').click();

  await page.getByLabel('State Field').selectOption('origin_state');
  await page.getByLabel('Color Scale').selectOption('count');

  await page.getByTestId('toggle-chart-controls-btn').click();
  await page.waitForTimeout(1000)
  await page.waitForSelector('.vega-container .chart-wrapper canvas', { state: 'visible' });
  

  
  // Get canvas dimensions
  const canvas = await page.locator('.vega-container .chart-wrapper canvas')
  const canvasBounds = await canvas.boundingBox();
  if (!canvasBounds) {
    throw new Error('Could not get canvas bounds');
  }

  console.log(`Canvas dimensions: ${canvasBounds.width}x${canvasBounds.height}`);
  
  // Create a grid of points to sample (5x5 grid)
  const gridSize = 10;
  const results = [];
  
  for (let xStep = 0; xStep < gridSize; xStep++) {
    for (let yStep = 0; yStep < gridSize; yStep++) {
      // Calculate relative position
      const relX = xStep / (gridSize - 1);
      const relY = yStep / (gridSize - 1);
      
      // Get color at this point
      const color = await getRelativePixelColor(page, relX, relY);
      
      results.push({
        relX,
        relY,
        x: Math.round(canvasBounds.x + (canvasBounds.width * relX)),
        y: Math.round(canvasBounds.y + (canvasBounds.height * relY)),
        color: color.hex
      });
      
      console.log(`Grid (${xStep},${yStep}) - rel(${relX.toFixed(2)},${relY.toFixed(2)}): ${color.hex}`);
    }
  }
  
  // Output results in a format easy to visualize
  console.table(results);
  

  // Define points to check relative to the canvas
  // These are relative coordinates (x%, y%) within the canvas
  const texasCheck = {
    relX: 0.3333333333333333,
    relY: 0.3333333333333333,
    expectedColor: '#86d0bb' // Adjust this hex value if needed for exact matching
  };
  
  const relativePointsToCheck = [
    texasCheck
  ];
  
  console.log(`Canvas dimensions: ${canvasBounds.width}x${canvasBounds.height}`);
  
  for (const point of relativePointsToCheck) {
    // Convert relative coordinates to absolute pixel positions
    console.log(`Checking pixel at relative position (${point.relX}, ${point.relY})`);
    // Get the pixel color at the calculated position
    const color = await getRelativePixelColor(page, point.relX, point.relY);
    console.log(`Pixel at relative (${point.relX}, ${point.relY}): ${color.hex}`);
    expect(color.hex).toBe(point.expectedColor);
  }
});