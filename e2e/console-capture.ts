// Browser-side error capture for the e2e suite.
//
// Playwright reports what the *test* saw: a locator timed out, an assertion
// failed. It says nothing about what the *page* did. When the app shell throws
// at module scope, every test fails with "waiting for [data-testid=...]" and the
// real cause — one uncaught exception before Vue ever mounted — never reaches
// the report.
//
// src/main.ts removes #loading-screen synchronously during module evaluation,
// so "stuck on the loading screen" is definitionally a top-level throw or a
// bundle that failed to load. Both surface as `pageerror` / `requestfailed`,
// neither of which anything was listening for.
//
// Import `test` and `expect` from here instead of '@playwright/test' and every
// test gets its console attached to the HTML report. Pages created by hand
// (context.newPage(), a second browser context) need `attachConsoleCapture`.
import { test as base, expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import { cacheDeployedAssets, cachePublicModels, retryShedNavigations } from './test-helpers.js'

export { expect }

export type IssueKind = 'pageerror' | 'console' | 'requestfailed' | 'httperror' | 'notification'

export interface BrowserIssue {
  kind: IssueKind
  text: string
  location?: string
}

export interface BrowserDiagnostics {
  issues: BrowserIssue[]
  /** Uncaught exceptions only — the fatal class. */
  pageErrors: () => BrowserIssue[]
  format: () => string
}

// Requests Playwright itself aborts (route handlers, context teardown mid-flight)
// are our own doing, not the app's. Everything else is worth seeing.
const SELF_INFLICTED_REQUEST_FAILURES = ['net::ERR_ABORTED', 'NS_BINDING_ABORTED']

/**
 * Monaco signals cancellation by throwing a sentinel named `Canceled`, and
 * disposing an editor cancels whatever it had in flight. That reaches us as a
 * pageerror even though nothing went wrong — it is control flow, not a fault,
 * and it is raised inside monaco-editor where we have no seam to handle it.
 *
 * It arrives in two shapes, because the engines disagree on how an unhandled
 * rejection is reported. Chromium and Firefox hand Playwright the rejected value
 * itself, so it keeps its own name and message: `Canceled: Canceled`. WebKit
 * reports rejections only as console text — `Unhandled Promise Rejection:
 * Canceled: Canceled` — which Playwright splits at the *first* colon, so the
 * name becomes the wrapper and the whole sentinel ends up in the message. That
 * is why the same monaco teardown was silent on chromium and failed on Mobile
 * Safari.
 *
 * Keyed on the exact sentinel in both shapes rather than a message substring —
 * as is the one other thing this file declines to treat as fatal (see below).
 * Anything broader would start hiding the real defects this capture exists to
 * surface.
 */
const CANCELLATION_SENTINEL = 'Canceled: Canceled'
const WEBKIT_REJECTION_PREFIX = 'Unhandled Promise Rejection: '

export function isCancellationSentinel(error: Error) {
  const reported = `${error.name}: ${error.message}`
  return (
    reported === CANCELLATION_SENTINEL ||
    reported === `${WEBKIT_REJECTION_PREFIX}${CANCELLATION_SENTINEL}`
  )
}

/**
 * ResizeObserver's "loop" messages are not exceptions. Nothing in the app threw
 * them: the spec has the browser fire an `error` event on window when a resize
 * callback changed layout again and the remaining notifications could not be
 * delivered within the same frame. There is no stack, no aborted work, and the
 * next frame delivers what was left — the observers here (charts, the results
 * table, the split panes) all redraw to a size, so a second pass is the design.
 *
 * They still say something about layout churn, so they stay in the report as
 * notifications; they just don't fail a test that otherwise passed. Matched on
 * the two exact spec-defined texts so a genuine throw from a resize callback —
 * which is a real bug, and arrives with a name and a stack — still counts.
 */
const RESIZE_OBSERVER_NOTIFICATIONS = [
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded',
]

function isResizeObserverNotification(error: Error) {
  return RESIZE_OBSERVER_NOTIFICATIONS.includes(error.message.trim())
}

function shortLocation(loc?: { url?: string; lineNumber?: number; columnNumber?: number }) {
  if (!loc?.url) return undefined
  const file = loc.url.split('/').slice(-1)[0] || loc.url
  return loc.lineNumber != null ? `${file}:${loc.lineNumber}:${loc.columnNumber ?? 0}` : file
}

/**
 * Wire console/error listeners onto a page. Call this immediately after
 * creating a page and before any navigation — listeners attached after
 * `goto` miss everything the initial load already emitted.
 */
export function attachConsoleCapture(page: Page): BrowserDiagnostics {
  const issues: BrowserIssue[] = []

  // Uncaught exceptions and unhandled promise rejections. This is the one that
  // kills the app shell.
  page.on('pageerror', (error) => {
    if (isCancellationSentinel(error)) return
    issues.push({
      kind: isResizeObserverNotification(error) ? 'notification' : 'pageerror',
      text: error.stack || `${error.name}: ${error.message}`,
    })
  })

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    issues.push({
      kind: 'console',
      text: msg.text(),
      location: shortLocation(msg.location()),
    })
  })

  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText ?? 'unknown failure'
    if (SELF_INFLICTED_REQUEST_FAILURES.some((e) => errorText.includes(e))) return
    issues.push({
      kind: 'requestfailed',
      text: `${request.method()} ${request.url()} — ${errorText}`,
      location: request.resourceType(),
    })
  })

  // A 404 on a JS chunk is a silent killer: the request "succeeds", the module
  // never evaluates. Only worth flagging for resources the shell needs.
  page.on('response', (response) => {
    if (response.status() < 400) return
    const type = response.request().resourceType()
    if (!['document', 'script', 'stylesheet', 'other'].includes(type)) return
    issues.push({
      kind: 'httperror',
      text: `HTTP ${response.status()} ${response.url()}`,
      location: type,
    })
  })

  return {
    issues,
    pageErrors: () => issues.filter((i) => i.kind === 'pageerror'),
    format: () => formatIssues(issues),
  }
}

