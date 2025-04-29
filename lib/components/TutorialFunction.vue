// FunctionDoc.vue
<template>
  <div class="function-doc">
    <div class="function-header">
      <h3 class="function-name">{{ name }}</h3>
      <button class="function-example-toggle" @click="showExample = !showExample">
        {{ showExample ? 'Hide Example' : 'Show Example' }}
      </button>
    </div>

    <div class="function-description">{{ description }}</div>

    <div class="function-metadata">
      <div class="function-metadata-row">
        <div class="function-metadata-label">Inputs:</div>
        <div class="function-metadata-value">
          <span v-if="func.inputTypes.length === 0" class="function-metadata-empty">No inputs</span>
          <div v-else class="function-metadata-tags">
            <span
              v-for="(type, index) in func.inputTypes"
              :key="index"
              class="function-metadata-tag"
              >{{ type }}</span
            >
          </div>
        </div>
      </div>

      <div class="function-metadata-row">
        <div class="function-metadata-label">Output:</div>
        <div class="function-metadata-value">
          <span class="function-metadata-tag">{{ func.outputType }}</span>
        </div>
      </div>

      <div class="function-metadata-row">
        <div class="function-metadata-label">Purpose:</div>
        <div class="function-metadata-value">
          <span :class="purposeClass">
            {{ func.outputPurpose }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="showExample" class="function-example">
      <div class="function-example-label">Example:</div>
      <pre class="function-example-code">{{ func.example }}</pre>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue'

export interface FunctionInfo {
  inputTypes: string[]
  outputType: string
  outputPurpose: string
  example: string
}

export default defineComponent({
  name: 'FunctionDoc',
  props: {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    func: {
      type: Object as () => FunctionInfo,
      required: true,
    },
  },
  setup(props) {
    const showExample = ref(false)

    const purposeClass = computed(() => {
      const purpose = props.func.outputPurpose.toLowerCase()
      return ['function-purpose', `function-purpose-${purpose}`]
    })

    return {
      showExample,
      purposeClass,
    }
  },
})
</script>

<style scoped>
.function-doc {
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 16px;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: var(--font-size);
}

.function-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.function-name {
  margin: 0;
  font-size: var(--big-font-size);
  font-weight: 600;
  color: var(--special-text);
}

.function-example-toggle {
  background-color: var(--button-bg);
  color: var(--text-color);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: var(--button-font-size);
  cursor: pointer;
  transition: background-color 0.2s;
}

.function-example-toggle:hover {
  background-color: var(--button-mouseover);
}

.function-description {
  margin-bottom: 12px;
  line-height: 1.5;
}

.function-metadata {
  background-color: var(--result-window-bg);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 12px;
}

.function-metadata-row {
  display: flex;
  margin-bottom: 8px;
}

.function-metadata-row:last-child {
  margin-bottom: 0;
}

.function-metadata-label {
  flex: 0 0 80px;
  font-weight: 600;
  color: var(--text-color);
}

.function-metadata-value {
  flex: 1;
}

.function-metadata-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.function-metadata-tag {
  background-color: var(--sidebar-bg);
  color: var(--sidebar-font);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: var(--small-font-size);
  font-family: 'Consolas', 'Monaco', monospace;
}

.function-metadata-empty {
  font-style: italic;
  color: var(--text-faint);
}

.function-purpose {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: var(--small-font-size);
  font-weight: 600;
}

.function-purpose-metric {
  background-color: hsla(210, 100%, 50%, 0.2);
  color: hsl(210, 100%, 50%);
}

.function-purpose-property {
  background-color: hsla(150, 100%, 40%, 0.2);
  color: hsl(150, 100%, 35%);
}

.function-purpose-key {
  background-color: hsla(30, 100%, 50%, 0.2);
  color: hsl(30, 100%, 45%);
}

.function-purpose-constant {
  background-color: hsla(270, 100%, 60%, 0.2);
  color: hsl(270, 100%, 55%);
}

.function-example {
  border-top: 1px solid var(--border-light);
  padding-top: 12px;
}

.function-example-label {
  font-weight: 600;
  margin-bottom: 4px;
}

.function-example-code {
  background-color: var(--sidebar-bg);
  color: var(--sidebar-font);
  border-radius: 4px;
  padding: 8px;
  margin: 0;
  overflow-x: auto;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: var(--small-font-size);
}

:global(.dark-theme) .function-purpose-metric {
  color: hsl(210, 100%, 70%);
}

:global(.dark-theme) .function-purpose-property {
  color: hsl(150, 100%, 70%);
}

:global(.dark-theme) .function-purpose-key {
  color: hsl(30, 100%, 70%);
}

:global(.dark-theme) .function-purpose-constant {
  color: hsl(270, 100%, 80%);
}
</style>
