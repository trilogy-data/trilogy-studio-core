import { describe, it, expect } from 'vitest'
import { convertMarkdownToHtml, renderMarkdown }  from './markdownRenderer'

describe('Markdown Conversion', () => {
  describe('Headers', () => {
    it('should convert markdown headers to HTML', () => {
      expect(convertMarkdownToHtml('# Header 1')).toBe('<h1 class="rendered-markdown-h1">Header 1</h1>')
      expect(convertMarkdownToHtml('## Header 2')).toBe('<h2 class="rendered-markdown-h2">Header 2</h2>')
      expect(convertMarkdownToHtml('### Header 3')).toBe('<h3 class="rendered-markdown-h3">Header 3</h3>')
    })

    it('should handle headers with trailing spaces', () => {
      expect(convertMarkdownToHtml('# Header with spaces   ')).toBe('<h1 class="rendered-markdown-h1">Header with spaces</h1>')
    })

    it('should handle multiple headers', () => {
      const markdown = `# Main Title
## Subtitle
### Section`
      const result = convertMarkdownToHtml(markdown)
      expect(result).toContain('<h1 class="rendered-markdown-h1">Main Title</h1>')
      expect(result).toContain('<h2 class="rendered-markdown-h2">Subtitle</h2>')
      expect(result).toContain('<h3 class="rendered-markdown-h3">Section</h3>')
    })
  })

  describe('Emphasis', () => {
    it('should convert bold text', () => {
      expect(convertMarkdownToHtml('**bold text**')).toBe('<strong>bold text</strong>')
      expect(convertMarkdownToHtml('This is **bold** text')).toBe('This is <strong>bold</strong> text')
    })

    it('should convert italic text', () => {
      expect(convertMarkdownToHtml('*italic text*')).toBe('<em>italic text</em>')
      expect(convertMarkdownToHtml('This is *italic* text')).toBe('This is <em>italic</em> text')
    })

    it('should handle mixed emphasis', () => {
      const markdown = 'This is **bold** and *italic* text'
      const result = convertMarkdownToHtml(markdown)
      expect(result).toBe('This is <strong>bold</strong> and <em>italic</em> text')
    })

    it('should handle nested emphasis', () => {
      expect(convertMarkdownToHtml('***bold italic***')).toBe('<em><strong>bold italic</strong></em>')
    })
  })

  describe('Links', () => {
    it('should convert markdown links to HTML', () => {
      const markdown = '[Google](https://google.com)'
      const result = convertMarkdownToHtml(markdown)
      expect(result).toBe('<a href="https://google.com">Google</a>')
    })

    it('should handle multiple links', () => {
      const markdown = 'Visit [Google](https://google.com) or [GitHub](https://github.com)'
      const result = convertMarkdownToHtml(markdown)
      expect(result).toContain('<a href="https://google.com">Google</a>')
      expect(result).toContain('<a href="https://github.com">GitHub</a>')
    })

    it('should sanitize dangerous URLs', () => {
      const markdown = '[Click me](javascript:alert("xss"))'
      const result = convertMarkdownToHtml(markdown)
      expect(result).toBe('Click me') // Should strip the dangerous link
    })

    it('should handle links with special characters', () => {
      const markdown = '[Special & "chars"](https://example.com/path?q=test&other=value)'
      const result = convertMarkdownToHtml(markdown)
      expect(result).toContain('<a href="https://example.com/path?q=test&other=value">Special &amp; "chars"</a>')
    })
  })

  describe('Lists', () => {
    it('should convert bullet lists with asterisks', () => {
      const markdown = `* Item 1
* Item 2
* Item 3`
      const result = convertMarkdownToHtml(markdown)
      expect(result).toBe('<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>')
    })

    it('should convert bullet lists with dashes', () => {
      const markdown = `- Item 1
- Item 2
- Item 3`
      const result = convertMarkdownToHtml(markdown)
      expect(result).toBe('<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>')
    })

    it('should handle mixed list markers', () => {
      const markdown = `* Item 1
- Item 2
* Item 3`
      const result = convertMarkdownToHtml(markdown)
      expect(result).toBe('<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>')
    })

    it('should handle lists with emphasis', () => {
      const markdown = `* **Bold item**
* *Italic item*`
      const result = convertMarkdownToHtml(markdown)
      expect(result).toContain('<li><strong>Bold item</strong></li>')
      expect(result).toContain('<li><em>Italic item</em></li>')
    })
  })

  describe('Code Blocks', () => {
    it('should convert fenced code blocks', () => {
      const markdown = '```javascript\nconst x = 1;\nconsole.log(x);\n```'
      const result = convertMarkdownToHtml(markdown)
      
      expect(result).toContain('<div class="md-code-container"')
      expect(result).toContain('data-language="javascript"')
      expect(result).toContain('<pre class="code-block">')
      expect(result).toContain('<code class="language-javascript">')
      expect(result).toContain('const x = 1;')
      expect(result).toContain('console.log(x);')
    })

    it('should handle code blocks without language', () => {
      const markdown = '```\nplain text\n```'
      const result = convertMarkdownToHtml(markdown)
      
      expect(result).toContain('data-language="text"')
      expect(result).toContain('<code class="language-text">')
    })

    it('should include copy button functionality', () => {
      const markdown = '```js\ncode\n```'
      const result = convertMarkdownToHtml(markdown)
      
      expect(result).toContain('class="markdown-copy-button"')
      expect(result).toContain('onclick="copyCodeBlock(')
      expect(result).toContain('class="copy-icon"')
      expect(result).toContain('class="check-icon"')
    })

    it('should escape HTML in code blocks', () => {
      const markdown = '```html\n<script>alert("xss")</script>\n```'
      const result = convertMarkdownToHtml(markdown)
      
      expect(result).toContain('&lt;script&gt;')
      expect(result).toContain('&lt;/script&gt;')
      expect(result).not.toContain('<script>')
    })

    it('should handle multiple code blocks', () => {
      const markdown = `First block:
\`\`\`js
const a = 1;
\`\`\`

Second block:
\`\`\`python
b = 2
\`\`\``
      const result = convertMarkdownToHtml(markdown)
      
      expect(result).toContain('language-js')
      expect(result).toContain('language-python')
      expect(result).toContain('const a = 1;')
      expect(result).toContain('b = 2')
    })
  })

  describe('Paragraphs', () => {
    it('should convert double newlines to paragraphs', () => {
      const markdown = `First paragraph.

Second paragraph.

Third paragraph.`
      const result = convertMarkdownToHtml(markdown)
      
      expect(result).toContain('First paragraph.')
      expect(result).toContain('Second paragraph.')
      expect(result).toContain('Third paragraph.')
      expect(result).toContain('</p><p>')
    })

    it('should handle single newlines within paragraphs', () => {
      const markdown = `Line one
Line two
Line three`
      const result = convertMarkdownToHtml(markdown)
      
      expect(result).toContain('Line one\nLine two\nLine three')
    })
  })

  describe('Mixed Content', () => {
    it('should handle complex markdown with all elements', () => {
      const markdown = `# Main Title

This is a paragraph with **bold** and *italic* text.

## Code Example

Here's some JavaScript:

\`\`\`javascript
function hello() {
  console.log("Hello world!");
}
\`\`\`

## Links and Lists

Visit these sites:
* [Google](https://google.com)
* [GitHub](https://github.com)

### Notes

Another paragraph here.`

      const result = convertMarkdownToHtml(markdown)
      
      // Check that all elements are present
      expect(result).toContain('<h1 class="rendered-markdown-h1">Main Title</h1>')
      expect(result).toContain('<h2 class="rendered-markdown-h2">Code Example</h2>')
      expect(result).toContain('<h3 class="rendered-markdown-h3">Notes</h3>')
      expect(result).toContain('<strong>bold</strong>')
      expect(result).toContain('<em>italic</em>')
      expect(result).toContain('<div class="md-code-container"')
      expect(result).toContain('<a href="https://google.com">Google</a>')
      expect(result).toContain('<ul><li>')
    })

    it('should preserve code blocks during other processing', () => {
      const markdown = `# Header

\`\`\`markdown
# This should not become a header
**This should not become bold**
\`\`\`

**This should become bold**`

      const result = convertMarkdownToHtml(markdown)
      
      expect(result).toContain('<h1 class="rendered-markdown-h1">Header</h1>')
      expect(result).toContain('<strong>This should become bold</strong>')
      // Code block content should be escaped, not processed as markdown
      expect(result).toContain('# This should not become a header')
      expect(result).toContain('**This should not become bold**')
      expect(result).not.toContain('<h1 class="rendered-markdown-h1">This should not become a header</h1>')
    })
  })
})

