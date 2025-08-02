import DOMPurify from 'dompurify'
import type { Results } from '../editors/results'
/**
 * HTML escaping function for security
 */
export function escapeHtml(text: string): string {
  if (typeof text !== 'string') {
    return String(text)
  }

  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'ul', 'li', 'strong', 'em', 'a', 'br', 'span'],
    ALLOWED_ATTR: ['href', 'title', 'class', 'style'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'object', 'embed', 'iframe', 'form', 'input'],
    FORBID_ATTR: ['onclick', 'onerror', 'onload', 'onmouseover'],
  })
}

/**
 * Create a loading pill based on fallback text length
 */
function createLoadingPill(fallbackText: string = 'Loading'): string {
  const length = fallbackText.length
  let width: string

  if (length <= 5) {
    width = '60px'
  } else if (length <= 10) {
    width = '80px'
  } else if (length <= 20) {
    width = '120px'
  } else {
    width = '160px'
  }

  return `<span class="loading-pill" style="display: inline-block; width: ${width}; height: 1em; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; filter: blur(0.5px);"></span>`
}

/**
 * Helper function to safely get nested object values
 */
export function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    if (current && typeof current === 'object') {
      // Handle array access like data[0]
      const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/)
      if (arrayMatch) {
        const [, arrayName, index] = arrayMatch
        return current[arrayName] ? current[arrayName][parseInt(index)] : undefined
      }
      return current[key]
    }
    return undefined
  }, obj)
}

/**
 * Helper function to evaluate individual expressions with security
 */
export function evaluateExpression(
  expression: string,
  queryResults: Results | null,
  loading: boolean = false,
): any {
  if (loading) {
    return undefined // Will trigger loading pill creation
  }

  if (!queryResults || !queryResults.data) {
    return undefined
  }

  // Validate expression to prevent code injection
  // Only allow safe patterns
  const safePatterns = [
    /^data\[\d+\]\.\w+$/, // data[0].field
    /^data\.length$/, // data.length
    /^\w+$/, // simple field names
  ]

  const isSafe = safePatterns.some((pattern) => pattern.test(expression))
  if (!isSafe) {
    console.warn('Potentially unsafe expression blocked:', expression)
    return undefined
  }

  // Handle data[index].field patterns
  const dataIndexMatch = expression.match(/^data\[(\d+)\]\.(\w+)$/)
  if (dataIndexMatch) {
    const [, index, field] = dataIndexMatch
    const rowIndex = parseInt(index)
    if (queryResults.data[rowIndex] && queryResults.data[rowIndex][field] !== undefined) {
      return queryResults.data[rowIndex][field]
    }
    return undefined
  }

  // Handle data.length
  if (expression === 'data.length') {
    return queryResults.data.length
  }

  // Handle simple field access (uses first row)
  if (queryResults.data.length > 0) {
    const firstRow = queryResults.data[0]
    if (firstRow && firstRow[expression] !== undefined) {
      return firstRow[expression]
    }
  }

  return undefined
}

/**
 * Helper function to evaluate fallback expressions with security
 */
export function evaluateFallback(
  expression: string,
  queryResults: Results | null,
  loading: boolean = false,
): string {
  try {
    const fallbackMatch = expression.match(/^(.+?)\s*\|\|\s*(.+?)$/)
    if (fallbackMatch) {
      const [, mainExpr, fallbackExpr] = fallbackMatch
      const mainValue = evaluateExpression(mainExpr.trim(), queryResults, loading)

      if (loading) {
        // Extract fallback text for loading pill sizing
        const fallback = fallbackExpr.trim()
        let fallbackText = 'Loading'
        if (
          (fallback.startsWith("'") && fallback.endsWith("'")) ||
          (fallback.startsWith('"') && fallback.endsWith('"'))
        ) {
          fallbackText = fallback.slice(1, -1)
        } else {
          fallbackText = fallback
        }
        return createLoadingPill(fallbackText)
      }

      if (mainValue !== undefined && mainValue !== null && mainValue !== '') {
        return String(mainValue) // Return raw value
      } else {
        const fallback = fallbackExpr.trim()
        if (
          (fallback.startsWith("'") && fallback.endsWith("'")) ||
          (fallback.startsWith('"') && fallback.endsWith('"'))
        ) {
          return fallback.slice(1, -1)
        } else {
          const fallbackValue = evaluateExpression(fallback, queryResults, loading)
          return fallbackValue !== undefined ? String(fallbackValue) : fallback
        }
      }
    } else {
      if (loading) {
        return createLoadingPill(expression)
      }
      const value = evaluateExpression(expression, queryResults, loading)
      return value !== undefined ? String(value) : `{${expression}}`
    }
  } catch (error) {
    console.warn('Error evaluating fallback expression:', expression, error)
    if (loading) {
      return createLoadingPill('Error')
    }
    return `{${expression}}`
  }
}

