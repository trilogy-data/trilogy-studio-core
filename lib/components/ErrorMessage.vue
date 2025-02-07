<template>
    <div v-if="message" class="error-message">
      <span class="error-icon">⚠️</span>
      <span class="error-text">{{ message }}</span>
    </div>
  </template>
  
  <script lang="ts">
  export default {
    name: "ErrorMessage",
    props: {
      message: {
        type: String,
        required: true,
      },
    },
  };
  </script>
  
  <style scoped>
  .error-message {
    background-color: #fef2f2; /* Light red background */
    color: #e60000;            /* Bright red text */
    border-left: 5px solid #e60000; /* A bold left border for emphasis */
    padding: 12px 20px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    margin: 16px 0;
    font-family: 'Arial', sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); /* Soft shadow to lift the banner */
  }
  
  .error-icon {
    margin-right: 12px;
    font-size: 18px;
  }
  
  .error-text {
    flex-grow: 1;
    font-weight: bold;
  }
  </style>
  