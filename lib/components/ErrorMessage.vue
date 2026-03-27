<template>
  <div :class="[messageClass, { 'message-compact': compact }]" ref="messageContainer">
    <div class="message-shell">
      <div class="message-header">
        <div class="message-header-main">
          <span class="message-badge">{{ badgeLabel }}</span>
          <span v-if="resolvedTitle" class="message-title">{{ resolvedTitle }}</span>
        </div>
        <div v-if="showCompactTabs" class="message-tabs" role="tablist" aria-label="Error details">
          <button
            v-for="tab in availableCompactTabs"
            :key="tab.id"
            class="message-tab"
            :class="{ active: activeTab === tab.id }"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
      <div class="message-body">
        <div v-if="showPrimaryBody && hasMessageContent" class="message-text" data-testid="error-text">
          <slot v-if="$slots.default"></slot>
          <span v-else>{{ details }}</span>
        </div>
        <div
          v-if="showSecondaryBody && !hasSecondaryContent"
          class="message-empty-state"
        >
          No additional context available.
        </div>
        <div
          v-if="showStackedFilters || (showSecondaryBody && normalizedFilters.length)"
          class="message-query-block"
        >
          <div class="message-query-header">
            <span class="message-query-label">Active Filters</span>
          </div>
          <pre class="message-query">{{ formattedFilters }}</pre>
        </div>
        <div
          v-if="showStackedQuery || (showSecondaryBody && query)"
          class="message-query-block"
        >
          <div class="message-query-header">
            <span class="message-query-label">Trilogy Query</span>
            <button v-if="canCopy" class="message-copy-button" type="button" @click="copyQuery">
              {{ copyLabel }}
            </button>
          </div>
          <pre class="message-query">{{ query }}</pre>
        </div>
      </div>
      <div v-if="showAction" class="message-action">
        <slot name="action"></slot>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import type { PropType } from 'vue'

export interface ErrorFilter {
  source?: string
  value: string
}

export default {
  name: 'MessageComponent',
  props: {
    type: {
      type: String as () => 'error' | 'information',
      default: 'error',
      validator: (value: string) => ['error', 'information'].includes(value),
    },
    title: {
      type: String,
      default: '',
    },
    details: {
      type: String,
      default: '',
    },
    query: {
      type: String,
      default: '',
    },
    filters: {
      type: Array as PropType<ErrorFilter[]>,
      default: () => [],
    },
    compact: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      copied: false,
      activeTab: 'primary' as 'primary' | 'secondary',
    }
  },
  computed: {
    messageClass(): string {
      return this.type === 'information' ? 'information-message' : 'error-message'
    },
    badgeLabel(): string {
      return this.type === 'information' ? 'Info' : 'Error'
    },
    resolvedTitle(): string {
      return this.title || ''
    },
    hasMessageContent(): boolean {
      return Boolean(this.$slots.default || this.details)
    },
    canCopy(): boolean {
      return typeof navigator !== 'undefined' && Boolean(navigator.clipboard)
    },
    copyLabel(): string {
      return this.copied ? 'Copied' : 'Copy'
    },
    normalizedFilters(): ErrorFilter[] {
      return (this.filters || []).filter(
        (filter) => typeof filter?.value === 'string' && filter.value.trim(),
      )
    },
    formattedFilters(): string {
      return this.normalizedFilters
        .map((filter) => {
          if (filter.source && filter.source !== 'global') {
            return `[${filter.source}] ${filter.value}`
          }
          return filter.value
        })
        .join('\n')
    },
    hasSecondaryContent(): boolean {
      return Boolean(this.query || this.normalizedFilters.length)
    },
    availableCompactTabs(): Array<{ id: 'primary' | 'secondary'; label: string }> {
      const tabs: Array<{ id: 'primary' | 'secondary'; label: string }> = [
        { id: 'primary', label: this.type === 'information' ? 'Info' : 'Error' },
      ]

      if (this.hasSecondaryContent) {
        tabs.push({
          id: 'secondary',
          label: this.query ? 'Query' : 'Context',
        })
      }

      return tabs
    },
    showCompactTabs(): boolean {
      return this.compact && this.availableCompactTabs.length > 1
    },
    showPrimaryBody(): boolean {
      return !this.compact || this.activeTab === 'primary'
    },
    showSecondaryBody(): boolean {
      return this.compact && this.activeTab === 'secondary'
    },
    showStackedFilters(): boolean {
      return !this.compact && this.normalizedFilters.length > 0
    },
    showStackedQuery(): boolean {
      return !this.compact && Boolean(this.query)
    },
    showAction(): boolean {
      return Boolean(this.$slots.action) && (!this.compact || this.activeTab === 'primary')
    },
  },
  watch: {
    availableCompactTabs(nextTabs: Array<{ id: 'primary' | 'secondary'; label: string }>) {
      if (!nextTabs.some((tab) => tab.id === this.activeTab)) {
        this.activeTab = 'primary'
      }
    },
  },
  methods: {
    async copyQuery() {
      if (!this.query || !this.canCopy) {
        return
      }
      await navigator.clipboard.writeText(this.query)
      this.copied = true
      window.setTimeout(() => {
        this.copied = false
      }, 1200)
    },
  },
}
</script>

