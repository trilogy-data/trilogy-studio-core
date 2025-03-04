<template>
    <status-icon 
      :message="statusMessage"
      :status="statusClass"
    />
  </template>
  
  <script setup lang="ts">
  import { computed } from 'vue'
  import StatusIcon from './StatusIcon.vue'
  interface StatusIconProps {
    connection: {
      connected: boolean
      error?: string
    }
  }
  
  const props = defineProps<StatusIconProps>()
  
  // Determine status class and message
  const statusClass = computed(() => {
    if (!props.connection.connected) return 'idle'
    return props.connection.error ? 'failed' : 'connected'
  })
  
  const statusMessage = computed(() => {
    if (!props.connection.connected) return 'Disconnected'
    if (props.connection.error) return props.connection.error
    return 'Connected'
  })
  </script>
  
  <style scoped>
  .status-icon-container {
    display: flex;
    align-items: center;
    margin-left: 5px;
  }
  
  .status-icon {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  
  .status-connected {
    background-color: green;
  }
  
  .status-disconnected {
    background-color: gray;
  }
  
  .status-error {
    background-color: red;
  }
  </style>