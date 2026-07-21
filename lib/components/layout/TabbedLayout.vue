<template>
  <div class="results-container" :class="`view-${activeTab}`">
    <div class="tab-content">
      <div class="editor-entry">
        <slot name="editor" :onQueryStarted="() => (activeTab = 'results')"></slot>
      </div>
      <div v-show="activeTab === 'results'" class="edit-results" ref="resultsPane">
        <slot name="results" :containerHeight="resultsHeight"></slot>
      </div>
      <div v-show="activeTab === 'chat'" class="edit-results chat-entry">
        <slot name="chat"></slot>
      </div>
    </div>
    <nav class="tabs" aria-label="Editor views">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'sql' }"
        @click="activeTab = 'sql'"
        data-testid="editor-tab"
      >
        Editor
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'results' }"
        @click="activeTab = 'results'"
        data-testid="results-tab"
      >
        Results
      </button>
      <button
        v-if="showChat"
        class="tab-button"
        :class="{ active: activeTab === 'chat' }"
        @click="activeTab = 'chat'"
        data-testid="chat-tab"
      >
        Chat
      </button>
    </nav>
  </div>
</template>
<script lang="ts">
import { markRaw } from 'vue'

export default {
  name: 'TabbedLayout',
  props: {
    showChat: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      activeTab: 'sql',
      // Consumers (results table, charts) want an explicit pixel height. The
      // pane is v-show'd, so it measures 0 while hidden — keep the last real
      // measurement rather than publishing a zero.
      resultsHeight: 0,
      resultsObserver: null as ResizeObserver | null,
    }
  },
  mounted() {
    const pane = this.$refs.resultsPane as HTMLElement | undefined
    if (!pane || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const height = pane.getBoundingClientRect().height
      if (height > 0) {
        this.resultsHeight = height
      }
    })
    observer.observe(pane)
    this.resultsObserver = markRaw(observer)
  },
  unmounted() {
    if (this.resultsObserver) {
      this.resultsObserver.disconnect()
      this.resultsObserver = null
    }
  },
  watch: {
    showChat(isVisible: boolean) {
      if (isVisible) {
        this.activeTab = 'chat'
      } else if (this.activeTab === 'chat') {
        this.activeTab = 'results'
      }
    },
  },
}
</script>
<style scoped src="./tabbedLayoutShell.css"></style>
<style scoped>
.editor-entry {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  height: 100%;
  width: 100%;
  position: absolute;
  inset: 0;
}
.edit-results {
  height: 100%;
  width: 100%;
  overflow: auto; /* Allow scrolling within results if needed */
  display: flex;
  flex-direction: column;
  position: absolute;
  inset: 0 0 var(--mobile-editor-toolbar-height, 53px);
  z-index: 2;
}
.chat-entry {
  overflow: hidden;
  inset: 0;
}
.editor-results {
  height: 100%;
}

.view-results :deep(.editor-content),
.view-chat :deep(.editor-content) {
  visibility: hidden;
  pointer-events: none;
}

.view-results :deep(.mobile-editor-toolbar),
.view-chat :deep(.mobile-editor-toolbar) {
  position: relative;
  z-index: 3;
}

.view-chat :deep(.mobile-editor-toolbar) {
  display: none;
}

@media screen and (max-width: 520px) {
  .results-container {
    --mobile-editor-toolbar-height: 49px;
  }
}
</style>
