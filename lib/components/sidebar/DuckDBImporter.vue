<template>
  <button
    type="button"
    class="file-upload-container"
    :class="{ 'drag-active': isDragging, loading: isLoading }"
    :data-testid="`duckdb-importer-${connection.name}`"
    @click="openFilePicker"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <input
      type="file"
      accept=".csv,.parquet,.db,.sqlite"
      @change="handleFileInput"
      ref="fileInput"
      class="hidden-input"
    />
    <div
      v-if="successMessage && !isLoading"
      class="upload-row upload-success"
      :data-testid="`duckdb-import-success-${connection.name}`"
    >
      <i class="mdi mdi-check-circle-outline upload-icon"></i>
      <span class="upload-copy truncate-text">{{ successMessage }}</span>
    </div>
    <div v-else-if="!isLoading" class="upload-row">
      <i class="mdi mdi-plus upload-icon"></i>
      <span class="upload-copy">
        <span class="upload-label">Import data...</span>
        <span class="upload-subtitle">CSV, Parquet, DB</span>
      </span>
    </div>
    <div
      v-else
      class="upload-row loading-container"
      :data-testid="`duckdb-import-loading-${connection.name}`"
    >
      <span class="spinner"></span>
      <span class="upload-copy truncate-text">{{ loadingMessage }}</span>
    </div>
  </button>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import type DuckDBConnection from '../../connections/duckdb'
import type SQLiteConnection from '../../connections/sqlite'

type ImportableConnection = DuckDBConnection | SQLiteConnection

export default defineComponent({
  name: 'FileUpload',
  props: {
    connection: {
      type: Object as () => ImportableConnection,
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

    const openFilePicker = () => {
      fileInput.value?.click()
    }

    const handleDrop = async (event: DragEvent) => {
      isDragging.value = false

      if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0]
        if (isValidFileType(file)) {
          await processFile(file)
        } else {
          alert('Please drop a CSV, Parquet, or database file')
        }
      }
    }

    const isValidFileType = (file: File): boolean => {
      return (
        file.type === 'text/csv' ||
        file.name.endsWith('.csv') ||
        file.type === 'application/octet-stream' ||
        file.name.endsWith('.parquet') ||
        file.name.endsWith('.db') ||
        file.name.endsWith('.sqlite')
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
          successMessage.value = `Successfully attached database ${result.name}`
        } else {
          successMessage.value = `Successfully imported ${result.name}`
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
      openFilePicker,
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
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 26px;
  padding: 2px 0 2px 2px;
  border: none;
  background: transparent;
  color: var(--text-color);
  text-align: left;
  transition:
    color 0.18s ease,
    background-color 0.18s ease;
  width: 100%;
  margin: 0;
  box-shadow: none;
  cursor: pointer;
}

.file-upload-container:hover {
  background: transparent;
  color: var(--special-text);
}

.drag-active {
  color: var(--special-text);
}

.loading {
  cursor: default;
}

.upload-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.upload-copy {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  font-size: var(--sidebar-sub-item-font-size);
}

.upload-label {
  color: inherit;
  white-space: nowrap;
}

.upload-subtitle {
  color: var(--text-faint);
  font-size: 11px;
  white-space: nowrap;
}

.upload-icon {
  font-size: 14px;
  color: var(--special-text);
}

.upload-success .upload-icon {
  color: #16a34a;
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

.loading-container {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(0, 0, 0, 0.1);
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
  white-space: nowrap;
}
</style>
