<template>
    <div class="editor-list">
      <h2 class="text-lg font-bold mb-2">Open Editors</h2>
      <ul class="space-y-1">
        <li 
          v-for="editor in editors" 
          :key="editor.id" 
          class="editor-item p-2 cursor-pointer hover:bg-gray-200 rounded"
          @click="onEditorClick(editor)"
        >
          {{ editor.name }}
        </li>
      </ul>
    </div>
  </template>
  
  <script>
  export default {
    name: "EditorList",
    props: {
      // List of editors passed as a prop
      editors: {
        type: Array,
        required: true,
        default: () => [],
      },
    },
    methods: {
      // Emit an event when an editor is clicked
      onEditorClick(editor) {
        this.$emit("editor-selected", editor);
      },
    },
  };
  </script>
  
  <style scoped>
  .editor-item {
    border: 1px solid  var(--border-light); 
    padding: 2px;
  }
  .editor-list {
    border: 1px solid var(--border-light);
    border-radius: 0px;
    padding: 16px;
    height: 100%
  }
  </style>