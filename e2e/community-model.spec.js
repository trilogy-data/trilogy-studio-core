import { test, expect } from '@playwright/test'

test('test', async ({ page, isMobile }) => {
    await page.goto('http://localhost:5173/trilogy-studio-core/')
    if (isMobile) {
        await page.getByTestId('mobile-menu-toggle').click()
    }
    await page.getByTestId('sidebar-icon-community-models').click()
    await page.getByTestId('community-model-search').fill('titanic')
    await page.getByTestId('import-titanic').click()
    await page.getByTestId('model-creator-connection').selectOption('New DuckDB')
    await page.getByTestId('model-creation-submit').click()
    if (isMobile) {
        await page.getByTestId('mobile-menu-toggle').click()
    }
    await page.getByTestId('sidebar-icon-connections').click()
    await page.getByTestId('refresh-connection-titanic-connection').click()
    await page.waitForFunction(() => {
        const element = document.querySelector('[data-testid="status-icon-titanic-connection"]')
        if (!element) return false

        const style = window.getComputedStyle(element)
        const backgroundColor = style.backgroundColor
        console.log(backgroundColor)

        // Check if the background color is green (in RGB format)
        return backgroundColor === 'rgb(0, 128, 0)' || backgroundColor === '#008000'
    })
    await page.getByTestId('sidebar-icon-editors').click()
    // make sure the button has fully loaded

    // this status is flaky depending on device
    // so handle both cases - where we need to expand or not
    try {
        await page.getByTestId('editor-list-id-c-local-titanic-connection').click({timeout: 1000})
    }
    catch (e) {
        await page.getByTestId('editor-list-id-s-local').click()
        await page.getByTestId('editor-list-id-c-local-titanic-connection').click()
    }
    await page
        .getByTestId('quick-new-editor-titanic-connection-trilogy')
        .filter({ visible: true })
        .click()
    await page.getByTestId('editor-run-button').click()
    await expect(page.getByTestId('query-results-length')).toContainText('1')
})
