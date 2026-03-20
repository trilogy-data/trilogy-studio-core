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
<style scoped src="./tabbedLayoutShell.css"></style>
<style scoped>
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
</style>
