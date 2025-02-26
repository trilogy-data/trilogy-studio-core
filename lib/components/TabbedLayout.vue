<template>
    <div class="results-container">
        <div class="tabs">
            <button class="tab-button" :class="{ active: activeTab === 'results' }" @click="activeTab = 'results'">
                Editor
            </button>
            <button class="tab-button" :class="{ active: activeTab === 'sql' }" @click="activeTab = 'sql'">
                Results
            </button>
        </div>
        <div class="tab-content">
            <div v-if="activeTab === 'results'" class="editor-entry">
                <slot name="editor"></slot>
            </div>

            <div v-else class="edit-results">
                <slot name="results"></slot>
            </div>
        </div>
    </div>
</template>

<script lang="ts">

export default {
    name: 'TabbedLayoutr',
    props: {
        // results: {
        //     type: Results,
        //     required: true,
        // },
        // generatedSql: String,
    },
    data() {
        return {
            activeTab: 'results',
        }
    },
}
</script>

<style scoped>
.editor-entry {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  /* flex: 1 1 calc(100%-60px); */
  height: calc(100% - 24px);
}

.editor-results {
  display: flex;
  flex-direction: column;
  flex-grow: 0;
  flex-shrink: 1;
  /* flex-wrap: wrap; */
  height: calc(100% - 24px);
}
.results-container {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.tabs {
    display: flex;
    border-bottom: 1px solid var(--border-light);
    background: var(--sidebar-bg);
    height:40px;
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

.tab-content {
    flex: 1;
    overflow: auto;
}




</style>