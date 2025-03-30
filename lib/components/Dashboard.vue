<script lang="ts" setup>
import { ref, reactive, markRaw, h, computed } from 'vue'
import { GridLayout, GridItem } from 'vue3-grid-layout-next'

// Draggable and resizable states
const draggable = ref(true);
const resizable = ref(true);

// Start with an empty layout
const layout = ref([]);

// Track the next item ID to ensure unique IDs
const nextId = ref(0);

// Track currently edited item
const editingItem = ref(null);
const showQueryEditor = ref(false);
const showMarkdownEditor = ref(false);

// Cell types
const CELL_TYPES = {
  CHART: 'chart',
  MARKDOWN: 'markdown'
};

// Mock connections for dropdown
const connections = ref([
  { id: 1, name: 'PostgreSQL Connection' },
  { id: 2, name: 'MySQL Connection' },
  { id: 3, name: 'MongoDB Connection' },
  { id: 4, name: 'REST API Connection' }
]);

const selectedConnection = ref(connections.value[0]);

// Store for grid item content
const gridItems = reactive(new Map());

// Modal state for adding a new item
const showAddItemModal = ref(false);
const newItemType = ref(CELL_TYPES.CHART);

// Add a new grid item with type
function openAddItemModal() {
  showAddItemModal.value = true;
}

function addItem(type = CELL_TYPES.CHART) {
  const itemId = nextId.value.toString();
  
  // Create grid item
  layout.value.push({
    x: 0, 
    y: 0, 
    w: 4, 
    h: type === CELL_TYPES.MARKDOWN ? 3 : 4, // Markdown cells are smaller by default
    i: itemId,
    static: false
  });
  
  // Initialize with default content based on type
  gridItems.set(itemId, {
    type: type,
    content: type === CELL_TYPES.CHART 
      ? "SELECT * FROM data LIMIT 10" 
      : "# Markdown Cell\nEnter your markdown content here."
  });
  
  nextId.value++;
  showAddItemModal.value = false;
}

// Clear all grid items
function clearItems() {
  layout.value = [];
  gridItems.clear();
  nextId.value = 0;
}

// Edit functions
function openEditor(item) {
  editingItem.value = item;
  const itemData = gridItems.get(item.i);
  
  if (itemData.type === CELL_TYPES.CHART) {
    showQueryEditor.value = true;
  } else if (itemData.type === CELL_TYPES.MARKDOWN) {
    showMarkdownEditor.value = true;
  }
}

// Save content and close editor
function saveContent(content) {
  if (editingItem.value) {
    const itemId = editingItem.value.i;
    const itemData = gridItems.get(itemId);
    
    if (itemData) {
      gridItems.set(itemId, {
        ...itemData,
        content: content
      });
    }
  }
  closeEditors();
}

// Close all editors
function closeEditors() {
  showQueryEditor.value = false;
  showMarkdownEditor.value = false;
  editingItem.value = null;
}

// Get item data
function getItemData(itemId) {
  return gridItems.get(itemId) || { type: CELL_TYPES.CHART, content: '' };
}

// Handle connection change
function onConnectionChange(event) {
  const connectionId = parseInt(event.target.value);
  selectedConnection.value = connections.value.find(conn => conn.id === connectionId) || connections.value[0];
}

// Close the add item modal
function closeAddModal() {
  showAddItemModal.value = false;
}

// Basic markdown renderer
function renderMarkdown(text) {
  if (!text) return '';
  
  // Process headers
  let html = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Process lists
  html = html.replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>');
  html = html.replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>');
  
  // Process bold and italic
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
  
  // Process links
  html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>');
  
  // Process paragraphs
  html = html.replace(/^\s*$/gm, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<\/p><p><\/p><p>/g, '</p><p>');
  
  return html;
}

