## Cross Filtering

Cross filtering happens by default for any chart without it set.

This happens via a dimension-click event.

```typescript
     emit('dimension-click', {
source: props.itemId,
filters: dimension.filters,
chart: dimension.chart,
append: dimension.append,
})
```

The base dashboard object checks to see if the filtered dimension exists on global imports - we can't 
cross filter something unique to a chart.

If it does, we can call updateItemCrossFilters

```typescript
function setCrossFilter(info: DimensionClick): void {
  if (!dashboard.value || !dashboard.value.id) return

  let globalFields = globalCompletion.value.map((f) => f.label)
  const finalFilters = Object.entries(info.filters).reduce(
    (acc, [key, value]) => {
      let lookup = key
      if (globalFields.includes(lookup)) {
        acc[key] = value
      }
      return acc
    },
    {} as Record<string, string>,
  )

  if (!finalFilters || Object.keys(finalFilters).length === 0) return

  dashboardStore.updateItemCrossFilters(
    dashboard.value.id,
    info.source,
    finalFilters,
    info.chart,
    info.append ? 'append' : 'add',
  )
}
```