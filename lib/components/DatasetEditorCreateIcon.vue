<template>
    <button 
      @click="formatColumns" 
      :style="buttonStyle"
    >
      Format Columns
    </button>
  </template>
  
  <script>
  export default {
    name: 'ColumnFormatterButton',
    props: {
      name: {
        type: String,
        required: true
      },
      columns: {
        type: Array,
        required: true,
        validator: (value) => {
          return value.every(column => 
            typeof column.name === 'string' &&
            typeof column.type === 'string' &&
            typeof column.primary === 'boolean'
          );
        }
      }
    },
    data() {
      return {
        buttonStyle: {
          padding: '8px 16px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: '500',
          fontSize: '14px'
        }
      }
    },
    methods: {
      
    }
  }
  </script>
  