/**
 * Process template substitutions in markdown text
 */
export function processTemplateSubstitutions(
  text: string,
  queryResults: Results | null,
  loading: boolean = false,
): string {
  let html = text

  if (loading) {
    // Replace {expression || fallback} patterns with loading pills
    html = html.replace(/\{([^}]+)\}/g, (_match: string, expression: string) => {
      return evaluateFallback(expression, queryResults, loading)
    })

    // Handle loops with loading pills
    html = html.replace(
      /\{\{#each data\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (_match: string, template: string) => {
        // Show 3 loading items for loops
        let loopContent = ''
        for (let i = 0; i < 3; i++) {
          let itemContent = template
          itemContent = itemContent.replace(
            /\{\{([^}]+)\}\}/g,
            (_fieldMatch: string, fieldExpr: string) => {
              const trimmed = fieldExpr.trim()
              if (trimmed === '@index') {
                return createLoadingPill('0')
              }
              return createLoadingPill(trimmed)
            },
          )
          loopContent += itemContent
        }
        return loopContent
      },
    )

    // Handle conditional loops with limit
    html = html.replace(
      /\{\{#each data limit=(\d+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (_match: string, limitStr: string, template: string) => {
        const limit = Math.min(parseInt(limitStr) || 3, 3) // Show max 3 loading items
        let loopContent = ''
        for (let i = 0; i < limit; i++) {
          let itemContent = template
          itemContent = itemContent.replace(
            /\{\{([^}]+)\}\}/g,
            (_fieldMatch: string, fieldExpr: string) => {
              const trimmed = fieldExpr.trim()
              if (trimmed === '@index') {
                return createLoadingPill('0')
              }
              return createLoadingPill(trimmed)
            },
          )
          loopContent += itemContent
        }
        return loopContent
      },
    )
  } else if (queryResults && queryResults.data) {
    // Replace {expression || fallback} patterns
    html = html.replace(/\{([^}]+)\}/g, (_match: string, expression: string) => {
      return evaluateFallback(expression, queryResults, loading)
    })

    // Handle loops: {{#each data}} content {{field_name}} {{/each}}
    html = html.replace(
      /\{\{#each data\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (_match: string, template: string) => {
        let loopContent = ''
        queryResults.data.forEach((row: any, index: number) => {
          let itemContent = template
          itemContent = itemContent.replace(
            /\{\{([^}]+)\}\}/g,
            (_fieldMatch: string, fieldExpr: string) => {
              const trimmed = fieldExpr.trim()

              if (trimmed === '@index') {
                return String(index) // Don't escape yet
              }

              // Validate field expression
              if (!/^[\w\s|'"]+$/.test(trimmed)) {
                console.warn('Potentially unsafe field expression blocked:', trimmed)
                return `{{${trimmed}}}`
              }

              // Handle fallback syntax
              const fallbackMatch = trimmed.match(/^(.+?)\s*\|\|\s*(.+?)$/)
              if (fallbackMatch) {
                const [, mainField, fallbackExpr] = fallbackMatch
                const mainValue = row[mainField.trim()]

                if (mainValue !== undefined && mainValue !== null && mainValue !== '') {
                  return String(mainValue) // Don't escape yet
                } else {
                  const fallback = fallbackExpr.trim()
                  if (
                    (fallback.startsWith("'") && fallback.endsWith("'")) ||
                    (fallback.startsWith('"') && fallback.endsWith('"'))
                  ) {
                    return fallback.slice(1, -1) // Don't escape yet
                  } else {
                    return row[fallback] !== undefined ? String(row[fallback]) : fallback
                  }
                }
              } else {
                return row[trimmed] !== undefined ? String(row[trimmed]) : `{{${trimmed}}}`
              }
            },
          )
          loopContent += itemContent
        })
        return loopContent
      },
    )

    // Handle conditional loops with limit
    html = html.replace(
      /\{\{#each data limit=(\d+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (_match: string, limitStr: string, template: string) => {
        const limit = parseInt(limitStr)
        if (isNaN(limit) || limit < 0 || limit > 1000) {
          console.warn('Invalid or unsafe limit value:', limitStr)
          return _match
        }

        let loopContent = ''
        const limitedData = queryResults.data.slice(0, limit)
        limitedData.forEach((row: any, index: number) => {
          let itemContent = template
          itemContent = itemContent.replace(
            /\{\{([^}]+)\}\}/g,
            (_fieldMatch: string, fieldExpr: string) => {
              const trimmed = fieldExpr.trim()

              if (trimmed === '@index') {
                return String(index)
              }

              if (!/^[\w\s|'"]+$/.test(trimmed)) {
                console.warn('Potentially unsafe field expression blocked:', trimmed)
                return `{{${trimmed}}}`
              }

              const fallbackMatch = trimmed.match(/^(.+?)\s*\|\|\s*(.+?)$/)
              if (fallbackMatch) {
                const [, mainField, fallbackExpr] = fallbackMatch
                const mainValue = row[mainField.trim()]

                if (mainValue !== undefined && mainValue !== null && mainValue !== '') {
                  return String(mainValue)
                } else {
                  const fallback = fallbackExpr.trim()
                  if (
                    (fallback.startsWith("'") && fallback.endsWith("'")) ||
                    (fallback.startsWith('"') && fallback.endsWith('"'))
                  ) {
                    return fallback.slice(1, -1)
                  } else {
                    return row[fallback] !== undefined ? String(row[fallback]) : fallback
                  }
                }
              } else {
                return row[trimmed] !== undefined ? String(row[trimmed]) : `{{${trimmed}}}`
              }
            },
          )
          loopContent += itemContent
        })
        return loopContent
      },
    )
  } else {
    // Handle fallbacks for empty data
    html = html.replace(/\{([^}]+)\}/g, (_match: string, expression: string) => {
      const fallbackMatch = expression.match(/^(.+?)\s*\|\|\s*(.+?)$/)
      if (fallbackMatch) {
        const [, , fallbackExpr] = fallbackMatch
        const fallback = fallbackExpr.trim()
        if (
          (fallback.startsWith("'") && fallback.endsWith("'")) ||
          (fallback.startsWith('"') && fallback.endsWith('"'))
        ) {
          return fallback.slice(1, -1)
        }
        return fallback
      }
      return _match
    })
  }

  return html
}

