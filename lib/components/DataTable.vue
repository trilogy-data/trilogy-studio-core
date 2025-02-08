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
    background-color: transparent;
    color: var(--text);
}

.tabulator .tabulator-tableholder .tabulator-table .tabulator-cell {
    cursor: default;

}

.tabulator .tabulator-tableholder .tabulator-table .tabulator-cell &:hover {
    cursor: default;

}

.tabulator-row {
    background: transparent;
    width: min-content;
    min-width: 100%;
}

.tabulator {
    position: relative;
    font-size: 12px;
    border: 0;
    width: 100%;
    background: transparent;
}

.tabulator-cell {
    border: 0;

}
</style>

<script lang="ts">
import { Tabulator } from 'tabulator-tables'
import type { ColumnDefinition } from 'tabulator-tables'
import type { ResultColumn, Row } from '../models/results';
import type { PropType } from 'vue';

export default {
    data() {
        return {
            tabulator: null as Tabulator | null,
            selectedCell: null
        }
    },
    props: {
        'headers': {
            type: Map<String, ResultColumn>,
            required: true,
        },
        'results': {
            type:  Array as PropType<readonly Row[]>, 
            required: true,
        },
    },
    watch: {
        results: {
            handler() {
                this.updateTable()
            },
            deep: true
        },
    },
    computed: {
        tableData() {
            return this.results
        },
        prefersLight() {
            return window.matchMedia('(prefers-color-scheme: light)');
        },
        tableColumns(): ColumnDefinition[] {
            // const columnWidth = this.result.fields.length > 30 ? globals.bigTableColumnWidth : undefined
            const calculated: ColumnDefinition[] = []
            this.headers.forEach((details, _) => {
                const result = {
                    title: details.name,

                    // titleFormatter: 'plaintext',
                    field: details.name,
                    // formatter: this.cellFormatter,
                    // tooltip: this.cellTooltip,
                    // contextMenu: this.cellContextMenu,
                    // headerContextMenu: this.headerContextMenu,
                    // cellClick: this.cellClick.bind(this)
                }
                calculated.push(result)
            })
            return calculated;
        }
    },
    unmounted() {
        if (this.tabulator) {
            this.tabulator.destroy()
            this.tabulator = null;
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
            this.tabulator = new Tabulator(this.$refs.tabulator, {
                // data: this.tableData, //link data to table  
                pagination: true, //enable pagination
                paginationMode: "remote", //enable remote pagination
                // reactiveData: true,
                renderHorizontal: 'virtual',
                // columns: this.tableColumns, //define table columns
                maxHeight: "100%",
                minHeight: "100%",
                data: this.tableData, //assign data to table
                columns: this.tableColumns,
                // height: this.actualTableHeight,
                nestedFieldSeparator: false,
                clipboard: true,
                keybindings: {
                    copyToClipboard: false
                },
                downloadConfig: {
                    columnHeaders: true
                },
                resizableColumns: true
            });
        },
        updateTable() {
            if (this.tabulator) {
                this.tabulator.destroy()
                this.tabulator = null;
            }
            this.create()
        }
    }
}
</script>
