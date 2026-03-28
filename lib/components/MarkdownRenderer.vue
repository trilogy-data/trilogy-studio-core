<template>
  <div class="markdown-content">
    <div ref="markdownRoot" class="rendered-markdown" v-html="renderedMarkdown"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, nextTick, onMounted, ref, watch, type PropType } from 'vue'
import type { Results } from '../editors/results'
import { renderMarkdown } from '../utility/markdownRenderer'
import { Prism, ensurePrismLanguagesReady } from '../utility/prism'

export default defineComponent({
  name: 'MarkdownRenderer',
  props: {
    markdown: {
      type: String,
      required: true,
      default: '',
    },
    results: {
      type: Object as PropType<Results | null>,
      default: null,
    },
    loading: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const markdownRoot = ref<HTMLElement | null>(null)
    const renderedMarkdown = computed(() => {
      return renderMarkdown(props.markdown, props.results, props.loading)
    })

    const wireMarkdownCodeBlocks = async () => {
      await nextTick()

      if (!markdownRoot.value) {
        return
      }

      const languages = Array.from(
        markdownRoot.value.querySelectorAll<HTMLElement>('pre code[class*="language-"]'),
      ).map((block) =>
        Array.from(block.classList)
          .find((className) => className.startsWith('language-'))
          ?.replace('language-', ''),
      )

      await ensurePrismLanguagesReady(languages)

      markdownRoot.value.querySelectorAll('pre code[class*="language-"]').forEach((block) => {
        Prism.highlightElement(block as HTMLElement)
      })

      markdownRoot.value
        .querySelectorAll<HTMLButtonElement>('.markdown-copy-button')
        .forEach((button) => {
          if (button.dataset.bound === 'true') {
            return
          }

          button.dataset.bound = 'true'
          button.addEventListener('click', async () => {
            const container = button.closest<HTMLElement>('.md-code-container')
            const content = container?.dataset.content ?? ''
            if (!content) {
              return
            }

            try {
              await navigator.clipboard.writeText(content)
              const copyIcon = button.querySelector<HTMLElement>('.copy-icon')
              const checkIcon = button.querySelector<HTMLElement>('.check-icon')
              if (copyIcon && checkIcon) {
                copyIcon.style.display = 'none'
                checkIcon.style.display = 'block'
                window.setTimeout(() => {
                  copyIcon.style.display = 'block'
                  checkIcon.style.display = 'none'
                }, 1500)
              }
            } catch (error) {
              console.error('Failed to copy markdown code block:', error)
            }
          })
        })
    }

    onMounted(() => {
      void wireMarkdownCodeBlocks()
    })

    watch(renderedMarkdown, () => {
      void wireMarkdownCodeBlocks()
    })

    return {
      markdownRoot,
      renderedMarkdown,
    }
  },
})
</script>

<style scoped>
/* Markdown Component Styles */
.markdown-content {
  height: 100%;
  padding: 0px 15px;
  overflow-y: auto;
  flex: 1;
}
</style>

