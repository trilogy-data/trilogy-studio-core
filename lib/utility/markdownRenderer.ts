import DOMPurify from 'dompurify'
import type { Results, Row } from '../editors/results'
import { ARRAY_IMPLICIT_COLUMN } from '../connections/constants'
// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface TemplateContext {
  queryResults: Results | null
  loading: boolean
  currentRow?: any
}

interface CodeBlockPlaceholder {
  [key: string]: string
}

interface FallbackExpression {
  mainExpr: string
  fallbackExpr: string
}

// ============================================================================
// SECURITY AND VALIDATION
// ============================================================================

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

/**
 * Sanitize HTML with predefined safe tags and attributes
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'p',
      'ul',
      'li',
      'strong',
      'em',
      'a',
      'br',
      'span',
      'pre',
      'code',
      'div',
      'button',
      'svg',
      'rect',
      'path',
      'polyline',
    ],
    ALLOWED_ATTR: [
      'href',
      'title',
      'class',
      'style',
      'data-language',
      'data-content',
      'xmlns',
      'width',
      'height',
      'viewBox',
      'fill',
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'x',
      'y',
      'rx',
      'ry',
      'd',
      'points',
    ],
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['script', 'object', 'embed', 'iframe', 'form', 'input'],
    FORBID_ATTR: ['onclick', 'onerror', 'onload', 'onmouseover'],
  })
}

/**
 * Validate expression to prevent code injection
 */
function isExpressionSafe(expression: string): boolean {
  const unsafePatterns = [/\_\_proto\_\_/]
  const safePatterns = [
    /^data\[\d+\]\.[\w.]+$/, // data[0].field or data[0].field.subfield
    /^data\.length$/, // data.length
    /^\w+$/, // simple field names
    /^[\w.]+$/, // nested field names with dots
  ]
  if (unsafePatterns.some((pattern) => pattern.test(expression))) {
    return false
  }
  return safePatterns.some((pattern) => pattern.test(expression))
}

/**
 * Validate field expression for template loops
 */
