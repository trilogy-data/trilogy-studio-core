<template>
  <div class="datasource-table-container">
    <div ref="tableRef"></div>
  </div>
</template>
<script lang="ts">
import { defineComponent, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { Datasource } from '../../models'
import { Tabulator } from 'tabulator-tables'

export default defineComponent({
  name: 'DatasourceTable',
  props: {
    datasources: {
      type: Array as () => Datasource[],
      required: true,
    },
  },
  setup(props) {
    const tableRef = ref<HTMLDivElement | null>(null)
    let tabulator: Tabulator | null = null

    onBeforeUnmount(() => {
      if (tabulator) {
        tabulator.destroy()
      }
    })
    onMounted(() => {
      nextTick(() => {
        if (tableRef.value) {
          tabulator = new Tabulator(tableRef.value, {
            layout: 'fitColumns',
            // height:300,
            maxHeight: 500,
            // movableColumns: true,
            columns: [
              {
                title: 'Name',
                field: 'name',
                sorter: 'string',
                resizable: true,
                headerFilter: 'input',
              },
              { title: 'Address', field: 'location', sorter: 'string', resizable: true },
              {
                title: 'Grain',
                field: 'grain',
                // @ts-ignore
                formatter: 'array',
                formatterParams: {
                  delimiter: ', ',
                  valueMap: 'address',
                },
              },
              // {
              //     title: 'Lineage',
              //     field: 'lineage',
              //     formatter: (cell) => {
              //         const lineage: LineageItem[] = cell.getValue();
              //         let base = lineage
              //             .map(
              //                 (item) =>
              //                     `<span style="color: ${getDepthColor(
              //                         item.depth
              //                     )}; border-radius: 3px;  display: inline-block;">${item.link ? `<a href="${item.link}">${item.token}</a>` : item.token
              //                     }</span>`
              //             ).join(' ');
              //         let x = `<div style="display: flex; flex-wrap: wrap;">${base}</div>`
              //         return x;
              //     },
              // },

              {
                title: 'Concepts',
                field: 'concepts',
                // @ts-ignore
                formatter: 'array',
                formatterParams: {
                  delimiter: ', ',
                  valueMap: 'address',
                },
              },
              // { title: 'Description', field: 'description', sorter: "string", resizable: true },
            ],
            data: props.datasources,
            reactiveData: true,
          })
          // tabulator.setData(props.concepts);
        }
      })
    })

    watch(
      () => props.datasources,
      (newData) => {
        tabulator?.setData(newData)
      },
      { deep: true },
    )

    return { tableRef }
  },
})
</script>

<style scoped>
.datasource-table-container {
  width: 100%;
  /* padding: 16px; */
  background-color: var(--bg-color);
  border-radius: 8px;
  /* box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1); */
}
</style>