// Generic Content Editor Component (using render function)
const ContentEditor = {
  props: {
    content: {
      type: String,
      default: ''
    },
    title: {
      type: String,
      required: true
    },
    placeholder: {
      type: String,
      default: 'Enter content here...'
    }
  },
  setup(props, { emit }) {
    const contentText = ref(props.content);
    
    function saveContent() {
      emit('save', contentText.value);
    }
    
    function cancel() {
      emit('cancel');
    }
    
    return { contentText, saveContent, cancel };
  },
  render() {
    return h('div', { class: 'editor-overlay' }, [
      h('div', { class: 'content-editor' }, [
        h('h3', {}, this.title),
        h('textarea', {
          value: this.contentText,
          placeholder: this.placeholder,
          onInput: (e) => this.contentText = e.target.value
        }),
        h('div', { class: 'editor-actions' }, [
          h('button', { onClick: this.saveContent }, 'Save'),
          h('button', { onClick: this.cancel }, 'Cancel')
        ])
      ])
    ]);
  }
};

// Chart Component (using render function)
const ChartComponent = {
  props: {
    itemId: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const query = computed(() => {
      return getItemData(props.itemId).content
    });
    return { query };
  },
  render() {
    return h('div', { class: 'chart-placeholder' }, [
      h('p', {}, 'Chart Component'),
      h('p', { class: 'chart-query' }, this.query)
    ]);
  }
};

// Markdown Component (using render function)
const MarkdownComponent = markRaw({
  props: {
    itemId: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const markdown = computed(() => {
      return getItemData(props.itemId).content;
    });
    return { markdown };
  },
  render() {
    return h('div', { class: 'markdown-content' }, [
      h('div', { 
        class: 'rendered-markdown',
        innerHTML: renderMarkdown(this.markdown)
      })
    ]);
  }
});
</script>

<template>
  <div class="dashboard-container">
    <div class="dashboard-controls">
      <div class="connection-selector">
        <label for="connection">Connection:</label>
        <select id="connection" @change="onConnectionChange">
          <option v-for="conn in connections" :key="conn.id" :value="conn.id">
            {{ conn.name }}
          </option>
        </select>
      </div>
      <div class="grid-actions">
        <button @click="openAddItemModal" class="add-button">Add Item</button>
        <button @click="clearItems" class="clear-button">Clear All</button>
      </div>
    </div>
    
    <div class="grid-container">
      <GridLayout
        :col-num="12"
        :row-height="30"
        :is-draggable="draggable"
        :is-resizable="resizable"
        :layout="layout"
        :vertical-compact="true"
        :use-css-transforms="true"
      >
        <grid-item
          v-for="item in layout"
          :key="item.i"
          :static="item.static"
          :x="item.x"
          :y="item.y"
          :w="item.w"
          :h="item.h"
          :i="item.i"
        >
          <div class="grid-item-content">
            <div class="grid-item-header">
              <span class="item-title">
                {{ getItemData(item.i).type === CELL_TYPES.CHART ? 'Chart' : 'Markdown' }} {{ item.i }}
              </span>
              <button @click="openEditor(item)" class="edit-button">Edit</button>
            </div>
            
            <!-- Render the appropriate component based on cell type -->
            <component 
              :is="getItemData(item.i).type === CELL_TYPES.CHART ? ChartComponent : MarkdownComponent"
              :itemId="item.i" 
            />
          </div>
        </grid-item>
      </GridLayout>
    </div>
    
    <!-- Add Item Modal -->
    <Teleport to="body" v-if="showAddItemModal">
      <div class="editor-overlay">
        <div class="add-item-modal">
          <h3>Add New Item</h3>
          <div class="item-type-selector">
            <label>
              <input type="radio" v-model="newItemType" :value="CELL_TYPES.CHART"> 
              Chart
            </label>
            <label>
              <input type="radio" v-model="newItemType" :value="CELL_TYPES.MARKDOWN"> 
              Markdown
            </label>
          </div>
          <div class="editor-actions">
            <button @click="addItem(newItemType)" class="add-button">Add</button>
            <button @click="closeAddModal" class="cancel-button">Cancel</button>
          </div>
        </div>
      </div>
    </Teleport>
    
    <!-- Content Editors -->
    <Teleport to="body" v-if="showQueryEditor && editingItem">
      <ContentEditor 
        :content="getItemData(editingItem.i).content" 
        :title="'Edit Query'"
        :placeholder="'Enter your SQL query here...'"
        @save="saveContent" 
        @cancel="closeEditors" 
      />
    </Teleport>
    
    <Teleport to="body" v-if="showMarkdownEditor && editingItem">
      <ContentEditor 
        :content="getItemData(editingItem.i).content" 
        :title="'Edit Markdown'"
        :placeholder="'Enter markdown content here...'"
        @save="saveContent" 
        @cancel="closeEditors" 
      />
    </Teleport>
  </div>
