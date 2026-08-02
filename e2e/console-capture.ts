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

export { expect }

export type IssueKind = 'pageerror' | 'console' | 'requestfailed' | 'httperror'

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
    issues.push({
      kind: 'pageerror',
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
    section('HTTP >= 400', byKind('httperror'))
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
 * Set FAIL_ON_PAGE_ERROR=true to turn any uncaught browser exception into a
 * test failure. Off by default so enabling capture doesn't reclassify existing
 * runs; turn it on once the suite is known clean to keep it that way.
 */
const FAIL_ON_PAGE_ERROR = process.env.FAIL_ON_PAGE_ERROR === 'true'

export const test = base.extend<{ diagnostics: BrowserDiagnostics }>({
  page: async ({ page }, use, testInfo) => {
    const diagnostics = attachConsoleCapture(page)
    ;(page as Page & { __diagnostics?: BrowserDiagnostics }).__diagnostics = diagnostics

    await use(page)

    await reportDiagnostics(diagnostics, testInfo)

    if (FAIL_ON_PAGE_ERROR && diagnostics.pageErrors().length > 0 && testInfo.status === 'passed') {
      testInfo.status = 'failed'
      testInfo.error = {
        message:
          'Uncaught exception(s) in the browser:\n' +
          diagnostics
            .pageErrors()
            .map((i) => i.text)
            .join('\n---\n'),
      }
    }
  },

  // Opt-in accessor so a test can assert on what the page logged.
  diagnostics: async ({ page }, use) => {
    const diagnostics = (page as Page & { __diagnostics?: BrowserDiagnostics }).__diagnostics
    if (!diagnostics) throw new Error('console capture not initialised for this page')
    await use(diagnostics)
  },
})