export function formatIssues(issues: BrowserIssue[]): string {
  if (issues.length === 0) return 'No browser errors captured.'
  const byKind = (kind: IssueKind) => issues.filter((i) => i.kind === kind)
  const section = (title: string, list: BrowserIssue[]) =>
    list.length === 0
      ? ''
      : `\n## ${title} (${list.length})\n\n` +
        list.map((i) => `- ${i.text}${i.location ? `  \n  _(${i.location})_` : ''}`).join('\n') +
        '\n'

  return (
    `# Browser errors (${issues.length})\n` +
    section('Uncaught exceptions', byKind('pageerror')) +
    section('console.error', byKind('console')) +
    section('Failed requests', byKind('requestfailed')) +
    section('HTTP >= 400', byKind('httperror')) +
    section('Browser notifications (non-fatal)', byKind('notification'))
  )
}

/**
 * Attach captured issues to the report and echo fatals to stdout so they land
 * in the raw GitHub Actions log, not just the downloadable HTML artifact.
 */
export async function reportDiagnostics(diagnostics: BrowserDiagnostics, testInfo: TestInfo) {
  if (diagnostics.issues.length === 0) return

  await testInfo.attach('browser-errors.md', {
    body: diagnostics.format(),
    contentType: 'text/markdown',
  })

  const fatal = diagnostics.pageErrors()
  if (fatal.length > 0) {
    console.error(
      `\n[browser] ${fatal.length} uncaught exception(s) in "${testInfo.title}" ` +
        `[${testInfo.project.name}]:\n` +
        fatal.map((i) => i.text).join('\n---\n'),
    )
  }
}

/**
 * An uncaught exception in the page fails the test, even if every assertion
 * passed. A test that "passes" while the app threw is not a passing test — it
 * just didn't happen to look at the broken thing.
 *
 * Set FAIL_ON_PAGE_ERROR=false to downgrade this to report-only, which is worth
 * doing if you need to see how far the suite gets rather than where it first
 * breaks.
 *
 * Note this is deliberately scoped to `pageerror` (uncaught exceptions and
 * unhandled rejections) and NOT to console.error — this app uses console.error
 * for recoverable conditions, so failing on it would be noise.
 */
const FAIL_ON_PAGE_ERROR = process.env.FAIL_ON_PAGE_ERROR !== 'false'

export const test = base.extend<{ diagnostics: BrowserDiagnostics }>({
  page: async ({ page }, use, testInfo) => {
    const diagnostics = attachConsoleCapture(page)
    ;(page as Page & { __diagnostics?: BrowserDiagnostics }).__diagnostics = diagnostics

    // Every spec in the suite takes its `test` from this file, which makes this
    // the one place a route can be installed for all of them — and the bundle
    // cache only works if nothing slips past it. No-op outside TEST_ENV=prod.
    await cacheDeployedAssets(page)
    await retryShedNavigations(page)
    await cachePublicModels(page)

    await use(page)

    await reportDiagnostics(diagnostics, testInfo)

    // Throwing from fixture teardown is what actually fails a test — assigning
    // to testInfo.status is not a supported way to do it and silently no-ops.
    //
    // Only escalate a test that otherwise passed. If the body already failed,
    // that error is the one worth reading; the browser errors are attached to
    // the report either way, so nothing is lost by staying quiet here.
    const fatal = diagnostics.pageErrors()
    if (FAIL_ON_PAGE_ERROR && fatal.length > 0 && testInfo.status === 'passed') {
      throw new Error(
        `Test assertions passed, but ${fatal.length} uncaught ` +
          `exception(s) occurred in the browser:\n\n` +
          fatal.map((i) => i.text).join('\n---\n') +
          `\n\nThere is deliberately no per-test opt-out: an uncaught exception ` +
          `is a bug worth fixing at the source, even when the UI recovers. ` +
          `FAIL_ON_PAGE_ERROR=false downgrades all of these to report-only.`,
      )
    }
  },

  // Opt-in accessor so a test can assert on what the page logged.
  diagnostics: async ({ page }, use) => {
    const diagnostics = (page as Page & { __diagnostics?: BrowserDiagnostics }).__diagnostics
    if (!diagnostics) throw new Error('console capture not initialised for this page')
    await use(diagnostics)
  },
})