<style>
.rendered-markdown {
  font-family: var(--font-body);
  font-size: var(--font-size);
  line-height: 1.7;
  color: var(--text-color, #333);
}

.rendered-markdown p {
  margin-top: 0.25em;
  margin-bottom: 0.85em;
}

.rendered-markdown ul {
  margin-top: 0.5em;
  margin-bottom: 0.75em;
  padding-left: 2em;
}

.rendered-markdown li {
  margin-bottom: 0.25em;
}

.rendered-markdown a {
  color: var(--link-color, #2196f3);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

.rendered-markdown a:hover {
  border-bottom-color: var(--link-color, #2196f3);
}

.rendered-markdown strong {
  font-weight: 600;
}

.rendered-markdown variable {
  color: var(--special-text);
}

.rendered-markdown em {
  font-style: italic;
  color: var(--em-color, #7f8c8d);
}
.rendered-markdown h1 {
  font-family: var(--font-heading);
  font-size: 1.55em;
  margin-top: 0.35em;
  margin-bottom: 0.5em;
  border-bottom: 2px solid var(--text-color);
  padding-bottom: 0.25em;
  font-weight: 700;
  letter-spacing: -0.025em;
}

.rendered-markdown-h2 {
  font-family: var(--font-heading);
  font-size: 1.2em;
  margin-top: 0.25em;
  margin-bottom: 0.5em;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-color);
}

.rendered-markdown-h3 {
  font-family: var(--font-heading);
  font-size: 1.05em;
  margin-top: 0.5em;
  margin-bottom: 0.25em;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--text-color);
}

.md-admonition {
  margin: 1rem 0;
  padding: 0.125rem 0 0.125rem 1rem;
  border-left: 4px solid var(--border-light, #d0d7de);
  background: transparent;
}

.md-admonition-header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0;
  margin-bottom: 0;
  font-weight: 500;
  letter-spacing: 0;
}

.md-admonition-icon {
  flex: 0 0 auto;
  font-size: 1rem;
}

.md-admonition-body {
  padding: 0;
}

.md-admonition-body > :first-child {
  margin-top: 0;
}

.md-admonition-body > :last-child {
  margin-bottom: 0.35em;
}

.md-admonition-note {
  border-left-color: #0969da;
}

.md-admonition-note .md-admonition-header {
  color: #0969da;
}

.md-admonition-tip {
  border-left-color: #1a7f37;
}

.md-admonition-tip .md-admonition-header {
  color: #1a7f37;
}

.md-admonition-important {
  border-left-color: #8250df;
}

.md-admonition-important .md-admonition-header {
  color: #8250df;
}

.md-admonition-warning {
  border-left-color: #9a6700;
}

.md-admonition-warning .md-admonition-header {
  color: #9a6700;
}

.md-admonition-caution {
  border-left-color: #cf222e;
}

.md-admonition-caution .md-admonition-header {
  color: #cf222e;
}

:root.dark-theme .md-admonition-note .md-admonition-header {
  color: #79c0ff;
}

:root.dark-theme .md-admonition-tip .md-admonition-header {
  color: #3fb950;
}

:root.dark-theme .md-admonition-important .md-admonition-header {
  color: #bc8cff;
}

:root.dark-theme .md-admonition-warning .md-admonition-header {
  color: #d29922;
}

:root.dark-theme .md-admonition-caution .md-admonition-header {
  color: #ff7b72;
}

.md-admonition-body,
.md-admonition-body p,
.md-admonition-body li,
.md-admonition-body strong,
.md-admonition-body em,
.md-admonition-body code {
  color: var(--text-color);
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.loading-pill {
  display: inline-block;
  background: linear-gradient(
    90deg,
    var(--light-bg-color, #f6f8fb) 25%,
    var(--border-color, #d6dde6) 50%,
    var(--light-bg-color, #f6f8fb) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
  border-radius: 4px;
  filter: blur(0.5px);
  vertical-align: middle;
}

.md-code-container {
  position: relative;
  overflow: hidden;
  padding-bottom: 2px;
  margin: 16px 0;
}

.code-container:hover .markdown-copy-button {
  opacity: 1;
}

.rendered-markdown pre.code-block {
  margin: 0px;
  border-radius: 6px;
  border: 1px solid var(--markdown-code-border, var(--border-color, #e1e5e9)) !important;
  background-color: var(--markdown-code-bg, #f8f9fa) !important;
  text-shadow: none !important;
  overflow-x: auto;
}

.rendered-markdown pre.code-block code {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 14px;
  line-height: 1.5;
  color: var(--prism-text, var(--text-color));
  background: transparent !important;
  text-shadow: none !important;
}

.language-sql,
.language-trilogy,
.language-javascript,
.language-typescript,
.language-python,
.language-text {
  text-shadow: none !important;
}
.code-container {
  position: relative;
  overflow: hidden;
  padding-bottom: 2px;
}

.language-sql {
  text-shadow: none !important;
}

.language-trilogy {
  text-shadow: none !important;
}

.code-container:hover .copy-button {
  opacity: 1;
}

pre {
  margin: 0;
  padding: 16px;
  overflow-x: auto;
}

code {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 14px;
  line-height: 1.5;
}

.markdown-copy-button {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px;
  background-color: rgba(240, 240, 240, 0.8);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.2;
  transition:
    opacity 0.2s ease,
    background-color 0.2s ease;
}

.copy-button:hover {
  background-color: rgba(220, 220, 220, 0.9);
}

.copy-button svg {
  color: #555;
  display: block;
}

/* Table styles */
.md-table-wrapper {
  overflow-x: auto;
  margin: 1em 0;
}

.md-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.md-table th,
.md-table td {
  border: 1px solid var(--border-color, #e1e5e9);
  padding: 8px 12px;
}

.md-table th {
  background-color: var(--sidebar-bg, #f8f9fa);
  font-weight: 600;
}

.md-table tbody tr:hover {
  background-color: var(--hover-bg, rgba(0, 0, 0, 0.02));
}
</style>
