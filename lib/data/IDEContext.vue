<template>
  <slot 
    :active-editor="activeEditor" 
    :editors="editors"
  ></slot>
  </template>
  <script>

  
  export default {
    name: "IDEContextManager",
    data() {
      return {
        editors: [
          { id: 1, name: "index.js" },
          { id: 2, name: "App.vue" },
          { id: 3, name: "styles.css" },
        ],
        activeEditor: null, // Currently active editor
      };
    },
    methods: {
      // Sets the currently active editor
      setActiveEditor(editor) {
        this.activeEditor = editor;
      },
    },
  };
  </script>
  
  <style scoped>
  .ide-context-manager {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  
  header {
    flex-shrink: 0;
  }
  
  main {
    flex: 1;
    overflow: auto;
  }
  
  aside {
    flex-shrink: 0;
  }
  </style>