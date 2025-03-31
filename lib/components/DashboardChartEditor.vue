<script lang="ts" setup>
import { ref, defineEmits } from 'vue'

const props = defineProps<{
  content: string
}>()

const emit = defineEmits(['save', 'cancel'])

const queryText = ref(props.content)

function saveQuery(): void {
  emit('save', queryText.value)
}

function cancel(): void {
  emit('cancel')
}

// Add SQL syntax validation or preview functionality here if needed
</script>

<template>
  <div class="editor-overlay">
    <div class="content-editor">
      <h3>Edit SQL Query</h3>
      <div class="editor-description">
        Enter your SQL query to generate the chart. You can use variables in your query.
      </div>
      <textarea
        v-model="queryText"
        placeholder="SELECT * FROM table WHERE condition"
        class="sql-editor"
      ></textarea>
      <div class="editor-actions">
        <button @click="saveQuery" class="save-button">Save Query</button>
        <button @click="cancel" class="cancel-button">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.content-editor {
  width: 80%;
  max-width: 800px;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border);
}

.content-editor h3 {
  margin-top: 0;
  margin-bottom: 15px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 10px;
  color: var(--text-color);
}

.editor-description {
  margin-bottom: 15px;
  color: var(--text-color-muted);
  font-size: 0.9em;
}

.sql-editor {
  width: 100%;
  height: 250px;
  padding: 10px;
  border: 1px solid var(--border);
  font-family: monospace;
  resize: vertical;
  margin-bottom: 15px;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  font-size: var(--font-size);
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.save-button,
.cancel-button {
  padding: 8px 16px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  font-size: var(--button-font-size);
}

.save-button {
  background-color: var(--special-text);
  color: white;
}

.cancel-button {
  background-color: var(--delete-color);
  color: white;
}
</style>
