<template>
  <div class="concept-table-container">
    <div ref="tableRef"></div>
  </div>
</template>
<script lang="ts">
import { defineComponent, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { Concept, LineageItem } from '../models'
import { Tabulator } from 'tabulator-tables'

export default defineComponent({
  name: 'ConceptTable',
  props: {
    concepts: {
      type: Array as () => Concept[],
      required: true,
    },
  },
  setup(props) {
    const tableRef = ref<HTMLDivElement | null>(null)
    let tabulator: Tabulator | null = null

    const getDepthColor = (depth: number): string => {
      const colors = ['#ff0000', '#ff6600', '#ffcc00', '#33cc33', '#0099ff', '#9933ff', '#6600cc']
      return colors[depth % colors.length] || '#000000'
    }
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
                title: 'Address',
                field: 'address',
                sorter: 'string',
                resizable: true,
                headerFilter: 'input',
              },
              { title: 'Purpose', field: 'purpose', sorter: 'string', resizable: true, width: 80 },
              {
                title: 'Lineage',
                field: 'lineage',
                formatter: (cell) => {
                  const lineage: LineageItem[] = cell.getValue()
                  let base = lineage
                    .map(
                      (item) =>
                        `<span style="color: ${getDepthColor(
                          item.depth,
                        )}; border-radius: 3px;  display: inline-block;">${
                          item.link ? `<a href="${item.link}">${item.token}</a>` : item.token
                        }</span>`,
                    )
                    .join(' ')
                  let x = `<div style="display: flex; flex-wrap: wrap;">${base}</div>`
                  return x
                },
              },

              {
                // @ts-ignore
                title: 'Keys',
                field: 'keys',
                formatter: 'array',
                formatterParams: {
                  delimiter: ', ', //join values using the "|" delimiter
                },
              },
              { title: 'Description', field: 'description', sorter: 'string', resizable: true },
            ],
            data: props.concepts,
            reactiveData: true,
          })
          // tabulator.setData(props.concepts);
        }
      })
    })

    watch(
      () => props.concepts,
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
.concept-table-container {
  width: 100%;
  /* padding: 16px; */
  background-color: var(--bg-color);
  border-radius: 8px;
  /* box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1); */
}
</style>