/**
 * Convert markdown syntax to HTML
 */
export function convertMarkdownToHtml(text: string): string {
  let html = text

  // Convert headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')

  // Process lists
  html = html.replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>')
  html = html.replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>')
  html = html.replace(/<\/ul>\s*<ul>/g, '')

  // Process bold and italic
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>')

  // Process links (with basic URL validation but no escaping yet)
  html = html.replace(/\[(.*?)\]\((.*?)\)/gim, (_match: string, text: string, url: string) => {
    // Validate URL to prevent XSS
    if (url.startsWith('javascript:') || url.startsWith('data:') || url.startsWith('vbscript:')) {
      return text // Just return the text without link
    }
    return `<a href="${url}">${text}</a>`
  })

  // Process paragraphs
  html = html.replace(/\n\n/g, '</p><p>')
  html = html.replace(/\n/g, '<br>')
  html = '<p>' + html + '</p>'
  html = html.replace(/<\/p><p><\/p><p>/g, '</p><p>')
  html = html.replace(/^<p><\/p>/, '').replace(/<p><\/p>$/, '')

  return html
}

/**
 * Enhanced markdown renderer with templating support, fallbacks, loading state, and security
 */
export function renderMarkdown(
  text: string,
  queryResults: Results | null = null,
  loading: boolean = false,
): string {
  if (!text) return ''

  // 1. FIRST: Handle template substitutions on raw text (with loading support)
  let html = processTemplateSubstitutions(text, queryResults, loading)

  // 2. SECOND: Convert markdown to HTML (still working with potentially unsafe content)
  html = convertMarkdownToHtml(html)

  // 3. FINALLY: Sanitize the complete HTML
  const sanitized = sanitizeHtml(html)

  // 4. Add CSS for loading animation if in loading state
  if (loading) {
    const css = `
            <style>
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                .loading-pill {
                    animation: shimmer 1.5s infinite linear;
                }
            </style>
        `
    return css + sanitized
  }

  return sanitized
}