<style scoped>
.error-message,
.information-message {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: left;
  padding: 12px;
  font-size: 14px;
  box-shadow: var(--trilogy-embed-surface-shadow, 0 1px 2px rgba(15, 23, 42, 0.08));
  height: 100%;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  min-height: 0;
  box-sizing: border-box;
  border-radius: 10px;
  overflow: hidden;
  align-self: stretch;
  flex: 1 1 auto;
  background: var(--trilogy-embed-floating-surface-strong, rgba(255, 255, 255, 0.96));
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
  border: 1px solid var(--trilogy-embed-overlay-border, rgba(148, 163, 184, 0.18));
}

.error-message {
  border-left: 3px solid var(--trilogy-embed-delete-color, var(--delete-color, #dc2626));
}

.information-message {
  border-left: 3px solid var(--trilogy-embed-special-text, var(--special-text, #2563eb));
}

.message-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  height: 100%;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
}

.message-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.message-header-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.message-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.error-message .message-badge {
  color: var(--trilogy-embed-delete-color, var(--delete-color, #dc2626));
  background: rgba(220, 38, 38, 0.1);
  border-color: rgba(220, 38, 38, 0.16);
}

.information-message .message-badge {
  color: var(--trilogy-embed-special-text, var(--special-text, #2563eb));
  background: rgba(var(--trilogy-embed-special-text-rgb, 37, 99, 235), 0.1);
  border-color: rgba(var(--trilogy-embed-special-text-rgb, 37, 99, 235), 0.16);
}

.message-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
  min-width: 0;
  word-break: break-word;
}

.message-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--trilogy-embed-panel-header-bg, #f6f8fb);
  border: 1px solid var(--trilogy-embed-border-light, #e1e6ed);
}

.message-tab {
  border: 0;
  background: transparent;
  color: var(--trilogy-embed-text-muted, var(--text-color-muted, #64748b));
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  line-height: 1.2;
}

.message-tab:hover {
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
}

.message-tab.active {
  background: var(--trilogy-embed-bg, var(--bg-color, #ffffff));
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
  box-shadow: var(--trilogy-embed-surface-shadow, 0 1px 2px rgba(15, 23, 42, 0.08));
}

.message-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--trilogy-embed-bg, var(--bg-color, #ffffff));
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
  border: 1px solid var(--trilogy-embed-border-light, #e1e6ed);
  max-height: 180px;
  overflow: auto;
  min-width: 0;
}

.message-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
}

.message-query-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  min-width: 0;
}

.message-query-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.message-query-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--trilogy-embed-dashboard-helper-text, var(--dashboard-helper-text, #425466));
}

.message-copy-button {
  border: 1px solid var(--trilogy-embed-border-light, #e1e6ed);
  background: var(--trilogy-embed-panel-header-bg, #f6f8fb);
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.message-copy-button:hover {
  background: var(--trilogy-embed-button-hover, var(--button-mouseover, #f2f5f9));
}

.message-query {
  margin: 0;
  padding: 12px;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  max-height: 160px;
  min-width: 0;
  background: var(--markdown-code-bg, #f6f8fb);
  color: var(--prism-text, var(--text-color, #1f2937));
  border: 1px solid var(--markdown-code-border, var(--border-color, #e1e6ed));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
}

.message-empty-state {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--trilogy-embed-panel-header-bg, #f6f8fb);
  color: var(--trilogy-embed-text-muted, var(--text-color-muted, #64748b));
  font-size: 12px;
}

.message-action {
  display: flex;
  justify-content: flex-start;
  width: 100%;
  flex-shrink: 0;
}

.message-compact {
  padding: 10px;
  border-radius: 8px;
}

.message-compact .message-shell {
  gap: 8px;
}

.message-compact .message-header {
  align-items: center;
}

.message-compact .message-title {
  font-size: 12px;
}

.message-compact .message-text {
  padding: 8px 10px;
  font-size: 12px;
  max-height: none;
}

.message-compact .message-query {
  padding: 10px;
  font-size: 11px;
  max-height: none;
}

.message-compact .message-body {
  gap: 6px;
}

@media (max-width: 768px) {
  .message-header {
    align-items: stretch;
  }

  .message-tabs {
    width: 100%;
  }

  .message-tab {
    flex: 1;
    text-align: center;
  }
}
</style>
