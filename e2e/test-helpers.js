import { expect } from '@playwright/test'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { getResolverUrl } from './test-env.js'

export { getResolverUrl }

// Production loads DuckDB's worker + 8MB wasm from jsDelivr (see the
// VITE_DUCKDB_BUNDLED define in vite.config.ts), so the suite exercises that
// same path rather than a bundled build we don't ship. Playwright contexts are
// incognito and share no HTTP cache, so without this every test that opens a
// DuckDB connection re-downloads the wasm — ~2.3s per connection on a fast
// network, and unbounded on a throttled CI runner.
//
// First request goes to jsDelivr for real; the response is written to disk and
// replayed for every later request. Cache lives in the repo so CI can persist
// it with actions/cache keyed on the duckdb-wasm version.
const CDN_CACHE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.duckdb-cdn-cache',
)

export async function cacheDuckDBCdn(page) {
  await page.route('**cdn.jsdelivr.net/npm/@duckdb/**', async (route) => {
    const url = route.request().url()
    const key = crypto.createHash('sha1').update(url).digest('hex')
    const bodyPath = path.join(CDN_CACHE_DIR, key)
    const metaPath = `${bodyPath}.json`

    if (fs.existsSync(bodyPath) && fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      await route.fulfill({
        status: 200,
        headers: meta.headers,
        body: fs.readFileSync(bodyPath),
      })
      return
    }

    // Cache miss: fetch for real, but bounded. An unbounded CDN call here is
    // the failure mode this whole helper exists to prevent — it would just be
    // once per run instead of once per test. If jsDelivr stalls or fails, fall
    // back to the identical bytes pnpm already installed, so the suite cannot
    // hang on a third party.
    let response
    let body
    try {
      response = await route.fetch({ timeout: 30000 })
      body = await response.body()
    } catch {
      const file = url.split('/dist/').pop()
      const local = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        'node_modules',
        '@duckdb',
        'duckdb-wasm',
        'dist',
        file,
      )
      if (!fs.existsSync(local)) {
        throw new Error(`DuckDB CDN unreachable and no local copy at ${local}`)
      }
      await route.fulfill({
        status: 200,
        contentType: file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
        body: fs.readFileSync(local),
      })
      return
    }

    try {
      fs.mkdirSync(CDN_CACHE_DIR, { recursive: true })
      // Write-then-rename so parallel workers can't observe a partial file.
      const stamp = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`
      fs.writeFileSync(`${bodyPath}.${stamp}.tmp`, body)
      fs.renameSync(`${bodyPath}.${stamp}.tmp`, bodyPath)
      fs.writeFileSync(`${metaPath}.${stamp}.tmp`, JSON.stringify({ headers: response.headers() }))
      fs.renameSync(`${metaPath}.${stamp}.tmp`, metaPath)
    } catch {
      // A cache write failure must never fail the test — we already have the
      // bytes and can serve this request regardless.
    }

    await route.fulfill({ response, body })
  })
}

// The same argument as cacheDuckDBCdn, applied to the studio's own bundle.
//
// Against production the suite makes ~280 navigations, and each one is a cold
// context that re-downloads the same few dozen hashed chunks — order 10k
// requests to trilogydata.dev, a shared host, inside twenty minutes. It answers
// a browser-shaped burst like that by cutting the client off: measured locally,
// eleven page loads (~550 asset requests) was the whole budget, after which
// every navigation returned `403 Forbidden`. In CI that shows up as a run of
// consecutive tests all dying on "sidebar-icon-… not visible" — the app never
// booted because its chunks were refused, and the locator timeout is the last
// symptom rather than the cause.
//
// Asset filenames are content-hashed, so the second fetch of one cannot tell us
// anything the first didn't. The first request per URL goes to the deployed site
// for real — that is what proves the chunk shipped — and every later request
// replays it. HTML, the resolver, and everything else still go out on every
// test, so the run is still exercising the real deployment.
//
// Local and docker runs are untouched: they talk to a server we started.
// 403/429/5xx here mean the host is shedding load, not that the resource is
// missing — something genuinely absent answers 404 and fails on the first try.
const THROTTLED_STATUSES = [403, 429, 500, 502, 503, 504]

// Caches live at module scope, which in Playwright means one per worker process
// rather than one per page. That distinction is the whole point: a cache scoped
// to the `page` fixture is empty at the start of every test, so 280 tests each
// re-fetched all ~40 chunks for real and the run still put order-10k requests on
// the host — which is exactly what it refused in run 30774861685 (96 `[assets]
// host returned 403` warnings, then seven tests failing on locators because
// their chunks never arrived). Hoisting it here makes it one request per URL per
// worker: a few dozen, not thousands.
//
// Bounded by what a build actually ships to the browser — the largest prod
// chunks are the monaco workers (~7MB worst case) and duckdb's 8MB wasm does not
// land here at all, since prod loads it from jsDelivr (cacheDuckDBCdn, above).
const replayCaches = new Map()

function replayCacheFor(label) {
  let cache = replayCaches.get(label)
  if (!cache) {
    cache = new Map()
    replayCaches.set(label, cache)
  }
  return cache
}

/**
 * Fetch a routed request from the real host, retrying while it answers with a
 * shedding-load status. Returns a fulfillable entry.
 */
async function fetchThroughHost(route, label) {
  const url = route.request().url()
  let response = await route.fetch()
  for (let attempt = 0; attempt < 2 && THROTTLED_STATUSES.includes(response.status()); attempt++) {
    // Say so rather than papering over it — if this is loud, the cache is not
    // keeping the run under the host's limit and the run needs to get smaller.
    console.warn(`[${label}] host returned ${response.status()} for ${url}, retrying`)
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    response = await route.fetch()
  }

  // route.fetch() hands back a decoded body, so replaying the upstream
  // content-encoding/length would have the browser decode it a second time.
  const headers = { ...response.headers() }
  delete headers['content-encoding']
  delete headers['content-length']

  return { status: response.status(), headers, body: await response.body() }
}

/**
 * Route a URL pattern through a per-worker replay cache: the first request for a
 * given URL goes out for real, everything after it replays that response.
 * `label` prefixes the warning printed when the host sheds a request.
 */
async function installReplayCache(page, pattern, label) {
  const cache = replayCacheFor(label)

  await page.route(pattern, async (route) => {
    const url = route.request().url()
    const cached = cache.get(url)
    if (cached) {
      await route.fulfill(cached).catch(() => {})
      return
    }

    try {
      const entry = await fetchThroughHost(route, label)
      if (entry.status === 200) cache.set(url, entry)
      await route.fulfill(entry)
    } catch {
      // A request can still be in flight when its test ends, and Playwright
      // disposes the API response out from under the handler ("Response has
      // been disposed"). Left unhandled that surfaces as a route-handler error
      // against whichever test runs next — a failure with no relationship to
      // the test it is reported on. Hand the request back to the browser and
      // let it end however it was always going to.
      await route.continue().catch(() => {})
    }
  })
}

export async function cacheDeployedAssets(page, env = process.env) {
  if ((env.TEST_ENV || '') !== 'prod') return
  await installReplayCache(page, '**/trilogy-studio-core/assets/**', 'assets')
}

// The document is the one request the replay cache deliberately does not hold:
// every test navigating for real is what keeps the suite honest about the
// deployment. But that also leaves it as the one request with no protection when
// the host starts shedding, and a 403 there is unrecoverable — the app has no
// HTML, so the failure surfaces as `sidebar-icon-… not visible` with nothing in
// the log to explain it (run 30774861685, `HTTP 403 https://…/trilogy-studio-core/`).
//
// So: still fetched for real every time, but a shed response is retried instead
// of being handed to the browser as the page. Assets are handled by the cache
// above and fall through to it.
export async function retryShedNavigations(page, env = process.env) {
  if ((env.TEST_ENV || '') !== 'prod') return

  await page.route(
    (url) =>
      url.pathname.includes('/trilogy-studio-core/') &&
      !url.pathname.includes('/trilogy-studio-core/assets/'),
    async (route) => {
      if (route.request().resourceType() !== 'document') {
        await route.fallback()
        return
      }

      try {
        await route.fulfill(await fetchThroughHost(route, 'document'))
      } catch {
        await route.continue().catch(() => {})
      }
    },
  )
}

// Same problem, different third party, and this one bites every environment
// rather than just prod: the community model store is a GitHub Pages site, and
// listing it fetches an index plus one JSON per model — a few dozen requests
// per page that touches it, against a host we do not own. When GitHub Pages
// starts refusing a CI runner it answers with an error page that carries no
// Access-Control-Allow-Origin, so the browser reports it as
// "Fetch API cannot load … due to access control checks" rather than as a
// status, and the studio's fetch rejects.
//
// Caching keeps the run to one request per model per worker. The first fetch is
// real, so a models repo that has genuinely broken still fails the run.
export async function cachePublicModels(page) {
  await installReplayCache(page, '**trilogy-data.github.io/**', 'public-models')
}

// Mirrors lib/connections/base.ts computeConnectionId for the local storage
// path used by every Playwright fixture. Connection rows now key their test
// ids off the deterministic connection id rather than the display name so two
// connections sharing a name (e.g. local + remote) don't collide.
export function localConnectionId(name) {
  return `local:${name}`
}

// Remote-storage analogue. The auto-import flow accepts an explicit `storeId`
// URL param so tests can pin the id to a known value (see
// `remote-store-import.spec.ts`).
export function remoteConnectionId(storeId, name) {
  return `remote:${storeId}:${name}`
}

const SIDEBAR_SHELL_TIMEOUT = 10000

export async function prepareTestPage(page) {
  await cacheDuckDBCdn(page)
  const resolverUrl = getResolverUrl()

  await page.addInitScript((url) => {
    if (window.localStorage.getItem('__playwright_prepared') === 'true') {
      return
    }

    window.localStorage.clear()
    window.sessionStorage.clear()
    const userSettings = {
      theme: '',
      telemetryEnabled: false,
      tipsRead: [],
      skipAllTips: true,
    }
    if (url) {
      userSettings.trilogyResolver = url
    }
    window.localStorage.setItem('userSettings', JSON.stringify(userSettings))
    window.localStorage.setItem('__playwright_prepared', 'true')
  }, resolverUrl)
}

async function ensureConnectionsSidebarVisible(page, connectionName) {
  const connectionTestId = `connection-${localConnectionId(connectionName)}`
  const visibleRow = page.getByTestId(connectionTestId).filter({ visible: true })
  if ((await visibleRow.count()) > 0) {
    return
  }

  const mobileMenuToggle = page.getByTestId('mobile-menu-toggle').filter({ visible: true })
  await openSidebarScreen(page, 'connections', (await mobileMenuToggle.count()) > 0)
  await expect(visibleRow.first()).toBeVisible({ timeout: SIDEBAR_SHELL_TIMEOUT })
}

export async function waitForConnectionReady(page, connectionName, timeout = 60000) {
  await ensureConnectionsSidebarVisible(page, connectionName)
  await expect(
    page.getByTestId(`status-icon-${connectionName}`).filter({ visible: true }).first(),
  ).toHaveClass(/connected/, { timeout })
}

export async function openSidebarScreen(page, screen, isMobile = false) {
  if (isMobile) {
    const mobileMenuToggle = page.getByTestId('mobile-menu-toggle')
    const mobileHome = page.getByTestId('mobile-menu-home')

    const sidebarIcon = page.getByTestId(`sidebar-icon-${screen}`).first()

    // The mobile menu auto-closes on tab navigation: setActiveTab in
    // useScreenNavigation sets mobileMenuOpen=false AND pushes a hash
    // entry, which fires a delayed hashchange task whose listener can
    // call setActiveTab again. That task can land between our visibility
    // check and the actual click — the icon reads visible, then the menu
    // closes microseconds later, and the click times out on the now-
    // hidden icon. Drain pending tasks first, then drive the open+click
    // through a retry so a late close doesn't kill the run.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 0)))

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await expect(sidebarIcon).toBeVisible({ timeout: 500 })
      } catch {
        // Either the menu is closed, or it's open but drilled into a
        // destination. `mobile-menu-home` jumps straight back to the root menu
        // from any depth, so one click resolves the drilled case regardless of
        // how many levels deep we are.
        if (await mobileHome.isVisible()) {
          await mobileHome.click()
        } else {
          await expect(mobileMenuToggle).toBeVisible({ timeout: SIDEBAR_SHELL_TIMEOUT })
          await mobileMenuToggle.click()
          if (await mobileHome.isVisible()) await mobileHome.click()
        }
        await expect(sidebarIcon).toBeVisible({ timeout: 5000 })
      }
      try {
        await sidebarIcon.click({ timeout: 2000 })
        return
      } catch (err) {
        if (attempt === 3) throw err
        // Menu probably closed on us — drain again and re-open on next loop.
        await page.evaluate(() => new Promise((r) => setTimeout(r, 0)))
      }
    }
    return
  }

  const expandedSidebarContent = page.locator(
    '.sidebar-container > .sidebar-content:not(.sidebar-content-collapsed)',
  )
  const selectedSidebarIcon = page
    .locator(`[data-testid="sidebar-icon-${screen}"].selected`)
    .first()

  if ((await selectedSidebarIcon.count()) > 0 && (await expandedSidebarContent.isVisible())) {
    return
  }

  const sidebarIcon = page.getByTestId(`sidebar-icon-${screen}`).filter({ visible: true }).first()
  await expect(sidebarIcon).toBeVisible({ timeout: SIDEBAR_SHELL_TIMEOUT })
  await sidebarIcon.click({ force: true })
  await expect(sidebarIcon).toHaveClass(/selected/, { timeout: 10000 })
  await expect(expandedSidebarContent).toBeVisible({ timeout: 10000 })
}

export async function drillMobileTree(page, branchLabels, { openChildren = true } = {}) {
  for (const label of branchLabels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const labelPattern = new RegExp(`^\\s*${escapedLabel}(?:\\s*\\([^)]*\\))?\\s*$`)
    const branch = page
      .locator('.mobile-tree-entry .truncate-text')
      .filter({ hasText: labelPattern, visible: true })
      .last()
    await expect(branch).toBeVisible({ timeout: SIDEBAR_SHELL_TIMEOUT })
    await branch.click()
    // Branches containing configuration rows expose a Children step. Pure
    // containers drill directly into their child list.
    const children = page.locator('[data-testid^="mobile-tree-children-"]:visible')
    if (openChildren && (await children.isVisible())) await children.click()
  }
}

async function getVisibleConnectionRow(page, connectionName) {
  await ensureConnectionsSidebarVisible(page, connectionName)
  const rowByTestIdLabel = page
    .getByTestId(`connection-${localConnectionId(connectionName)}`)
    .filter({
      visible: true,
    })
  const rowByTextLabel = page.getByText(connectionName, { exact: true }).filter({
    visible: true,
  })
  const connectionLabel =
    (await rowByTestIdLabel.count()) > 0 ? rowByTestIdLabel.first() : rowByTextLabel.first()

  return connectionLabel.locator('xpath=ancestor::div[contains(@class,"sidebar-content")][1]')
}

async function clickMenuItem(page, testId) {
  const item = page.getByTestId(testId).filter({ visible: true }).first()
  await expect(item).toBeVisible()
  await item.click()
}

export async function refreshConnection(page, connectionName) {
  const directRefresh = page.getByTestId(`refresh-connection-${connectionName}`).filter({
    visible: true,
  })

  if ((await directRefresh.count()) > 0) {
    await directRefresh.first().click()
    return
  }

  const connectionId = localConnectionId(connectionName)
  const connectionRow = await getVisibleConnectionRow(page, connectionName)

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.getByTestId(`connection-actions-${connectionId}-trigger`).click()
  await clickMenuItem(page, `connection-actions-${connectionId}-refresh`)
}

export async function createEditorFromConnectionList(page, connectionName, type = 'trilogy') {
  const connectionId = localConnectionId(connectionName)
  const connectionRow = await getVisibleConnectionRow(page, connectionName)

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.getByTestId(`connection-actions-${connectionId}-trigger`).click()

  const actionId = type === 'sql' ? 'new-sql' : 'new-trilogy'
  await page.getByTestId(`connection-actions-${connectionId}-${actionId}`).click()
}

export async function refreshLLMConnection(page, connectionName) {
  const connectionLabel = page.getByTestId(`llm-connection-${connectionName}`).filter({
    visible: true,
  })
  const connectionRow = connectionLabel.locator(
    'xpath=ancestor::div[contains(@class,"sidebar-content")][1]',
  )

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  await connectionRow.getByTestId(`llm-connection-actions-${connectionName}-trigger`).click()
  await clickMenuItem(page, `llm-connection-actions-${connectionName}-refresh`)
}

export async function createEditorFromConnection(
  page,
  connectionName,
  type = 'trilogy',
  remoteStoreId = null,
) {
  const directButton = page.getByTestId(`quick-new-editor-${connectionName}-${type}`).filter({
    visible: true,
  })

  if ((await directButton.count()) > 0) {
    await directButton.first().click()
    return
  }

  // Editor sidebar rows key off the connection id (`editor-c-local-local:foo`
  // or `editor-c-remote-remote:<storeId>:<name>`). Callers pass an explicit
  // `remoteStoreId` when targeting a remote row; otherwise we resolve the
  // local row deterministically.
  const isRemote = remoteStoreId != null
  const editorConnId = isRemote
    ? remoteConnectionId(remoteStoreId, connectionName)
    : localConnectionId(connectionName)
  const storage = isRemote ? 'remote' : 'local'
  const editorConnectionLabel = page
    .getByTestId(`editor-c-${storage}-${editorConnId}`)
    .filter({ visible: true })

  // Mobile editor navigation starts at the storage roots. Reveal the target
  // connection before looking for its overflow actions.
  if (
    (await editorConnectionLabel.count()) === 0 &&
    (await page.getByTestId('mobile-menu-home').isVisible())
  ) {
    await drillMobileTree(page, [isRemote ? 'Remote Storage' : 'Browser Storage'])
  }
  const connectionRow = editorConnectionLabel
    .first()
    .locator('xpath=ancestor::div[contains(@class,"sidebar-content")][1]')

  await expect(connectionRow).toBeVisible()
  await connectionRow.hover()
  const actionId = type === 'sql' ? 'new-sql' : 'new-trilogy'
  await connectionRow.getByTestId(`editor-actions-c-${storage}-${editorConnId}-trigger`).click()
  await page.getByTestId(`editor-actions-c-${storage}-${editorConnId}-${actionId}`).click()
}

async function openSidebarOverflowMenu(page, labelLocator, triggerTestId) {
  const row = labelLocator.locator('xpath=ancestor::div[contains(@class,"sidebar-content")][1]')

  await expect(row).toBeVisible()
  await row.hover()
  await row.getByTestId(triggerTestId).click()
}

export async function deleteEditor(page, editorTestId, isMobile = false) {
  const visibleEditorLabel = page.getByTestId(editorTestId).filter({ visible: true })
  const editorKey = editorTestId.replace(/^editor-/, '')

  if ((await visibleEditorLabel.count()) === 0 && isMobile) {
    await openSidebarScreen(page, 'editors', true)
  }

  await openSidebarOverflowMenu(
    page,
    page.getByTestId(editorTestId).filter({ visible: true }).first(),
    `editor-actions-${editorKey}-trigger`,
  )
  await page
    .getByTestId(`editor-actions-${editorKey}-delete-editor`)
    .filter({ visible: true })
    .click()
  await page.getByTestId('confirm-editor-deletion').filter({ visible: true }).click()
}

export async function waitForEditorQueryComplete(page, timeout = 60000) {
  await expect(page.getByTestId('editor-run-button')).toHaveAttribute('aria-label', 'Run query', {
    timeout,
  })
}

export async function runEditorQueryAndWait(page, timeout = 60000) {
  const runButton = page.getByTestId('editor-run-button')
  const editor = runButton.locator('xpath=ancestor::*[@data-query-start-time][1]')
  const previousStartTime = (await editor.getAttribute('data-query-start-time')) ?? ''

  await runButton.click()

  // startTime persists after completion, unlike the transient loading state.
  // This detects queries that start and finish before Vue paints "Cancel".
  await expect(editor).not.toHaveAttribute('data-query-start-time', previousStartTime, {
    timeout,
  })
  await waitForEditorQueryComplete(page, timeout)
}

export async function runEditorQueryAndExpectCount(page, expectedCount, timeout = 60000) {
  await runEditorQueryAndWait(page, timeout)

  await expect(page.getByTestId('query-results-length')).toContainText(String(expectedCount), {
    timeout,
  })
}

/**
 * Replace everything in a monaco editor with `text`.
 *
 * Monaco decides whether "select all" is Cmd+A or Ctrl+A from the *browser's*
 * user agent; Playwright resolves `ControlOrMeta` from the *host* OS. The webkit
 * and Mobile Safari projects run a macOS user agent on a Linux runner, so
 * `ControlOrMeta+a` sends Ctrl+A to a monaco that is in Mac mode — where Ctrl+A
 * means "move the cursor to the start of the line", not "select all". Nothing
 * throws and no locator times out: the typed text is simply inserted in front of
 * the old content, and the editor saves the two queries glued together. That
 * still returns rows, just not the ones the test is asserting on, so the failure
 * surfaces somewhere else entirely (a cell that isn't clickable, a chart of the
 * wrong data).
 *
 * Ask monaco which mode it is in — it puts `mac` on the editor root — send the
 * chord it is actually listening for, and assert the editor really is empty
 * before typing so a future divergence fails here instead.
 */
export async function replaceEditorContent(page, text, testId = 'simple-editor-content') {
  const container = page.getByTestId(testId)
  const monaco = container.locator('.monaco-editor').first()
  await expect(monaco).toBeVisible()
  await container.click()

  const isMacMode = await monaco.evaluate((el) => el.classList.contains('mac'))
  await page.keyboard.press(isMacMode ? 'Meta+a' : 'Control+a')
  await page.keyboard.press('Delete')
  await expect(container.locator('.view-lines')).toHaveText(/^\s*$/)

  await page.keyboard.type(text)
}

export async function openDashboardItemEditor(page, itemId) {
  const itemCard = page.getByTestId(`dashboard-component-${itemId}`)
  const editButton = page.getByTestId(`edit-dashboard-item-content-${itemId}`)

  await itemCard.scrollIntoViewIfNeeded()
  await itemCard.hover({ force: true })
  await expect(editButton).toBeVisible()
  await editButton.dispatchEvent('click')
}
