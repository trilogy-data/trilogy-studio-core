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
import type { ColumnDefinition } from 'tabulator-tables'
import type { ResultColumn, Row } from '../editors/results'
import { ColumnType } from '../editors/results'
import type { PropType } from 'vue'
import { shallowRef, computed, inject } from 'vue'
import type { UserSettingsStoreType } from '../stores/userSettingsStore.ts'

function typeToFormatter(type: ColumnType) {
  let tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  switch (type) {
    case ColumnType.FLOAT:
      return {
        formatter: 'money',
        formatterParams: {
          precision: 2,
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
        let formatting = typeToFormatter(details.type)
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
          pagination: true, //enable pagination
          // paginationMode: 'remote', //enable remote pagination
          // reactiveData: true,
          renderHorizontal: 'virtual',
          // columns: this.tableColumns, //define table columns
          maxHeight: '100%',
          minHeight: '100%',
          minWidth: '100%',
          rowHeight: 30,
          data: this.tableData, //assign data to table
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
