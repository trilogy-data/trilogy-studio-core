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
  min-width: 100%;
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
import { Tabulator } from 'tabulator-tables'
import { DateTime } from 'luxon'
import type { CellComponent, ColumnDefinition } from 'tabulator-tables'
import type { ResultColumn, Row } from '../editors/results'
import { ColumnType } from '../editors/results'
import type { PropType } from 'vue'
import { shallowRef, computed, inject, } from 'vue'
import type { UserSettingsStoreType } from '../stores/userSettingsStore.ts'

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
    case ColumnType.MONEY:
      return {
        formatter: 'money',
        formatterParams: {
          symbol: '$',
          precision: 4,
        },
      }
    case ColumnType.PERCENT:
      return {
        //@ts-ignore
        formatter: (cell) => {
          return (cell.getValue() * 100).toFixed(2) + '%'
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
        formatter: 'plaintext',
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
      tabulator: null as Tabulator | null,
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
          title: details.name,

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
      // @ts-ignore
      this.tabulator = shallowRef(
        // @ts-ignore
        new Tabulator(this.$refs.tabulator, {
          // data: this.tableData, //link data to table
          pagination: this.tableData.length > 1000, //enable pagination
          // paginationMode: 'remote', //enable remote pagination
          // reactiveData: true,
          renderHorizontal: 'virtual',
          // columns: this.tableColumns, //define table columns
          maxHeight: '100%',
          minHeight: '100%',
          minWidth: '100%',
          // rowHeight: 30,
          data: this.tableData, //assign data to table
          // dataTree:true,
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
          dependencies: {
            DateTime: DateTime,
          },
          
        }),
      )
      this.tabulator.on('cellClick', (e, cell) => {
  console.log('cellClick', e, cell);
  let field = this.headers.get(cell.getField()).address;
  let value = cell.getValue();
  console.log(field, value);
 
  // Check if cell is already highlighted
  const element = cell.getElement();
  if (element.classList.contains("highlighted-cell")) {
    // If already highlighted, remove all highlighting and emit background-click
    const highlightedCells = this.$refs.tabulator.querySelectorAll(".highlighted-cell");
    highlightedCells.forEach(highlightedCell => {
      highlightedCell.classList.remove("highlighted-cell");
    });
    this.$emit('background-click', {
      filters: { [field]: value },
    });
  } else {
    // If not highlighted yet, find all cells with the same value in this column and highlight them
    this.$emit('cell-click', {
      filters: { [field]: value },
      append: true
    });
    
    // Get all cells in this column with the same value
    const column = this.tabulator.getColumn(cell.getField());
    const cells = column.getCells();
    
    // Highlight all matching cells
    cells.forEach(cellInColumn => {
      if (cellInColumn.getValue() === value) {
        cellInColumn.getElement().classList.add("highlighted-cell");
      }
    });
  }
});
      
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
