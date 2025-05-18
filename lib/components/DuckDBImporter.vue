<template>
  <div
    class="file-upload-container"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
    :class="{ 'drag-active': isDragging }"
  >
    <div class="upload-area">
      <div v-if="lastImportedTable && !isLoading" class="success-message">
        <span
          >Successfully imported <strong>{{ lastImportedTable }}</strong></span
        >
      </div>
      <div v-else-if="!isLoading">
        <div>
          Drag CSV or Parquet file or
          <label class="file-input-label">
            upload
            <input
              type="file"
              accept=".csv,.parquet"
              @change="handleFileInput"
              ref="fileInput"
              class="hidden-input"
            />
          </label>
          as table
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
import * as duckdb from '@duckdb/duckdb-wasm'
import * as arrow from 'apache-arrow'
import BaseConnection from '../connections/base'

export default defineComponent({
  name: 'FileUpload',
  props: {
    db: {
      type: Object as () => duckdb.AsyncDuckDB,
      required: true,
    },
    connection: {
      type: Object as () => BaseConnection,
      required: true,
    },
  },
  setup(props) {
    const isDragging = ref(false)
    const isLoading = ref(false)
    const loadingMessage = ref('Processing file...')
    const lastImportedTable = ref('')
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
          alert('Please drop a CSV or Parquet file')
        }
      }
    }

    const isValidFileType = (file: File): boolean => {
      return (
        file.type === 'text/csv' || 
        file.name.endsWith('.csv') || 
        file.type === 'application/octet-stream' || 
        file.name.endsWith('.parquet')
      )
    }

    const getFileType = (file: File): 'csv' | 'parquet' => {
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        return 'csv'
      } else {
        return 'parquet'
      }
    }

    const processFile = async (file: File) => {
      try {
        isLoading.value = true
        loadingMessage.value = `Processing ${file.name}...`

        // Generate table name from file name
        const fileType = getFileType(file)
        const fileName = file.name.replace(`.${fileType}`, '')
        const tableName = sanitizeTableName(fileName)

        loadingMessage.value = `Creating table ${tableName}...`

        // Register the file in DuckDB's virtual file system
        await props.db.registerFileHandle(
          file.name,
          file,
          duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
          true,
        )

        // Create a connection
        const connection = await props.db.connect()

        try {
          if (fileType === 'csv') {
            await processCSV(connection, file, tableName)
          } else {
            await processParquet(connection, file, tableName)
          }

          // Update state and notify parent
          lastImportedTable.value = tableName
          isLoading.value = false
          props.connection.refreshDatabase('memory')

          // set a timeout to clear the lastImportedTable
          setTimeout(() => {
            lastImportedTable.value = ''
          }, 5000)
        } finally {
          // Always close the connection
          connection.close()
        }
      } catch (error) {
        isLoading.value = false
        console.error(`Error processing ${file.name}:`, error)
        alert(
          `Error processing ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    const processCSV = async (
      connection: duckdb.AsyncDuckDBConnection, 
      file: File, 
      tableName: string
    ) => {
      loadingMessage.value = `Analyzing CSV structure...`

      // First, peek at the file to determine headers and types
      const sampleQuery = await connection.query(`
        SELECT * FROM read_csv_auto('${file.name}', AUTO_DETECT=TRUE, SAMPLE_SIZE=1000) LIMIT 5
      `)

      // Get column names and types from the sample
      const columnInfo = sampleQuery.schema.fields.map((field) => ({
        name: field.name,
        type: mapArrowTypeToDuckDB(field.type),
      }))

      if (columnInfo.length === 0) {
        throw new Error('CSV file has no columns')
      }

      // Create the table with the detected schema
      const columns = columnInfo
        .map((col) => `"${col.name.replace(/[^a-zA-Z0-9_]/g, '_')}" ${col.type}`)
        .join(', ')

      await connection.query(`CREATE TABLE ${tableName} (${columns})`)

      // Insert the data using DuckDB's native CSV reader
      loadingMessage.value = `Importing CSV data...`

      await connection.query(`
        INSERT INTO ${tableName} 
        SELECT * FROM read_csv_auto('${file.name}', 
          AUTO_DETECT=TRUE, 
          HEADER=TRUE,
          SAMPLE_SIZE=-1)
      `)
    }

    const processParquet = async (
      connection: duckdb.AsyncDuckDBConnection, 
      file: File, 
      tableName: string
    ) => {
      loadingMessage.value = `Analyzing Parquet structure...`

      // For Parquet, we can directly create a table from the file
      await connection.query(`
        CREATE TABLE ${tableName} AS 
        SELECT * FROM read_parquet('${file.name}')
      `)
    }

    // Helper function to map Arrow types to DuckDB types
    const mapArrowTypeToDuckDB = (arrowType: arrow.DataType): string => {
      // Check the type ID instead of instanceof
      const typeId = arrowType.typeId

      // Use arrow.Type enum for comparison
      switch (typeId) {
        case arrow.Type.Int8:
        case arrow.Type.Int16:
        case arrow.Type.Int32:
        case arrow.Type.Uint8:
        case arrow.Type.Uint16:
        case arrow.Type.Uint32:
          return 'INTEGER'
        case arrow.Type.Int64:
        case arrow.Type.Uint64:
          return 'BIGINT'
        case arrow.Type.Float:
          return 'DOUBLE'
        case arrow.Type.Timestamp:
          return 'TIMESTAMP'
        case arrow.Type.Date:
          return 'DATE'
        case arrow.Type.Bool:
          return 'BOOLEAN'
        case arrow.Type.Utf8:
        case arrow.Type.Binary:
        default:
          return 'VARCHAR'
      }
    }
    
    const sanitizeTableName = (name: string): string => {
      // Replace non-alphanumeric characters with underscores
      const sanitized = name.replace(/[^a-zA-Z0-9]/g, '_')

      // Ensure the name doesn't start with a number
      return /^\d/.test(sanitized) ? `t_${sanitized}` : sanitized
    }

    return {
      isDragging,
      isLoading,
      loadingMessage,
      lastImportedTable,
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