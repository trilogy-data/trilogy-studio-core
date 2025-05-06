<template>
  <div class="code-container">
    <pre class="code-block"><code ref="codeBlock" :class="codeClass">{{ content }}</code></pre>
    <button @click="copyCode" class="copy-button" title="Copy code">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUpdated } from 'vue'
import Prism from 'prismjs'

// Define your extended SQL language (e.g., "MySQLExtension")
Prism.languages.trilogy = {
  // Inherit all properties from the SQL language definition
  ...Prism.languages.sql,

  // Override or add new keywords
  keyword: [
    // Include original SQL keywords (if using an array)
    ...(Array.isArray(Prism.languages.sql.keyword)
      ? Prism.languages.sql.keyword
      : Prism.languages.sql.keyword
        ? [Prism.languages.sql.keyword]
        : []),
    /\b(?:DATASOURCE)\b/i,
    /\b(?:GRAIN)\b/i,
    /\b(?:ADDRESS)\b/i,
    /\b(?:DEF)\b/i,
    /\b(?:IMPORT)\b/i,
    /\b(?:MERGE)\b/i,
    /\b(?:HAVING_CLAUSE)\b/i,
    /\b(?:WHERE_CLAUSE)\b/i,
    /\b(?:SELECT_LIST)\b/i,
    /\b(?:ORDER_BY)\b/i,
    /\b(?:SELECT_STATEMENT)\b/i,
    /\b(?:SELECT_ITEM)\b/i,
    /\b(?:ALIGN_CLAUSE)\b/i,
    /\b(?:ALIGN_ITEM)\b/i,
    /\b(?:IDENTIFIER)\b/i,
  ],
}

export default defineComponent({
  name: 'CodeBlock',
  props: {
    content: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      default: 'sql',
    },
  },
  emits: ['on-copy'],
  setup(props, { emit }) {
    const codeBlock = ref<HTMLElement | null>(null)

    const codeClass = ref(`language-${props.language}`)

    // Method to copy code to clipboard
    const copyCode = async () => {
      if (codeBlock.value) {
        try {
          await navigator.clipboard.writeText(props.content)
          emit('on-copy', props.content)
        } catch (err) {
          console.error('Failed to copy code: ', err)
        }
      }
    }
    const updateRefs = () => {
      if (codeBlock.value) {
        if (Array.isArray(codeBlock.value)) {
          codeBlock.value.forEach((block) => {
            if (block) Prism.highlightElement(block)
          })
        } else if (codeBlock.value) {
          Prism.highlightElement(codeBlock.value)
        }
      }
    }
    onMounted(() => {
      updateRefs()
    })
    onUpdated(() => {
      updateRefs()
    })
    return {
      codeBlock,
      codeClass,
      copyCode,
    }
  },
})
</script>

<style scoped>
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

.copy-button {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px;
  background-color: rgba(240, 240, 240, 0.8);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
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
</style>
