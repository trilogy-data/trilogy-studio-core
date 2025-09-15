<template>
  <div class="result-table row pa-0 ba-0">
    <div class="table-container">
      <!-- Action buttons -->
      <div class="table-actions">
        <button 
          class="action-button copy-button" 
          @click="copyToClipboard"
          :disabled="!tableData || tableData.length === 0"
          title="Copy table data to clipboard"
        >
          <span class="button-icon">📋</span>
          Copy
        </button>
        <button 
          class="action-button download-button" 
          @click="downloadData"
          :disabled="!tableData || tableData.length === 0"
          title="Download table data as CSV"
        >
          <span class="button-icon">⬇️</span>
          Download CSV
        </button>
      </div>
      
      <!-- Table container -->
      <div ref="tabulator"></div>
    </div>
  </div>
</template>

<style scoped>
.result-table {
  display: flex;
  flex-direction: column;
  flex-basis: 100%;
  flex-grow: 1;
  flex-shrink: 1;
  flex: 1 1 100%;
  flex-wrap: nowrap;
  width: 100%;
  height: 100%;
  background-color: var(--result-window-bg);
}

.table-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.table-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  background-color: var(--table-header-bg, #f5f5f5);
  flex-shrink: 0;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--border-color, #d0d0d0);
  border-radius: 4px;
  background-color: var(--button-bg, #ffffff);
  color: var(--button-text, #333333);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-button:hover:not(:disabled) {
  background-color: var(--button-hover-bg, #f0f0f0);
  border-color: var(--button-hover-border, #b0b0b0);
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-icon {
  font-size: 14px;
  line-height: 1;
}

.copy-button:hover:not(:disabled) {
  background-color: var(--copy-button-hover, #e3f2fd);
  border-color: var(--copy-button-border, #2196f3);
  color: var(--copy-button-text, #1976d2);
}

.download-button:hover:not(:disabled) {
  background-color: var(--download-button-hover, #e8f5e8);
  border-color: var(--download-button-border, #4caf50);
  color: var(--download-button-text, #388e3c);
}

.tabulator .tabulator-tableholder .tabulator-table {
  color: var(--text);
}

.tabulator .tabulator-tableholder .tabulator-table .tabulator-cell {
  cursor: default;
}

.tabulator .tabulator-tableholder .tabulator-table .tabulator-cell &:hover {
  cursor: default;
}

.tabulator-row {
  width: min-content;
}

.tabulator {
  position: relative;
  border: 0;
  width: 100%;
  flex-grow: 1;
}

.tabulator-cell {
  border: 0;
}

/* Dark theme support */
.dark-theme-table .table-actions {
  background-color: var(--dark-table-header-bg, #2a2a2a);
  border-bottom-color: var(--dark-border-color, #404040);
}

.dark-theme-table .action-button {
  background-color: var(--dark-button-bg, #3a3a3a);
  color: var(--dark-button-text, #e0e0e0);
  border-color: var(--dark-border-color, #555555);
}

.dark-theme-table .action-button:hover:not(:disabled) {
  background-color: var(--dark-button-hover-bg, #4a4a4a);
  border-color: var(--dark-button-hover-border, #666666);
}

.dark-theme-table .copy-button:hover:not(:disabled) {
  background-color: var(--dark-copy-button-hover, #1a237e);
  border-color: var(--dark-copy-button-border, #3f51b5);
  color: var(--dark-copy-button-text, #9fa8da);
}

.dark-theme-table .download-button:hover:not(:disabled) {
  background-color: var(--dark-download-button-hover, #1b5e20);
  border-color: var(--dark-download-button-border, #4caf50);
  color: var(--dark-download-button-text, #a5d6a7);
}

/* Highlighted cell styling */
.highlighted-cell {
  background-color: var(--highlight-bg, #fff3cd) !important;
  border: 2px solid var(--highlight-border, #ffc107) !important;
}

.dark-theme-table .highlighted-cell {
  background-color: var(--dark-highlight-bg, #3e2723) !important;
  border-color: var(--dark-highlight-border, #ff9800) !important;
}
</style>

<script lang="ts">
import {
  Tabulator,
  ResizeColumnsModule,
  DownloadModule,
  FormatModule,
  FilterModule,
  SortModule,
  EditModule,
  ExportModule,
  PageModule,
  InteractionModule,
} from 'tabulator-tables'
import { DateTime } from 'luxon'
import type { CellComponent, ColumnDefinition } from 'tabulator-tables'
import type { ResultColumn, Row } from '../editors/results'
import { ColumnType } from '../editors/results'
import type { PropType, ShallowRef } from 'vue'
import { shallowRef, computed, inject } from 'vue'
import type { UserSettingsStoreType } from '../stores/userSettingsStore.ts'
import { snakeCaseToCapitalizedWords } from '../dashboards/formatting.ts'

Tabulator.registerModule([
  ResizeColumnsModule,
  DownloadModule,
  FormatModule,
  FilterModule,
  SortModule,
  EditModule,
  ExportModule,
  PageModule,
  InteractionModule,
])

function renderBasicTable(data: Row[], columns: Map<string, ResultColumn>) {
  if (!data) {
    return
  }

  let tableHtml = '<table class="tabulator-sub-table">'
  let lookup: string | undefined = columns.keys().next().value

  if (!lookup) {
    return '<table class="tabulator-sub-table"><tbody><tr><td>No data</td></tr></tbody></table>'
  }
  let fieldInfo = columns.get(lookup)
  if (!fieldInfo) {
    return '<table class="tabulator-sub-table"><tbody><tr><td>No data</td></tr></tbody></table>'
  }
  
  tableHtml += '<tbody >'
  data.forEach((row) => {
    let val = row[lookup]
    if (fieldInfo.type == ColumnType.STRUCT && fieldInfo.children) {
      val = renderStructTable(val, fieldInfo.children)
    } else if (fieldInfo.type === ColumnType.ARRAY) {
      val = renderBasicTable(val, columns)
    }
    tableHtml += '<tr class="tabulator-sub-row">'
    tableHtml += `<td class="tabulator-sub-cell">${val}</td>`
    tableHtml += '</tr>'
  })
  tableHtml += '</tbody>'
  tableHtml += '</table>'

  return tableHtml
}

function renderStructTable(data: Row, columns: Map<string, ResultColumn>) {
  if (!data) {
    return
  }
  let tableHtml = '<table class="tabulator-sub-table">'

  tableHtml += '<tbody >'
  columns.forEach((col, _) => {
    let val = data[col.name]
    if (col.type === ColumnType.ARRAY && col.children) {
      val = renderBasicTable(val, col.children)
    }
    if (col.type === ColumnType.STRUCT && col.children) {
      val = renderStructTable(val, col.children)
    }

    tableHtml += '<tr class="tabulator-sub-row">'
    tableHtml += `<td class="tabulator-sub-cell tabulator-sub-cell-header">${col.name}</td>`
    tableHtml += `<td class="tabulator-sub-cell">${val}</td>`
    tableHtml += '</tr>'
  })

  tableHtml += '</tbody>'
  tableHtml += '</table>'

  return tableHtml
}

function typeToFormatter(col: ResultColumn) {
  let tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (col.traits?.includes('usd')) {
    return {
      formatter: 'money',
      formatterParams: {
        symbol: '$',
        precision: 4,
      },
    }
  } else if (col.traits?.includes('percent')) {
    return {
      //@ts-ignore
      formatter: (cell) => {
        return (cell.getValue() * 100).toFixed(2) + '%'
      },
    }
  } else if (col.traits?.includes('url_image')) {
    return {
      //@ts-ignore
      formatter: (cell) => {
        const url = cell.getValue()
        if (!url) {
          return ''
        }
        return `<img src="${url}" alt="${url}" style="max-width: 100%; max-height: 100%;">`
      },
    }
  }
  switch (col.type) {
    case ColumnType.ARRAY:
      return {
        formatter: (cell: CellComponent) =>
          renderBasicTable(cell.getValue(), col.children || new Map()),
      }
    case ColumnType.STRUCT:
      return {
        formatter: (cell: CellComponent) =>
          renderStructTable(cell.getValue(), col.children || new Map()),
      }
    case ColumnType.FLOAT:
      return {
        formatter: 'money',
        formatterParams: {
          precision: col.scale && col.scale >= 0 ? col.scale : false,
        },
      }

    case ColumnType.DATETIME:
      return {
        formatter: 'datetime',
        formatterParams: {
          inputFormat: 'iso',
          outputFormat: 'yyyy-MM-dd HH:mm',
          invalidPlaceholder: '(invalid datetime)',
          timezone: tz,
        },
      }
    case ColumnType.TIMESTAMP:
      return {
        formatter: 'datetime',
        formatterParams: {
          outputFormat: 'yyyy-MM-dd HH:mm:ss Z',
          invalidPlaceholder: '(invalid timestamp)',
          timezone: tz,
        },
      }
    case ColumnType.DATE:
      return {
        formatter: 'datetime',
        formatterParams: {
          inputFormat: 'yyyy-MM-dd',
          outputFormat: 'yyyy-MM-dd',
          invalidPlaceholder: '(invalid date)',
          timezone: 'UTC',
        },
      }
    case ColumnType.TIME:
      return {
        formatter: 'datetime',
        formatterParams: {
          inputFormat: 'HH:mm:ss',
          outputFormat: 'HH:mm',
          invalidPlaceholder: '(invalid time)',
          timezone: tz,
        },
      }
    case ColumnType.TIMESTAMP:
      return {
        formatter: 'datetime',
        formatterParams: {
          inputFormat: 'HH:mm:ss',
          outputFormat: 'HH:mm',
          invalidPlaceholder: '(invalid time)',
          timezone: tz,
        },
      }
    case ColumnType.BOOLEAN:
      return {
        formatter: 'tickCross',
        formatterParams: {
          allowEmpty: true,
          tickElement: '✓',
          crossElement: '✗',
        },
      }
    default:
      return {
        formatter: 'plaintext',
      }
  }
}

export default {
  data() {
    return {
      tabulator: null as ShallowRef<Tabulator> | null,
      selectedCell: null,
    }
  },
  props: {
    headers: {
      type: Map<String, ResultColumn>,
      required: true,
    },
    results: {
      type: Array as PropType<readonly Row[]>,
      required: true,
    },
    containerHeight: Number,
    cellClick: {
      type: Function,
      default: () => {},
    },
    backgroundClick: {
      type: Function,
      default: () => {},
    },
    prettyPrint: {
      type: Boolean,
      default: false,
    },
    fitParent: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    const settingsStore = inject<UserSettingsStoreType>('userSettingsStore')
    if (!settingsStore) {
      throw new Error('userSettingsStore not provided')
    }
    const currentTheme = computed(() => settingsStore.settings.theme)

    return {
      settingsStore,
      currentTheme,
    }
  },
  watch: {
    results: {
      handler() {
        this.updateTable()
      },
      deep: true,
    },
    containerHeight: {
      handler() {
        this.$nextTick(() => {
          if (this.tabulator && this.containerHeight) {
            this.tabulator.setHeight(this.containerHeight - 50) // Account for button bar height
          }
        })
      },
    },
  },
  computed: {
    tableData() {
      return this.results
    },
    tableColumns(): ColumnDefinition[] {
      const calculated: ColumnDefinition[] = []
      this.headers.forEach((details, _) => {
        let formatting = typeToFormatter(details)
        const result = {
          title: this.prettyPrint ? snakeCaseToCapitalizedWords(details.name) : details.name,
          field: details.name,
          formatter: formatting.formatter,
          formatterParams: formatting.formatterParams,
        }
        // @ts-ignore
        calculated.push(result)
      })
      return calculated
    },
  },
  unmounted() {
    if (this.tabulator) {
      this.tabulator.destroy()
      this.tabulator = null
    }
  },
  mounted() {
    if (!this.tabulator) {
      this.create()
    }
  },
  methods: {
    async copyToClipboard() {
      if (!this.tabulator || !this.tableData || this.tableData.length === 0) {
        return
      }

      try {
        // Get data as TSV (Tab Separated Values) which works well in Excel and other apps
        const data = this.tabulator.getData()
        const headers = this.tableColumns.map(col => col.title).join('\t')
        const rows = data.map(row => 
          this.tableColumns.map(col => {
            const value = row[col.field]
            // Handle complex data types by converting to string
            if (typeof value === 'object' && value !== null) {
              return JSON.stringify(value)
            }
            return String(value || '')
          }).join('\t')
        ).join('\n')
        
        const tsvContent = headers + '\n' + rows
        
        await navigator.clipboard.writeText(tsvContent)
        
        // Show feedback (you might want to replace this with your app's notification system)
        this.showNotification('Table data copied to clipboard!', 'success')
      } catch (err) {
        console.error('Failed to copy to clipboard:', err)
        this.showNotification('Failed to copy data to clipboard', 'error')
      }
    },

    downloadData() {
      if (!this.tabulator || !this.tableData || this.tableData.length === 0) {
        return
      }

      try {
        // Use Tabulator's built-in download functionality
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
        const filename = `table-data-${timestamp}.csv`
        
        this.tabulator.download('csv', filename, {
          delimiter: ',',
          bom: true, // Add BOM for Excel compatibility
        })
        
        this.showNotification('Download started!', 'success')
      } catch (err) {
        console.error('Failed to download data:', err)
        this.showNotification('Failed to download data', 'error')
      }
    },

    showNotification(message: string, type: 'success' | 'error') {
      // Simple notification - you might want to replace this with your app's notification system
      const notification = document.createElement('div')
      notification.textContent = message
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 4px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        background-color: ${type === 'success' ? '#4caf50' : '#f44336'};
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        transition: opacity 0.3s ease;
      `
      
      document.body.appendChild(notification)
      
      setTimeout(() => {
        notification.style.opacity = '0'
        setTimeout(() => {
          document.body.removeChild(notification)
        }, 300)
      }, 3000)
    },

    create() {
      let target = this.$refs.tabulator as HTMLElement
      let layout: 'fitDataFill' | 'fitData' = this.fitParent ? 'fitDataFill' : 'fitData'

      let tab = new Tabulator(target, {
        pagination: this.tableData.length > 1000,
        renderHorizontal: 'virtual',
        maxHeight: '100%',
        minHeight: '100%',
        minWidth: '100%',
        //@ts-ignore
        data: this.tableData,
        columns: this.tableColumns,
        nestedFieldSeparator: false,
        clipboard: 'copy',
        keybindings: {
          copyToClipboard: true,
        },
        downloadConfig: {
          columnHeaders: true,
        },
        resizableColumns: true,
        layout: layout,
        dependencies: {
          DateTime: DateTime,
        },
      })

      tab.on('cellClick', (_, cell) => {
        let fieldName = cell.getField()
        let fullField = this.headers.get(fieldName)
        if (!fullField) {
          return
        }
        let field = fullField.address
        if (!field) {
          return
        }
        let value = cell.getValue()

        const element = cell.getElement()
        if (element.classList.contains('highlighted-cell')) {
          const highlightedCells = target.querySelectorAll('.highlighted-cell')
          highlightedCells.forEach((highlightedCell) => {
            highlightedCell.classList.remove('highlighted-cell')
          })
          this.$emit('background-click', {
            filters: { [field]: value },
          })
        } else {
          this.$emit('cell-click', {
            filters: { [field]: value },
            append: true,
          })
          
          const column = tab.getColumn(cell.getField())
          const cells = column.getCells()

          cells.forEach((cellInColumn) => {
            if (cellInColumn.getValue() === value) {
              cellInColumn.getElement().classList.add('highlighted-cell')
            }
          })
        }
      })
      
      // @ts-ignore
      this.tabulator = shallowRef(tab)
      this.updateTableTheme()
    },

    updateTable() {
      if (this.tabulator) {
        this.tabulator.destroy()
        this.tabulator = null
      }
      this.create()
    },

    updateTableTheme() {
      if (!this.tabulator) return

      const table = this.tabulator
      const theme = this.currentTheme

      if (theme === 'dark') {
        table.element.classList.remove('light-theme-table')
        table.element.classList.add('dark-theme-table')
      } else {
        table.element.classList.remove('dark-theme-table')
        table.element.classList.add('light-theme-table')
      }
    },
  },
}
</script>