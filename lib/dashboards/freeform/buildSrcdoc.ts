import { GUEST_RUNTIME_SOURCE } from './guestRuntime'
import { FREEFORM_CDN_ORIGINS, type FreeformTheme } from './types'

/**
 * Assembles the document that runs inside a freeform widget frame.
 *
 * Two invariants carry the entire security model, and both are asserted in
 * buildSrcdoc.test.ts:
 *
 *  1. The sandbox attribute is exactly 'allow-scripts'. Adding
 *     'allow-same-origin' alongside it would let the frame reach into the
 *     parent document and delete its own sandbox attribute — the isolation
 *     would be gone, not merely weakened. Never add it, no matter what
 *     storage error it appears to fix.
 *
 *  2. The frame carries its own CSP. `srcdoc` documents INHERIT the embedding
 *     page's policy, and the app's policy allows `img-src https:` — wide open
 *     for exfiltration. CSP policies combine restrictively, so the injected
 *     policy below is what actually constrains egress. An author cannot loosen
 *     it by adding a meta tag of their own.
 */

/** The only sandbox token set. See invariant 1 above. */
export const FREEFORM_SANDBOX = 'allow-scripts'

/** Rejects anything that isn't a plain https origin, so a caller-supplied
 *  allowlist can't inject extra CSP directives via a stray ';'. */
function isValidCspOrigin(origin: string): boolean {
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin)
}

export interface FrameCspOptions {
  /** Origins the widget may load scripts/styles/fonts from. Pass [] to forbid
   *  all external subresources. */
  cdnOrigins?: readonly string[]
}

export function buildFrameCsp(options: FrameCspOptions = {}): string {
  const origins = (options.cdnOrigins ?? FREEFORM_CDN_ORIGINS).filter(isValidCspOrigin)
  const external = origins.length ? ' ' + origins.join(' ') : ''

  // 'unsafe-inline'/'unsafe-eval' are not a weakening here: widget code is
  // arbitrary author JS by design, and it already runs inline. What matters is
  // that no directive below permits a network egress channel — connect-src,
  // img-src, form-action and frame-src are the ones that would leak data.
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' blob:${external}`,
    `style-src 'unsafe-inline'${external}`,
    `font-src data:${external}`,
    'img-src data: blob:',
    'media-src data: blob:',
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    'worker-src blob:',
  ].join('; ')
}

/** Split an authored document into head/body fragments so a full HTML document
 *  and a bare fragment both render sensibly. Presentation only — the security
 *  boundary is the sandbox and the CSP, never this parse. */
export function splitAuthorDocument(html: string): { head: string; body: string } {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)

  if (!headMatch && !bodyMatch) {
    return { head: '', body: html }
  }

  return {
    head: headMatch ? headMatch[1] : '',
    body: bodyMatch ? bodyMatch[1] : html.replace(/<head[^>]*>[\s\S]*?<\/head>/i, ''),
  }
}

function renderThemeVars(theme: FreeformTheme | undefined): string {
  if (!theme?.vars) return ''
  return (
    Object.entries(theme.vars)
      // Custom property names only — nothing else can appear inside our style block.
      .filter(([name]) => /^--[a-z0-9-]+$/i.test(name))
      .filter(([, value]) => typeof value === 'string' && !/[<>;{}]/.test(value))
      .map(([name, value]) => `    ${name}: ${value};`)
      .join('\n')
  )
}

/** Defaults derived from the widget theme contract, so a widget that styles
 *  nothing at all is still legible in both modes. `color-scheme` matters more
 *  than it looks: without it the frame's scrollbars and native controls render
 *  light-on-light in dark mode. */
const BASE_STYLES = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      font-family: var(--widget-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--widget-font-size, 14px);
      color: var(--widget-text, #1f2937);
      background: transparent;
    }
    body { overflow: auto; }
    a { color: var(--widget-accent, #2563eb); }
`

export interface BuildSrcdocOptions {
  html: string
  theme?: FreeformTheme
  cdnOrigins?: readonly string[]
}

/** Build the full srcdoc string: our CSP, our base styles, our runtime shim,
 *  then author content. Order matters — the CSP meta must precede anything it
 *  is meant to govern, and the runtime must be installed before author code
 *  runs so `window.trilogy` is available synchronously. */
export function buildFreeformSrcdoc(options: BuildSrcdocOptions): string {
  const { head, body } = splitAuthorDocument(options.html || '')
  const csp = buildFrameCsp({ cdnOrigins: options.cdnOrigins })
  const themeVars = renderThemeVars(options.theme)
  const mode = options.theme?.mode === 'dark' ? 'dark' : 'light'

  return `<!doctype html>
<html data-theme="${mode}">
<head>
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    color-scheme: ${mode};
${themeVars}
  }
${BASE_STYLES}
</style>
<script>${GUEST_RUNTIME_SOURCE}</script>
${head}
</head>
<body>
${body}
</body>
</html>`
}
