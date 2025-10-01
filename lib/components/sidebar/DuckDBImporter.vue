<template>
  <div
    class="file-upload-container"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
    :class="{ 'drag-active': isDragging }"
  >
    <div class="upload-area">
      <div v-if="successMessage && !isLoading" class="success-message">
        <span>{{ successMessage }}</span>
      </div>
      <div v-else-if="!isLoading">
        <div class="truncate-text">
          Drag or<label class="file-input-label">
            select
            <input
              type="file"
              accept=".csv,.parquet,.db"
              @change="handleFileInput"
              ref="fileInput"
              class="hidden-input"
            />
          </label>
          CSV/Parquet or DuckDB DB
        </div>
      </div>

      <div v-else class="loading-container">
        <span class="spinner"></span>
        <span>{{ loadingMessage }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import DuckDBConnection from '../../connections/duckdb'

export default defineComponent({
  name: 'FileUpload',
  props: {
    connection: {
      type: Object as () => DuckDBConnection,
      required: true,
    },
  },
  setup(props) {
    const isDragging = ref(false)
    const isLoading = ref(false)
    const loadingMessage = ref('Processing file...')
    const successMessage = ref('')
    const fileInput = ref<HTMLInputElement | null>(null)

    const handleDragOver = () => {
      isDragging.value = true
    }

    const handleDragLeave = () => {
      isDragging.value = false
    }

    const handleFileInput = async (event: Event) => {
      const target = event.target as HTMLInputElement
      if (target.files && target.files.length > 0) {
        await processFile(target.files[0])
      }
    }

    const handleDrop = async (event: DragEvent) => {
      isDragging.value = false

      if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0]
        if (isValidFileType(file)) {
          await processFile(file)
        } else {
          alert('Please drop a CSV, Parquet, or DuckDB file')
        }
      }
    }

    const isValidFileType = (file: File): boolean => {
      return (
        file.type === 'text/csv' ||
        file.name.endsWith('.csv') ||
        file.type === 'application/octet-stream' ||
        file.name.endsWith('.parquet') ||
        file.name.endsWith('.db')
      )
    }

    const processFile = async (file: File) => {
      try {
        isLoading.value = true
        loadingMessage.value = `Processing ${file.name}...`

        // Use the connection's importFile method
        const result = await props.connection.importFile(file, (message: string) => {
          loadingMessage.value = message
        })

        // Update success message based on result type
        if (result.type === 'database') {
          successMessage.value = `Successfully attached database <strong>${result.name}</strong>`
        } else {
          successMessage.value = `Successfully imported <strong>${result.name}</strong>`
        }

        isLoading.value = false

        // Clear success message after 5 seconds
        setTimeout(() => {
          successMessage.value = ''
        }, 5000)

        // Reset file input
        if (fileInput.value) {
          fileInput.value.value = ''
        }
      } catch (error) {
        isLoading.value = false
        console.error(`Error processing ${file.name}:`, error)
        alert(
          `Error processing ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    return {
      isDragging,
      isLoading,
      loadingMessage,
      successMessage,
      fileInput,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleFileInput,
    }
  },
})
</script>

<style scoped>
.file-upload-container {
  border: 2px dashed #ccc;
  text-align: center;
  transition: all 0.3s ease;
  width: 100%;
  margin-top: 4px;
  margin-bottom: 4px;
  line-height: calc(var(--sidebar-list-item-height) - 8px);
}

.drag-active {
  border-color: #2196f3;
  background-color: rgba(33, 150, 243, 0.1);
}

.icon-container {
  margin-bottom: 10px;
}

.icon-container svg {
  color: #666;
}

.hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.file-input-label {
  color: #2196f3;
  cursor: pointer;
  text-decoration: underline;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  white-space: nowrap;
  line-height: calc(var(--sidebar-list-item-height) - 8px);
}

.spinner {
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top-color: #2196f3;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.success-message {
  background-color: #e6f7e6;
  color: #2e7d32;
  line-height: calc(var(--sidebar-list-item-height) - 8px);
  white-space: nowrap;
}
</style>