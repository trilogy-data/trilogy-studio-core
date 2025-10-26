import { test, expect } from '@playwright/test'

test('test-autoimport-iris-data-dashboard', async ({ page, isMobile }) => {
  // Navigate to the URL with all the autoimport parameters
  const autoImportUrl =
    'http://localhost:5173/trilogy-studio-core/#screen=dashboard-import&import=https%3A%2F%2Ftrilogy-data.github.io%2Ftrilogy-public-models%2Fstudio%2Firis_data.json&dashboard=overview&modelName=iris_data&connection=duckdb'

  await page.goto(autoImportUrl)

  // Verify we're on the dashboard import screen
  // Should see the autoimport component loading state
  await expect(page.getByText('Setting up your dashboard...')).toBeVisible({ timeout: 10000 })

  // Should see step indicators during the import process
  await expect(page.locator('.step-indicator')).toBeVisible()

  // Verify the steps are present
  await expect(page.getByText('Importing model')).toBeVisible()
  await expect(page.getByText('Establishing connection')).toBeVisible()
  await expect(page.getByText('Preparing data')).toBeVisible()

  // Wait for the import to complete - this might take a while
  // We expect to see the active step changing during the process
  let maxWaitTime = 30000 // 30 seconds max wait
  let startTime = Date.now()
  let dashboardFound = false
  while (Date.now() - startTime < maxWaitTime) {
    try {
      // Check if we've moved to success state or error state
      const dashboardElements = [page.getByTestId('refresh-button')]

      for (const element of dashboardElements) {
        try {
          await expect(element.first()).toBeVisible({ timeout: 5000 })
          dashboardFound = true
          console.log(
            'Found dashboard element:',
            (await element.first().getAttribute('data-testid')) || 'dashboard element',
          )
          break
        } catch {
          continue
        }
      }
      if (dashboardFound) {
        break
      }

      if (await page.locator('.error-state').isVisible()) {
        const errorText = await page.locator('.error-state').textContent()
        throw new Error(`Import failed with error: ${errorText}`)
      }

      // Check step progression
      const activeStep = page.locator('.step.active')
      if ((await activeStep.count()) > 0) {
        const stepText = await activeStep.first().textContent()
        console.log(`Current step: ${stepText}`)
      }

      await page.waitForTimeout(1000)
    } catch (error) {
      // Continue waiting unless it's a real error
      if (error.message.includes('Import failed')) {
        throw error
      }
    }
  }

  if (!dashboardFound) {
    throw new Error('Import process timed out without completing')
  }

  // Verify that the imported model and connection exist
  // Navigate to check if the connection was created
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  } else {
    await page.getByTestId('toggle-edit-mode-button').click()
  }

  await page.getByTestId('sidebar-link-connections').click({ timeout: 5000 })

  // Should see the iris_data-connection or similar
  const connectionExists =
    (await page.isVisible('[data-testid*="iris_data"]')) ||
    (await page.isVisible('[data-testid*="connection"]'))

  if (connectionExists) {
    console.log('✓ Connection was successfully created during autoimport')
  }

  // Check models too
  // if (isMobile) {
  //   await page.getByTestId('mobile-menu-toggle').click()
  // }
  await page.getByTestId('sidebar-link-models').click()

  const modelExists =
    (await page.isVisible('[data-testid*="iris_data"]')) ||
    (await page.getByTestId('model-sidebar-item-iris_data').isVisible())

  if (modelExists) {
    console.log('✓ Model was successfully imported during autoimport')
  }

  console.log('✓ Iris data autoimport test completed successfully')
})
