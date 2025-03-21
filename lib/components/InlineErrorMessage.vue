<template>
    <div class="inline-error-message">
      <span class="error-icon">⚠️</span>
      <span class="error-text"><slot></slot></span>
      <div class="error-action" v-if="$slots.action">
        <slot name="action"></slot>
      </div>
    </div>
  </template>
  
  <script lang="ts">
  export default {
    name: 'InlineErrorMessage',
    props: {},
  }
  </script>
  
  <style scoped>
  .inline-error-message {
    display: inline-flex;
    align-items: center;
    background-color: #fef2f2; /* Light red background */
    color: var(--error-color, #e60000); /* Bright red text */
    border-left: 3px solid #e60000;
    font-family: 'Arial', sans-serif;
    font-size: 12px;
    width: 100%;
    margin-bottom:5px;
    max-width: 100%;
  }
  
  .error-icon {
    font-size: 14px;
    margin-right: 6px;
    flex-shrink: 0;
  }
  
  .error-text {
    font-weight: bold;
    flex-grow: 1;
  }
  
  .error-action {
    margin-left: 8px;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }
  </style>