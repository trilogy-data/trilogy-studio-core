<template>
  <div class="result-table row pa-0 ba-0">
    <div ref="tabulator"></div>
  </div>
</template>

<style scoped>
.result-table {
  display: flex;
  flex-direction: row;
  flex-basis: 100%;
  flex-grow: 1;
  flex-shrink: 1;
  flex: 1 1 100%;
  flex-wrap: nowrap;
  width: 100%;
  /* align to left */
  justify-content: flex-start;
  margin-right: auto;
  height: 100%;
  background-color: var(--result-window-bg);
}

.tabulator .tabulator-tableholder .tabulator-table {
  /* background-color: transparent; */
  color: var(--text);
}

.tabulator .tabulator-tableholder .tabulator-table .tabulator-cell {
  cursor: default;
}

.tabulator .tabulator-tableholder .tabulator-table .tabulator-cell &:hover {
  cursor: default;
}

.tabulator-row {
  /* background: transparent; */
  width: min-content;
  /* min-width: 100%; */
}

.tabulator {
  position: relative;
  border: 0;
  width: 100%;
  /* background: transparent; */
}

.tabulator-cell {
  border: 0;
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
    // If no columns, return empty table
    return '<table class="tabulator-sub-table"><tbody><tr><td>No data</td></tr></tbody></table>'
  }
  let fieldInfo = columns.get(lookup)
  if (!fieldInfo) {
    // If no field info found, return empty table
    return '<table class="tabulator-sub-table"><tbody><tr><td>No data</td></tr></tbody></table>'
  }
  // Add body rows
  tableHtml += '<tbody >'
  data.forEach((row) => {
    let val = row[lookup]
    // Check if the value is an array or object and handle accordingly
    if (fieldInfo.type == ColumnType.STRUCT && fieldInfo.children) {
      val = renderStructTable(val, fieldInfo.children)
    } else if (fieldInfo.type === ColumnType.ARRAY) {
      // If it's an array, call renderBasicTable recursively
      val = renderBasicTable(val, columns) // Pass the array data and columns to renderBasicTable
    }
    tableHtml += '<tr class="tabulator-sub-row">'
    tableHtml += `<td class="tabulator-sub-cell">${val}</td>`
    tableHtml += '</tr>'
  })
  tableHtml += '</tbody>'

  // Close table
  tableHtml += '</table>'

  return tableHtml
}

function renderStructTable(data: Row, columns: Map<string, ResultColumn>) {
  if (!data) {
    return
  }
  let tableHtml = '<table class="tabulator-sub-table">'

  // Add body rows
  tableHtml += '<tbody >'
  columns.forEach((col, _) => {
    let val = data[col.name]
    if (col.type === ColumnType.ARRAY && col.children) {
      val = renderBasicTable(val, col.children)
    }
    if (col.type === ColumnType.STRUCT && col.children) {
      // If it's a struct, call the renderStructTable recursively
      val = renderStructTable(val, col.children)
    }

    tableHtml += '<tr class="tabulator-sub-row">'
    tableHtml += `<td class="tabulator-sub-cell tabulator-sub-cell-header">${col.name}</td>`
    tableHtml += `<td class="tabulator-sub-cell">${val}</td>`
    tableHtml += '</tr>'
  })

  tableHtml += '</tbody>'

  // Close table
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
    // Inject the store that has been provided elsewhere in the app
    const settingsStore = inject<UserSettingsStoreType>('userSettingsStore')
    if (!settingsStore) {
      throw new Error('userSettingsStore not provided')
    }
    // Create a computed property for the current theme
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
            this.tabulator.setHeight(this.containerHeight)
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
      // const columnWidth = this.result.fields.length > 30 ? globals.bigTableColumnWidth : undefined
      const calculated: ColumnDefinition[] = []
      this.headers.forEach((details, _) => {
        let formatting = typeToFormatter(details)
        const result = {
          title: this.prettyPrint ? snakeCaseToCapitalizedWords(details.name) : details.name,

          // titleFormatter: 'plaintext',
          field: details.name,
          formatter: formatting.formatter,
          formatterParams: formatting.formatterParams,
          // formatter: this.cellFormatter,
          // tooltip: this.cellTooltip,
          // contextMenu: this.cellContextMenu,
          // headerContextMenu: this.headerContextMenu,
          // cellClick: this.cellClick.bind(this)
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
    create() {
      let target = this.$refs.tabulator as HTMLElement
      let layout: 'fitDataFill' | 'fitData' = this.fitParent ? 'fitDataFill' : 'fitData' // Use fitDataFill if fitParent is true, otherwise fitData

      let tab = new Tabulator(target, {
        // data: this.tableData, //link data to table
        pagination: this.tableData.length > 1000, //enable pagination
        // paginationMode: 'remote', //enable remote pagination
        // reactiveData: true,
        renderHorizontal: 'virtual',
        // columns: this.tableColumns, //define table columns
        maxHeight: '100%',
        minHeight: '100%',
        minWidth: '100%',
        // dynamic rowheights required for struct/array
        // rowHeight: 30,
        //@ts-ignore
        data: this.tableData,
        columns: this.tableColumns,
        // height: this.actualTableHeight,
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

        // Check if cell is already highlighted
        const element = cell.getElement()
        if (element.classList.contains('highlighted-cell')) {
          // If already highlighted, remove all highlighting and emit background-click
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
          // If not highlighted yet, find all cells with the same value in this column and highlight them
          // Get all cells in this column with the same value
          const column = tab.getColumn(cell.getField())
          const cells = column.getCells()

          // Highlight all matching cells
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
        // Apply dark theme styles
        table.element.classList.remove('light-theme-table')
        table.element.classList.add('dark-theme-table')
      } else {
        // Apply light theme styles
        table.element.classList.remove('dark-theme-table')
        table.element.classList.add('light-theme-table')
      }
    },
  },
}
</script>
