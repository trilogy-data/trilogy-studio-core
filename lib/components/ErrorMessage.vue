<template>
  <div :class="messageClass" ref="messageContainer">
    <div class="message-header">
      <span class="message-badge">{{ badgeLabel }}</span>
      <span class="message-title">{{ resolvedTitle }}</span>
    </div>
    <div v-if="hasMessageContent" class="message-text" data-testid="error-text">
      <slot v-if="$slots.default"></slot>
      <span v-else>{{ details }}</span>
    </div>
    <div v-if="query" class="message-query-block">
      <div class="message-query-header">
        <span class="message-query-label">Trilogy Query</span>
        <button
          v-if="canCopy"
          class="message-copy-button"
          type="button"
          @click="copyQuery"
        >
          {{ copyLabel }}
        </button>
      </div>
      <pre class="message-query">{{ query }}</pre>
    </div>
    <div class="message-action">
      <slot name="action"></slot>
    </div>
  </div>
</template>

<script lang="ts">
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
  },
  data() {
    return {
      copied: false,
    }
  },
  computed: {
    messageClass(): string {
      return this.type === 'information' ? 'information-message' : 'error-message'
    },
    badgeLabel(): string {
      return this.type === 'information' ? 'Info' : 'Warning'
    },
    resolvedTitle(): string {
      if (this.title) {
        return this.title
      }
      return this.type === 'information' ? 'Information' : 'Query Error'
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
  gap: 10px;
  padding: 16px;
  justify-content: flex-start;
  font-size: 14px;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12);
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  border-radius: 12px;
}

.error-message {
  background:
    linear-gradient(180deg, rgba(127, 29, 29, 0.1), rgba(15, 23, 42, 0.18)),
    rgba(248, 250, 252, 0.96);
  color: #f8fafc;
  border: 1px solid rgba(248, 113, 113, 0.32);
}

.information-message {
  background:
    linear-gradient(180deg, rgba(30, 64, 175, 0.08), rgba(15, 23, 42, 0.08)),
    rgba(248, 250, 252, 0.96);
  color: #0f172a;
  border: 1px solid rgba(96, 165, 250, 0.28);
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.message-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(15, 23, 42, 0.2);
}

.error-message .message-badge {
  color: #fecaca;
}

.information-message .message-badge {
  color: #1d4ed8;
}

.message-title {
  font-size: 15px;
  font-weight: 700;
}

.error-message .message-title {
  color: #fecaca;
}

.information-message .message-title {
  color: #1e3a8a;
}

.message-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  padding: 12px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.38);
  color: #f1f5f9;
}

.information-message .message-text {
  background: rgba(219, 234, 254, 0.65);
  color: #1e293b;
}

.message-query-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.message-query-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.message-query-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.error-message .message-query-label {
  color: #93c5fd;
}

.information-message .message-query-label {
  color: #1d4ed8;
}

.message-copy-button {
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(15, 23, 42, 0.2);
  color: inherit;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.message-query {
  margin: 0;
  padding: 12px;
  border-radius: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  background: rgba(2, 6, 23, 0.5);
  color: #bfdbfe;
  border: 1px solid rgba(96, 165, 250, 0.16);
}

.message-action {
  display: flex;
  justify-content: center;
  width: 100%;
}
</style>
