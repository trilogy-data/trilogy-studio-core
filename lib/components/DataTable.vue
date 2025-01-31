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
import type { ResultColumn } from '../models/results';
export default {
    data() {
        return {
            tabulator: null as Tabulator | null,
            actualTableHeight: '100%',
            selectedCell: null
        }
    },
    props: {
        'headers': {
            type: Map<String, ResultColumn>,
            required: true,
        },
        'results': {
            type: Array,
            required: true,
        },
    },
    watch: {
        // active() {
        //     if (!this.tabulator) return;
        //     if (this.active) {
        //         this.tabulator.restoreRedraw()
        //         this.$nextTick(() => {
        //             this.tabulator.redraw()
        //         })
        //     } else {
        //         this.tabulator.blockRedraw()
        //     }
        // },
        results: {
            handler() {
                this.updateTable()
            },
            deep: true 
        },
        tableColumns: {
            handler() {
                if (!this.tabulator) return;
                this.tabulator.setColumns(this.tableColumns)
            }
        },
        tableHeight() {
            if (!this.tabulator) return;
            this.tabulator.setHeight(this.actualTableHeight)
        }
    },
    computed: {
        tableData() {
            return this.results
        },


        tableColumns() {
            // const columnWidth = this.result.fields.length > 30 ? globals.bigTableColumnWidth : undefined
            const calculated: Array<Object> = []
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
        console.log('unmount event')
        if (this.tabulator) {
            console.log('destroy tabulator')
            this.tabulator.destroy()
            this.tabulator = null;
            console.log('tabulator is null')
        }
    },
    async mounted() {
        if (!this.tabulator ) {
            this.tabulator = new Tabulator(this.$refs.tabulator, {
            // data: this.tableData, //link data to table  
            pagination:true, //enable pagination
            paginationMode:"remote", //enable remote pagination
            reactiveData: true,
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
    }
    },
    methods: {
        updateTable() {
        if (!this.tabulator) return;
        this.tabulator.setColumns(this.tableColumns);
        this.tabulator.setData(this.results);
        this.tabulator.redraw();
    }
    }
}
</script>
