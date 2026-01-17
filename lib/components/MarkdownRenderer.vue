<template>
  <div class="markdown-content">
    <div class="rendered-markdown" v-html="renderedMarkdown"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, type PropType } from 'vue'
import type { Results } from '../editors/results'
import { renderMarkdown } from '../utility/markdownRenderer'

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
    const renderedMarkdown = computed(() => {
      return renderMarkdown(props.markdown, props.results, props.loading)
    })

    return {
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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.6;
  color: var(--text-color, #333);
}

.rendered-markdown p {
  margin-top: 0.25em;
  margin-bottom: 0.75em;
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
  font-size: 1.8em;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  border-bottom: 2px solid var(--text-color);
  padding-bottom: 0.25em;
  font-weight: 600;
}

.rendered-markdown-h2 {
  font-size: 1.5em;
  margin-top: 0.25em;
  margin-bottom: 0.5em;
  font-weight: 600;
  color: var(--text-color);
}

.rendered-markdown-h3 {
  font-size: 1.2em;
  margin-top: 0.5em;
  margin-bottom: 0.25em;
  font-weight: 600;
  color: var(--text-color);
}

.loading-pill {
  display: inline-block;
  background: linear-gradient(
    90deg,
    var(--bg-color) 25%,
    var(--button-bg) 50%,
    var(--bg-color) 75%
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

.code-block {
  margin: 0px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #e1e5e9);
  background-color: var(--sidebar-bg, #f8f9fa);
  text-shadow: none !important;
  overflow-x: auto;
}

.code-block pre {
  margin: 0;
  padding: 16px;
  overflow-x: auto;
}

.code-block code {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 14px;
  line-height: 1.5;
  text-shadow: none !important;
  color: var(--text-color, #24292f) !important;
}

.language-sql,
.language-trilogy,
.language-javascript,
.language-typescript,
.language-python,
.language-text {
  text-shadow: none !important;
  color: var(--text-color, #24292f) !important;
}
.code-container {
  position: relative;
  overflow: hidden;
  padding-bottom: 2px;
}

.language-sql {
  text-shadow: none !important;
  color: var(--text-color) !important;
}

.language-trilogy {
  text-shadow: none !important;
  color: var(--text-color) !important;
}

.code-block {
  margin: 0px;
  border-radius: 0px;
  border: 0px;
  background-color: var(--sidebar-bg);
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