</template>

<style>
.dashboard-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.dashboard-controls {
  display: flex;
  justify-content: space-between;
  padding: 15px;
  background-color: #f5f5f5;
  border-bottom: 1px solid #ddd;
}

.connection-selector {
  display: flex;
  align-items: center;
}

.connection-selector label {
  margin-right: 10px;
  font-weight: bold;
}

.connection-selector select {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background-color: white;
  min-width: 200px;
}

.grid-actions {
  display: flex;
  gap: 10px;
}

.grid-actions button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.add-button {
  background-color: #4caf50;
  color: white;
}

.clear-button {
  background-color: #f44336;
  color: white;
}

.grid-container {
  flex: 1;
  overflow: auto;
  padding: 15px;
}

.vue-grid-layout {
  background: #f0f0f0;
  height: 100%;
}

.vue-grid-item:not(.vue-grid-placeholder) {
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.vue-grid-item .resizing {
  opacity: 0.9;
}

.vue-grid-item .static {
  background: #f8f8f8;
}

.grid-item-content {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.grid-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background-color: #f5f5f5;
  border-bottom: 1px solid #ddd;
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
}

.item-title {
  font-weight: bold;
}

.edit-button {
  padding: 4px 8px;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.chart-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 15px;
  color: #666;
}

.chart-query {
  font-family: monospace;
  font-size: 12px;
  margin-top: 10px;
  padding: 8px;
  background-color: #f8f8f8;
  border: 1px solid #ddd;
  border-radius: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vue-draggable-handle {
  position: absolute;
  width: 20px;
  height: 20px;
  top: 0;
  left: 0;
  background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><circle cx='5' cy='5' r='5' fill='#999999'/></svg>")
    no-repeat;
  background-position: bottom right;
  padding: 0 8px 8px 0;
  background-repeat: no-repeat;
  background-origin: content-box;
  box-sizing: border-box;
  cursor: pointer;
}

/* Query Editor Overlay */
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

.content-editor, .add-item-modal {
  width: 80%;
  max-width: 800px;
  background-color: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.content-editor h3, .add-item-modal h3 {
  margin-top: 0;
  margin-bottom: 15px;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.content-editor textarea {
  width: 100%;
  height: 200px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
  resize: vertical;
  margin-bottom: 15px;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.editor-actions button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.add-button, .editor-actions button:first-child {
  background-color: #4caf50;
  color: white;
}

.clear-button, .cancel-button, .editor-actions button:last-child {
  background-color: #f44336;
  color: white;
}

/* Add Item Modal */
.add-item-modal {
  max-width: 500px;
}

.item-type-selector {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.item-type-selector label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

/* Markdown Component Styles */
.markdown-content {
  height: 100%;
  padding: 15px;
  overflow: auto;
}

.rendered-markdown {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.5;
}

.rendered-markdown h1 {
  font-size: 1.8em;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.2em;
}

.rendered-markdown h2 {
  font-size: 1.5em;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

.rendered-markdown h3 {
  font-size: 1.2em;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

.rendered-markdown p {
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

.rendered-markdown ul {
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  padding-left: 2em;
}

.rendered-markdown a {
  color: #2196f3;
  text-decoration: none;
}

.rendered-markdown a:hover {
  text-decoration: underline;
}
</style>