describe('Markdown with Templates', () => {
  const sampleData = {
    data: [
      { name: 'John', role: 'Developer', skills: ['JavaScript', 'React'] },
      { name: 'Jane', role: 'Designer', skills: ['Figma', 'Sketch'] }
    ]
  }

  it('should process templates before markdown conversion', () => {
    const template = `# Team Members

{{#each data}}
## {name}
**Role:** {role}

### Skills
{{#each skills}}
* {.}
{{/each}}
{{/each}}`

    const result = renderMarkdown(template, sampleData)
    
    expect(result).toContain('<h1 class="rendered-markdown-h1">Team Members</h1>')
    expect(result).toContain('<h2 class="rendered-markdown-h2">John</h2>')
    expect(result).toContain('<h2 class="rendered-markdown-h2">Jane</h2>')
    expect(result).toContain('<strong>Role:</strong> Developer')
    expect(result).toContain('<strong>Role:</strong> Designer')
    expect(result).toContain('<ul><li>JavaScript</li>')
    expect(result).toContain('<ul><li>Figma</li>')
  })

  it('should handle templates in code blocks correctly', () => {
    const template = `# API Response

\`\`\`json
{
  "name": "{data[0].name}",
  "role": "{data[0].role}"
}
\`\`\`

**Name:** {data[0].name}`

    const result = renderMarkdown(template, sampleData)
    
    // Templates in code blocks should not be processed
    expect(result).toContain('"{data[0].name}"')
    expect(result).toContain('"{data[0].role}"')
    
    // Templates outside code blocks should be processed
    expect(result).toContain('<strong>Name:</strong> John')
  })

  it('should handle fallbacks in markdown context', () => {
    const template = `# {data[0].name || "Unknown User"}

**Email:** {data[0].email || "No email provided"}

**Status:** {data[0].status || "Active"}`

    const result = renderMarkdown(template, sampleData)
    
    expect(result).toContain('<h1 class="rendered-markdown-h1">John</h1>')
    expect(result).toContain('<strong>Email:</strong> No email provided')
    expect(result).toContain('<strong>Status:</strong> Active')
  })
})