function isFieldExpressionSafe(expression: string): boolean {
  expression = expression.split('||')[0]
  return /^[\w\s|'"\.\-]+$/.test(expression)
}

/**
 * Validate URL to prevent XSS
 */
function isUrlSafe(url: string): boolean {
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:']
  return !dangerousProtocols.some((protocol) => url.startsWith(protocol))
}

// ============================================================================
// LOADING STATE HELPERS
// ============================================================================

/**
 * Create a loading pill based on fallback text length
 */
function createLoadingPill(fallbackText: string = 'Loading'): string {
  const length = fallbackText.length
  let width: string

  if (length <= 5) width = '60px'
  else if (length <= 10) width = '80px'
  else if (length <= 20) width = '120px'
  else width = '160px'

  return `<span class="loading-pill" style="display: inline-block; width: ${width}; height: 1em; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; filter: blur(0.5px);"></span>`
}

/**
 * Generate CSS for loading animations
 */
function generateLoadingCSS(): string {
  return `
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
}

// ============================================================================
// DATA ACCESS HELPERS
// ============================================================================

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

// ============================================================================
// EXPRESSION EVALUATION
// ============================================================================

/**
 * Parse fallback expression into main and fallback parts
 */
function parseFallbackExpression(expression: string): FallbackExpression | null {
  const fallbackMatch = expression.match(/^(.+?)\s*\|\|\s*(.+?)$/)
  if (!fallbackMatch) return null

  const [, mainExpr, fallbackExpr] = fallbackMatch
  return { mainExpr: mainExpr.trim(), fallbackExpr: fallbackExpr.trim() }
}

/**
 * Extract string literal value from quoted expression
 */
function extractStringLiteral(expression: string): string | null {
  if (
    (expression.startsWith("'") && expression.endsWith("'")) ||
    (expression.startsWith('"') && expression.endsWith('"'))
  ) {
    return expression.slice(1, -1)
  }
  return null
}

/**
 * Evaluate individual expressions with security
 */
export function evaluateExpression(
  expression: string,
  data: Row[] | null,
  loading: boolean = false,
): any {
  if (loading || !data || !data.length) {
    return undefined
  }

  // Handle data[index].nested.field patterns

  // Validate expression to prevent code injection
  if (!isExpressionSafe(expression)) {
    console.warn('Potentially unsafe expression blocked:', expression)
    return undefined
  }

  // Handle data[index].field patterns
  const dataIndexMatch = expression.match(/^data\[(\d+)\]\.(.+)$/)
  if (dataIndexMatch) {
    const [, index, fieldPath] = dataIndexMatch
    const rowIndex = parseInt(index)

    if (data[rowIndex]) {
      return getNestedValue(data[rowIndex], fieldPath)
    }
    return undefined
  }

  // Handle data.length
  if (expression === 'data.length') {
    return data.length
  }

  // Handle simple field access (uses first row)
  if (data.length > 0) {
    const firstRow = data[0]
    if (firstRow && firstRow[expression] !== undefined) {
      return firstRow[expression]
    }
  }

  return undefined
}

/**
 * Evaluate fallback expressions with security
 */
export function evaluateFallback(
  expression: string,
  data: Row[],
  loading: boolean = false,
): string {
  try {
    const fallback = parseFallbackExpression(expression)

    if (fallback) {
      const { mainExpr, fallbackExpr } = fallback

      if (loading) {
        const fallbackText = extractStringLiteral(fallbackExpr) || fallbackExpr
        return createLoadingPill(fallbackText)
      }

      const mainValue = evaluateExpression(mainExpr, data, loading)

      if (mainValue !== undefined && mainValue !== null && mainValue !== '') {
        return String(mainValue)
      } else {
        const stringLiteral = extractStringLiteral(fallbackExpr)
        if (stringLiteral !== null) {
          return stringLiteral
        } else {
          const fallbackValue = evaluateExpression(fallbackExpr, data, loading)
          return fallbackValue !== undefined ? String(fallbackValue) : fallbackExpr
        }
      }
    } else {
      if (loading) {
        return createLoadingPill(expression)
      }
      const value = evaluateExpression(expression, data, loading)
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

// ============================================================================
// TEMPLATE PROCESSING
// ============================================================================

/**
 * Process field expressions within loop templates
 */
function processFieldExpression(
  fieldExpr: string,
  item: any,
  index: number,
  allowNestedAccess: boolean = true,
): string {
  const trimmed = fieldExpr.trim()

  if (trimmed === '@index') {
    return String(index)
  }

  if (trimmed === '.') {
    return String(item)
  }

  console.log('Processing field expression:', trimmed, 'with item:', item)

  if (!isFieldExpressionSafe(trimmed)) {
    console.warn('Potentially unsafe field expression blocked:', trimmed)
    return `unsafe{${trimmed}}`
  }

  const fallback = parseFallbackExpression(trimmed)
  if (fallback) {
    const { mainExpr, fallbackExpr } = fallback
    let mainValue: any

    if (allowNestedAccess && mainExpr.includes('.')) {
      mainValue = getNestedValue(item, mainExpr)
    } else {
      mainValue = item[mainExpr]
    }

    if (mainValue !== undefined && mainValue !== null && mainValue !== '') {
      return String(mainValue)
    } else {
      const stringLiteral = extractStringLiteral(fallbackExpr)
      if (stringLiteral !== null) {
        return stringLiteral
      } else {
        let fallbackValue: any
        if (allowNestedAccess && fallbackExpr.includes('.')) {
          fallbackValue = getNestedValue(item, fallbackExpr)
        } else {
          fallbackValue = item[fallbackExpr]
        }
        return fallbackValue !== undefined ? String(fallbackValue) : fallbackExpr
      }
    }
  } else {
    let value: any
    if (allowNestedAccess && trimmed.includes('.')) {
      value = getNestedValue(item, trimmed)
    } else {
      value = item[trimmed]
    }
    return value !== undefined ? String(value) : ``
  }
}

/**
 * Process loading state for loops
 */
function processLoadingLoop(template: string, limit?: number): string {
  let loopContent = ''
  const actualLimit = Math.min(limit ?? 3, 3) // Max 3 loading items

  for (let i = 0; i < actualLimit; i++) {
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
}

/**
 * Process array field loops
 */
function processArrayLoop(
  template: string,
  arrayData: Row[],
  limit?: number,
  processNestedLoops: (content: string, data: Row[]) => string = (content) => content,
): string {
  if (!Array.isArray(arrayData) || arrayData.length === 0) {
    return ''
  }

  let loopContent = ''

  // need to fix this to check if limit is undefined
  const data = limit !== undefined ? arrayData.slice(0, limit) : arrayData

  data.forEach((item: any, index: number) => {
    item = item[ARRAY_IMPLICIT_COLUMN] !== undefined ? item[ARRAY_IMPLICIT_COLUMN] : item
    let itemContent = template
    console.log('Processing loop item:', item, 'at index:', index)
    itemContent = processNestedLoops(itemContent, [item])
    console.log('After processing nested loops:', itemContent)
    itemContent = itemContent.replace(/\{([^}]+)\}/g, (_fieldMatch: string, fieldExpr: string) =>
      processFieldExpression(fieldExpr, item, index, true),
    )
    console.log('After processing field expressions:', itemContent)
    loopContent += itemContent
  })

  return loopContent
}

/**
 * Process template loops with recursive support
 */
function processLoops(htmlContent: string, context: TemplateContext, data: Row[]): string {
  function findMatchingEach(content: string, startPos: number): number {
    let depth = 1
    let pos = startPos

    while (pos < content.length && depth > 0) {
      const eachStart = content.indexOf('{{#each', pos)
      const eachEnd = content.indexOf('{{/each}}', pos)

      if (eachEnd === -1) break

      if (eachStart !== -1 && eachStart < eachEnd) {
        depth++
        pos = eachStart + 7 // Move past '{{#each'
      } else {
        depth--
        if (depth === 0) return eachEnd
        pos = eachEnd + 9 // Move past '{{/each}}'
      }
    }

    return -1 // No matching {{/each}} found
  }

  function processNestedLoops(content: string, data: Row[]): string {
    return processLoops(content, context, data)
  }

  let result = htmlContent
  let searchPos = 0

  while (true) {
    const eachMatch = result.match(/\{\{#each ([\w_\[\]\.]+)(?: limit=(\d+))?\}\}/)
    if (!eachMatch) break

    const matchStart = result.indexOf(eachMatch[0], searchPos)
    if (matchStart === -1) break

    const contentStart = matchStart + eachMatch[0].length
    const matchingEnd = findMatchingEach(result, contentStart)

    if (matchingEnd === -1) {
      console.warn('No matching {{/each}} found')
      break
    }

    const arrayPath = eachMatch[1]
    const limitStr = eachMatch[2]
    const template = result.substring(contentStart, matchingEnd)

    const limit = limitStr ? parseInt(limitStr) : undefined
    if (limit !== undefined && (isNaN(limit) || limit < 0 || limit > 1000)) {
      console.warn('Invalid or unsafe limit value:', limitStr)
      searchPos = matchingEnd + 9
      continue
    }

    let replacement = ''
    if (context.loading) {
      replacement = processLoadingLoop(template, limit)
    } else {
      if (arrayPath === 'data') {
        replacement = processArrayLoop(template, data, limit, processNestedLoops)
      } else {
        let data2 = evaluateExpression(arrayPath, data, context.loading)
        console.log('Accessed array data for path:', arrayPath, data2)
        replacement = processArrayLoop(template, data2, limit, processNestedLoops)
      }
    }

    result = result.substring(0, matchStart) + replacement + result.substring(matchingEnd + 9)
    searchPos = matchStart + replacement.length
  }

  return result
}

/**
 * Process simple template substitutions {expression}
 */
function processSimpleSubstitutions(text: string, context: TemplateContext): string {
  return text.replace(/\{([^{}]+)\}/g, (_match: string, expression: string) => {
    if (context.loading) {
      return evaluateFallback(
        expression,
        context.queryResults ? [...context.queryResults.data] : [],
        context.loading,
      )
    }

    if (!context.queryResults || !context.queryResults.data) {
      // Handle fallbacks for empty data
      const fallback = parseFallbackExpression(expression)
      if (fallback) {
        const stringLiteral = extractStringLiteral(fallback.fallbackExpr)
        return stringLiteral !== null ? stringLiteral : fallback.fallbackExpr
      }
      return _match
    }

    return evaluateFallback(
      expression,
      context.queryResults ? [...context.queryResults.data] : [],
      context.loading,
    )
  })
}

/**
 * Process template substitutions in markdown text
 */
export function processTemplateSubstitutions(
  text: string,
  queryResults: Results | null,
  loading: boolean = false,
): string {
  const context: TemplateContext = { queryResults, loading }

  // Process loops first, then simple substitutions
  let html = processLoops(text, context, queryResults ? [...(queryResults.data || [])] : [])
  html = processSimpleSubstitutions(html, context)

  return html
}

// ============================================================================
// MARKDOWN CONVERSION
// ============================================================================

/**
 * Generate unique ID for code blocks
 */
function generateCodeBlockId(): string {
  return 'code-block-' + Math.random().toString(36).substr(2, 9)
}

/**
 * Create HTML for code blocks with copy functionality
 */
function createCodeBlockHtml(language: string, code: string, blockId: string): string {
  const lang = language.trim() || 'text'
  const escapedCode = escapeHtml(code.trim())

  return `<div class="md-code-container" data-language="${lang}" data-content="${escapeHtml(code.trim())}" id="${blockId}">
    <pre class="code-block"><code class="language-${lang}">${escapedCode}</code></pre>
    <button class="markdown-copy-button" title="Copy code" onclick="copyCodeBlock('${blockId}')">
      <svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <svg class="check-icon" style="display: none;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </button>
  </div>`
}

/**
 * Extract and replace fenced code blocks with placeholders
 */
function extractCodeBlocks(
  html: string,
  processTemplates?: (text: string) => string,
): { html: string; placeholders: CodeBlockPlaceholder } {
  const codeBlockPlaceholders: CodeBlockPlaceholder = {}
  let codeBlockCounter = 0

  const processedHtml = html.replace(
    /```(\w+)?\n?([\s\S]*?)```/g,
    (_match: string, language: string = '', code: string) => {
      // Process templates inside code blocks if function provided
      const processedCode = processTemplates ? processTemplates(code) : code

      const blockId = generateCodeBlockId()
      const codeBlockHtml = createCodeBlockHtml(language, processedCode, blockId)

      const placeholder = `__CODEBLOCK_${codeBlockCounter}__`
      codeBlockPlaceholders[placeholder] = codeBlockHtml
      codeBlockCounter++
      return placeholder
    },
  )

  return { html: processedHtml, placeholders: codeBlockPlaceholders }
}

/**
 * Process markdown headers
 */
function processHeaders(html: string): string {
  return html
    .replace(/^### (.*\S)[\s]*$/gim, '<h3 class="rendered-markdown-h3">$1</h3>')
    .replace(/^## (.*\S)[\s]*$/gim, '<h2 class="rendered-markdown-h2">$1</h2>')
    .replace(/^# (.*\S)[\s]*$/gim, '<h1 class="rendered-markdown-h1">$1</h1>')
}

/**
 * Process markdown lists
 */
function processLists(html: string): string {
  return html
    .replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>')
    .replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
}

/**
 * Process markdown emphasis (bold and italic)
 */
function processEmphasis(html: string): string {
  return html
    .replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>') // Bold + italic first
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>') // Then bold
    .replace(/\*(.*?)\*/gim, '<em>$1</em>') // Then italic
}
/**
 * Process markdown links with URL validation
 */
function processLinks(html: string): string {
  return html.replace(/\[(.*?)\]\((.*?)\)/gim, (_match: string, text: string, url: string) => {
    if (!isUrlSafe(url)) {
      return text // Just return the text without link
    }
    return `<a href="${url}">${text}</a>`
  })
}

/**
 * Process markdown paragraphs
 */
function processParagraphs(html: string): string {
  return html
    .replace(/\n\n/g, '</p><p>')
    .replace(/<\/p><p><\/p><p>/g, '</p><p>')
    .replace(/^<p><\/p>/, '')
    .replace(/<p><\/p>$/, '')
}

/**
 * Restore code blocks by replacing placeholders
 */
function restoreCodeBlocks(html: string, placeholders: CodeBlockPlaceholder): string {
  let result = html
  Object.keys(placeholders).forEach((placeholder) => {
    result = result.replace(placeholder, placeholders[placeholder])
  })
  return result
}

/**
 * Convert markdown syntax to HTML
 */
export function convertMarkdownToHtml(text: string): string {
  // Extract code blocks first to protect them from other processing
  const { html: htmlWithoutCode, placeholders } = extractCodeBlocks(text)

  // Process other markdown elements
  let html = htmlWithoutCode
  html = processHeaders(html)
  html = processLists(html)
  html = processEmphasis(html)
  html = processLinks(html)
  html = processParagraphs(html)

  // Restore code blocks
  html = restoreCodeBlocks(html, placeholders)

  return html
}

// ============================================================================
// MAIN RENDERER
// ============================================================================

/**
 * Enhanced markdown renderer with templating support, fallbacks, loading state, and security
 */
export function renderMarkdown(
  text: string,
  queryResults: Results | null = null,
  loading: boolean = false,
): string {
  if (!text) return ''

  const codeBlockPlaceholders: { [key: string]: string } = {}
  let codeBlockCounter = 0
  const textWithoutCode = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match: string) => {
    const placeholder = `__CODEBLOCK_${codeBlockCounter}__`
    codeBlockPlaceholders[placeholder] = match
    codeBlockCounter++
    return placeholder
  })

  // 1. Handle template substitutions on raw text (with loading support)
  let html = processTemplateSubstitutions(textWithoutCode, queryResults, loading)

  // Restore code blocks
  Object.keys(codeBlockPlaceholders).forEach((placeholder) => {
    html = html.replace(placeholder, codeBlockPlaceholders[placeholder])
  })

  // 2. Convert markdown to HTML
  html = convertMarkdownToHtml(html)

  // 3. Sanitize the complete HTML
  const sanitized = sanitizeHtml(html)

  // 4. Add CSS for loading animation if in loading state
  if (loading) {
    return generateLoadingCSS() + sanitized
  }

  return sanitized
}
