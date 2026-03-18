<template>
  <div class="results-container">
    <div class="tabs">
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
    </div>
    <div class="tab-content">
      <div v-if="activeTab === 'sql'" class="editor-entry">
        <slot name="editor" :onQueryStarted="() => (activeTab = 'results')"></slot>
      </div>
      <div v-else class="edit-results">
        <slot name="results"></slot>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
export default {
  name: 'TabbedLayout',
  props: {
    // results: {
    //     type: Results,
    //     required: true,
    // },
    // generatedSql: String,
  },
  data() {
    return {
      activeTab: 'sql',
    }
  },
}
</script>
<style scoped>
.results-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden; /* Prevent content from overflowing */
}
.tab-content {
  flex: 1;
  position: relative;
  height: 100%; /* Subtract tabs height */
  overflow: hidden; /* Changed from auto to hidden */
  display: flex; /* Add flex display */
}
.editor-entry {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  height: 100%;
  width: 100%;
}
.edit-results {
  height: 100%;
  width: 100%;
  overflow: auto; /* Allow scrolling within results if needed */
  display: flex;
  flex-direction: column;
}
.editor-results {
  height: 100%;
}
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border-light);
  background: var(--query-window-bg);
  height: 44px;
  min-height: 44px;
  padding: 0 14px;
  gap: 4px;
}
.tab-button {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  padding: 0 16px;
  border-radius: 0px;
}
.tab-button:hover {
  color: var(--special-text);
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.05);
}
.tab-button.active {
  color: var(--special-text);
  border-bottom: 2px solid var(--special-text);
  border-radius: 0px;
}
</style>
