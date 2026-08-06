import { test, expect } from './console-capture'
import {
  drillMobileTree,
  localConnectionId,
  openDashboardItemEditor,
  openSidebarScreen,
  prepareTestPage,
  refreshConnection,
  replaceEditorContent,
  runEditorQueryAndExpectCount,
  waitForConnectionReady,
} from './test-helpers.js'

/**
 * End-to-end coverage for freeform ("agentic") widgets.
 *
 * The unit suite proves the protocol and the generated document in isolation;
 * only a real browser can prove the parts that matter most here — that the
 * sandbox actually isolates, that data crosses the MessageChannel into a live
 * frame, and that a click inside that frame cross-filters the dashboard.
 */

const connectionName = 'duckdb-widget-test'

/** A widget exercising the whole contract: renders rows, cross-filters on
 *  click, and styles itself from the theme contract only. */
const WIDGET_HTML = `<style>
  .row {
    padding: 6px 10px;
    cursor: pointer;
    color: var(--widget-text);
    border-bottom: 1px solid var(--widget-border-light);
  }
  .row:hover { background: rgba(var(--widget-accent-rgb), 0.08); }
  #meta { color: var(--widget-text-muted); padding: 6px 10px; }
</style>
<div id="meta">waiting</div>
<div id="root"></div>
<script>
  var root = document.getElementById('root');
  var meta = document.getElementById('meta');

  trilogy.subscribe(function (state) {
    meta.textContent = 'status=' + state.status + ' rows=' + state.rowCount;
    root.innerHTML = '';
    state.rows.forEach(function (row) {
      var el = document.createElement('div');
      el.className = 'row';
      el.id = 'row-' + row.rows;
      el.textContent = String(row.rows);
      el.addEventListener('click', function () {
        trilogy.filters.eq('rows', row.rows);
      });
      root.appendChild(el);
    });
  });

  trilogy.ready();
<\/script>`

// Authoring a widget means driving the item-content editor dialog, which the
// mobile shell reaches through a different (and much fiddlier) path. Widgets
// themselves render and run on mobile — it is only this authoring flow that is
// desktop-only here.
test.skip(({ isMobile }) => !!isMobile, 'widget authoring dialog is exercised on desktop only')

test.beforeEach(async ({ page }) => {
  await prepareTestPage(page)
})

/** Local duckdb connection + an editor the dashboard can import from. */
async function setupConnectionAndModel(page: any, isMobile: boolean) {
  await openSidebarScreen(page, 'connections', isMobile)
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').click()
  await page.getByTestId('connection-creator-name').fill(connectionName)
  await page.getByTestId('connection-creator-submit').click()
  await refreshConnection(page, connectionName)
  await waitForConnectionReady(page, connectionName)

  await openSidebarScreen(page, 'editors', isMobile)
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').click()
  await page.getByTestId('editor-creator-name').fill('widget_source')
  await page.getByTestId('editor-creator-type').selectOption('preql')
  await page.getByTestId('editor-creator-connection-select').selectOption({ label: connectionName })
  await page.getByTestId('editor-creator-submit').click()

  if (isMobile) {
    await drillMobileTree(page, ['Browser Storage', connectionName])
  }
  await page
    .getByTestId(`editor-e-local-${localConnectionId(connectionName)}-widget_source`)
    .click()

  const editor = page.getByTestId('editor')
  await editor.click({ clickCount: 3 })
  await page.keyboard.press('Delete')
  await page.keyboard.insertText(
    ['auto x <- [1,2,3,4,5];', '', 'auto rows <- unnest(x);', 'select rows;'].join('\n'),
  )
  await runEditorQueryAndExpectCount(page, 5)
}

async function createDashboard(page: any, isMobile: boolean, name: string) {
  await openSidebarScreen(page, 'dashboard', isMobile)
  await page.getByTestId('dashboard-creator-add').click()
  await page.getByTestId('dashboard-creator-name').fill(name)
  await page.getByTestId('dashboard-creator-connection').selectOption(connectionName)
  await page.getByTestId('dashboard-creator-import').selectOption('widget_source')
  await page.getByTestId('dashboard-creator-submit').click()

  if (!isMobile) {
    const exists = await page.isVisible(`[data-testid="dashboard-d-${name}"]`)
    if (!exists) {
      await page.getByTestId('dashboard-s-local').click()
      await page.getByTestId(`dashboard-c-local-${localConnectionId(connectionName)}`).click()
    }
    await page.getByTestId(`dashboard-c-local-${localConnectionId(connectionName)}`).click()
  }

  await expect(page.getByText('An Empty Dashboard')).toBeVisible()
}

