<template>
    <button 
      class="quick-new-editor-button" 
      @click.stop="createNewEditor"
      :data-testid="`quick-new-editor-${connection}`"
      :title="`Create new Trilogy editor for ${connection}`"
    >
      <i class="mdi mdi-file-document-plus-outline"></i>
    </button>
  </template>
  
  <style scoped>
  .quick-new-editor-button {
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--sidebar-list-item-height);
    width: var(--sidebar-list-item-height);
    border-radius: 50%;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .quick-new-editor-button:hover {
    background-color: var(--hover-color);
  }
  
  .quick-new-editor-button i {
    font-size: 16px;
  }
  .sql-overlay {
  position: absolute;
  font-size: 9px;
  font-weight: bold;
  color: var(--text-color, currentColor);
  text-transform: uppercase;
  pointer-events: none;
  margin-top: 2px; /* Adjust to position text within the icon */
}
  </style>
  
  <script lang="ts">
  import { defineComponent, inject } from 'vue'
  import type { EditorStoreType } from '../stores/editorStore'
  
  export default defineComponent({
    name: 'QuickNewEditorButton',
    props: {
      connection: {
        type: String,
        required: true
      }
    },
    setup(props, { emit }) {
      const editorStore = inject<EditorStoreType>('editorStore')
      const saveEditors = inject<Function>('saveEditors')
      const setActiveScreen = inject<Function>('setActiveScreen')
      const setActiveEditor = inject<Function>('setActiveEditor')
  
      if (!editorStore || !saveEditors || !setActiveScreen || !setActiveEditor) {
        throw 'must inject editorStore and saveEditors to QuickNewEditorButton'
      }
  
      const createNewEditor = async () => {
        try {
          // Generate a unique name with timestamp
          const timestamp = Date.now()
          const editorName = `trilogy-new-${props.connection}_${timestamp}`
          
          // Create a new editor with trilogy type
          editorStore.newEditor(
            editorName,
            'preql',
            props.connection,
            ''
          )
          
          // Save editors to persist changes
          await saveEditors()
          
          // Emit event to update screen and select the new editor
          setActiveEditor(editorName)
          setActiveScreen('editors')

        } catch (error) {
          console.error('Failed to create new editor:', error)
        }
      }
  
      return {
        createNewEditor
      }
    }
  })
  </script>