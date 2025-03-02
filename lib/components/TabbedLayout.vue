<template>
  <div class="results-container">
    <div class="tabs">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'sql' }"
        @click="activeTab = 'sql'"
      >
        Editor
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'results' }"
        @click="activeTab = 'results'"
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
  height: calc(100% - 40px); /* Subtract tabs height */
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
  background: var(--sidebar-bg);
  height: 40px;
  min-height: 40px; /* Ensure consistent height */
}
.tab-button {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.875rem;
  border-bottom: 2px solid transparent;
  padding-left: 20px;
  padding-right: 20px;
  /* max-width:100px; */
}
.tab-button:hover {
  color: #0ea5e9;
}
.tab-button.active {
  color: #0ea5e9;
  border-bottom: 2px solid #0ea5e9;
}
</style>