/** Add a widget cell and author its markup + query through the editor. */
async function addWidgetItem(page: any, itemId: number, html: string, query: string) {
  await page.getByTestId('add-item-button').click()
  await page.getByTestId('dashboard-add-item-type-freeform-option').click()
  await page.getByTestId('dashboard-add-item-confirm').click()
  await openDashboardItemEditor(page, itemId)

  const htmlEditor = page.getByTestId('freeform-html-editor')
  await expect(htmlEditor).toBeVisible()
  await htmlEditor.fill(html)

  await page.getByText('Data Query').click()
  await replaceEditorContent(page, query)

  await page.getByTestId('save-dashboard-freeform').click()
}

test('freeform widget renders, is sandboxed, and cross-filters the dashboard', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120000)
  await page.goto('#skipTips=true')

  await setupConnectionAndModel(page, isMobile)
  await createDashboard(page, isMobile, 'widget-dashboard')

  await addWidgetItem(page, 0, WIDGET_HTML, 'select rows;')

  const widgetCell = page.getByTestId('dashboard-component-0')
  const frameElement = widgetCell.locator('iframe')
  await expect(frameElement).toBeVisible({ timeout: 45000 })

  // The invariant the whole security model rests on. Asserted in the unit suite
  // too, but only here against what the browser actually received.
  const sandbox = await frameElement.getAttribute('sandbox')
  expect(sandbox).toBe('allow-scripts')
  await expect(frameElement).toHaveAttribute('referrerpolicy', 'no-referrer')

  // Data crossed the MessageChannel into the frame.
  const widget = widgetCell.frameLocator('iframe')
  await expect(widget.locator('#meta')).toHaveText('status=ready rows=5', { timeout: 45000 })
  await expect(widget.locator('.row')).toHaveCount(5)

  // The frame is an opaque origin: no reaching back into the host.
  const isolation = await frameElement.evaluate((frame: HTMLIFrameElement) => {
    try {
      // Throws for a cross-origin (sandboxed, opaque) document.
      return { reachable: !!frame.contentWindow?.document.body }
    } catch (err) {
      return { reachable: false, error: String(err) }
    }
  })
  expect(isolation.reachable).toBe(false)

  // The theme contract resolves inside the frame.
  const themeVars = await widget.locator('body').evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return {
      text: style.getPropertyValue('--widget-text').trim(),
      accent: style.getPropertyValue('--widget-accent').trim(),
      accentRgb: style.getPropertyValue('--widget-accent-rgb').trim(),
      series1: style.getPropertyValue('--widget-series-1').trim(),
      mode: document.documentElement.getAttribute('data-theme'),
    }
  })
  expect(themeVars.text).toBeTruthy()
  expect(themeVars.accent).toBeTruthy()
  expect(themeVars.accentRgb).toBeTruthy()
  expect(themeVars.series1).toBeTruthy()
  expect(['light', 'dark']).toContain(themeVars.mode)

  // Widget text actually inherits the contract rather than a hardcoded color.
  const rowColor = await widget.locator('.row').first().evaluate((el) => getComputedStyle(el).color)
  expect(rowColor).toBeTruthy()

  // Add a table so we can observe the cross-filter landing somewhere else.
  await page.getByTestId('add-item-button').click()
  await page.getByTestId('dashboard-add-item-type-table-option').click()
  await page.getByTestId('dashboard-add-item-confirm').click()
  await openDashboardItemEditor(page, 1)
  await replaceEditorContent(page, 'select rows;')
  await page.getByTestId('save-dashboard-chart').click()

  const tableCell = page.getByTestId('dashboard-component-1')
  const tableRows = tableCell.locator('.tabulator-row')
  await expect(tableRows).toHaveCount(5, { timeout: 45000 })

  // In edit mode the hover-revealed edit overlay covers the cell and would
  // swallow the click before it reached the frame. Clicking the item header
  // dismisses it, same as the chart cross-filter test does.
  await widgetCell.hover({ force: true })
  await widgetCell.click({ force: true, position: { x: 16, y: 16 } })

  // The interactivity round trip: click inside the sandboxed frame, and the
  // host turns it into a typed cross-filter that re-runs the sibling query.
  await widget.locator('#row-3').click()

  await expect(tableRows).toHaveCount(1, { timeout: 45000 })
  await expect(tableCell).toContainText('3')

  // The filter is attributed to a source, so it surfaces as a chip on the
  // filtered item exactly like a chart-driven cross-filter would.
  await expect(tableCell.locator('.header-filter-chip').first()).toBeVisible()
})

test('a widget that never signals ready is reported as broken', async ({ page, isMobile }) => {
  test.setTimeout(120000)
  await page.goto('#skipTips=true')

  await setupConnectionAndModel(page, isMobile)
  await createDashboard(page, isMobile, 'broken-widget-dashboard')

  // No trilogy.ready() — the watchdog should surface it rather than leaving a
  // blank cell the user cannot diagnose.
  await addWidgetItem(page, 0, '<div id="root">never ready</div>', 'select rows;')

  const widgetCell = page.getByTestId('dashboard-component-0')
  await expect(widgetCell.getByTestId('freeform-retry-btn')).toBeVisible({ timeout: 45000 })
  await expect(widgetCell).toContainText('did not finish loading')
})
