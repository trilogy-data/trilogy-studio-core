import { computed, ref, type MaybeRefOrGetter, toValue } from 'vue'
import { objectToSqlExpression } from './conditions'

export type CrossFilterValueMap = Record<string, string>
export type CrossFilterOperation = 'add' | 'append' | 'remove'

export interface CrossFilterSelection {
  source: string
  filters: CrossFilterValueMap
  chart?: CrossFilterValueMap
  append?: boolean
}

export interface CrossFilterInputLike {
  source: string
  value: CrossFilterValueMap
}

export interface SqlFilterLike {
  source: string
  value: string
}

export interface CrossFilterItemLike {
  allowCrossFilter?: boolean
  conceptFilters?: CrossFilterInputLike[]
  chartFilters?: CrossFilterInputLike[]
  filters?: SqlFilterLike[]
}

export interface CreateCrossFilterControllerOptions {
  validFields?: Iterable<string> | (() => Iterable<string>)
  normalizeLocalFields?: boolean
}

export function extractEligibleCrossFilterFields(
  completionItems: Iterable<{ label: string }> = [],
): string[] {
  const fields = new Set<string>()

  for (const item of completionItems) {
    if (!item?.label) {
      continue
    }
    fields.add(item.label)
  }

  return Array.from(fields)
}

export interface CrossFilterController {
  getSelections(): CrossFilterSelection[]
  getSelectionSources(): string[]
  applyDimensionClick(
    selection: CrossFilterSelection,
    operation?: CrossFilterOperation,
  ): CrossFilterValueMap
  clearSource(source: string): void
  clearAll(): void
  hasSelectionFrom(source: string): boolean
  getSqlFilterInputsFor(itemId: string): CrossFilterInputLike[]
  getChartSelectionsFor(itemId: string): CrossFilterValueMap[]
  getFilterExpressionFor(itemId: string): string
  getSqlFiltersFor(itemId: string, baseFilters?: string[]): string[]
}

function cloneValueMap(value: CrossFilterValueMap): CrossFilterValueMap {
  return { ...value }
}

function areValueMapsEqual(left: CrossFilterValueMap, right: CrossFilterValueMap): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  if (leftKeys.length !== rightKeys.length) {
    return false
  }
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key])
}

function normalizeFieldName(
  field: string,
  validFields: Set<string>,
  normalizeLocalFields: boolean,
): string | null {
  if (validFields.size === 0) {
    return normalizeLocalFields && field.startsWith('local.')
      ? field.replace(/^local\./, '')
      : field
  }

  if (validFields.has(field)) {
    return field
  }

  if (field.startsWith('local.')) {
    const stripped = field.replace(/^local\./, '')
    if (validFields.has(stripped)) {
      return normalizeLocalFields ? stripped : field
    }
  }

  return null
}

export function filterAllowedDimensionFilters(
  filters: Record<string, string>,
  validFields: Iterable<string> = [],
  options: { normalizeLocalFields?: boolean } = {},
): CrossFilterValueMap {
  const valid = new Set(validFields)
  const normalizeLocalFields = options.normalizeLocalFields ?? false

  return Object.entries(filters).reduce((acc, [field, value]) => {
    if (typeof value !== 'string') {
      return acc
    }

    const normalized = normalizeFieldName(field, valid, normalizeLocalFields)
    if (!normalized) {
      return acc
    }
    acc[normalized] = value
    return acc
  }, {} as CrossFilterValueMap)
}

export function buildCrossFilterExpression(filters: CrossFilterInputLike[]): string {
  if (!filters.length) {
    return ''
  }
  return objectToSqlExpression(filters.map((filter) => filter.value))
}

export function syncCrossFilterSqlForItem(item: CrossFilterItemLike): boolean {
  const conceptFilters = item.conceptFilters || []
  const nextFilters = (item.filters || []).filter((filter) => filter.source !== 'cross')
  const crossExpression = buildCrossFilterExpression(conceptFilters)
  if (crossExpression) {
    nextFilters.push({
      source: 'cross',
      value: crossExpression,
    })
  }

  const changed = JSON.stringify(nextFilters) !== JSON.stringify(item.filters || [])
  item.filters = nextFilters
  return changed
}

function applySelectionOperation(
  existing: CrossFilterInputLike[],
  source: string,
  value: CrossFilterValueMap,
  operation: CrossFilterOperation,
): CrossFilterInputLike[] {
  const withoutSource = existing.filter((filter) => filter.source !== source)
  const forSource = existing.filter((filter) => filter.source === source)

  if (operation === 'remove') {
    return withoutSource
  }

  if (operation === 'add') {
    return [...withoutSource, { source, value: cloneValueMap(value) }]
  }

  const hasExactMatch = forSource.some((filter) => areValueMapsEqual(filter.value, value))
  const nextForSource = hasExactMatch
    ? forSource.filter((filter) => !areValueMapsEqual(filter.value, value))
    : [...forSource, { source, value: cloneValueMap(value) }]

  return [...withoutSource, ...nextForSource]
}

export function applyCrossFilterOperationToGridItems(
  gridItems: Record<string, CrossFilterItemLike>,
  sourceId: string,
  conceptMap: CrossFilterValueMap,
  chartMap: CrossFilterValueMap,
  operation: CrossFilterOperation,
): string[] {
  const updated: string[] = []

  Object.entries(gridItems).forEach(([itemId, item]) => {
    if (itemId === sourceId) {
      const nextChartFilters = applySelectionOperation(
        item.chartFilters || [],
        sourceId,
        chartMap,
        operation,
      )
      if (JSON.stringify(nextChartFilters) !== JSON.stringify(item.chartFilters || [])) {
        item.chartFilters = nextChartFilters
      }
      return
    }

    if (!item.allowCrossFilter) {
      return
    }

    const nextConceptFilters = applySelectionOperation(
      item.conceptFilters || [],
      sourceId,
      conceptMap,
      operation,
    )

    const conceptChanged =
      JSON.stringify(nextConceptFilters) !== JSON.stringify(item.conceptFilters || [])
    if (conceptChanged) {
      item.conceptFilters = nextConceptFilters
    }

    const sqlChanged = syncCrossFilterSqlForItem(item)
    if (conceptChanged || sqlChanged) {
      updated.push(itemId)
    }
  })

  return updated
}

export function removeCrossFilterFromItem(
  gridItems: Record<string, CrossFilterItemLike>,
  itemId: string,
  sourceId: string,
): boolean {
  const item = gridItems[itemId]
  if (!item) {
    return false
  }

  const nextConceptFilters = (item.conceptFilters || []).filter(
    (filter) => filter.source !== sourceId,
  )
  const conceptChanged =
    JSON.stringify(nextConceptFilters) !== JSON.stringify(item.conceptFilters || [])

  if (conceptChanged) {
    item.conceptFilters = nextConceptFilters
  }

  const sqlChanged = syncCrossFilterSqlForItem(item)
  return conceptChanged || sqlChanged
}

export function removeCrossFilterSourceFromGridItems(
  gridItems: Record<string, CrossFilterItemLike>,
  sourceId: string,
): string[] {
  const updated: string[] = []

  Object.entries(gridItems).forEach(([itemId, item]) => {
    if (itemId === sourceId) {
      item.chartFilters = []
      return
    }

    const nextConceptFilters = (item.conceptFilters || []).filter(
      (filter) => filter.source !== sourceId,
    )
    const conceptChanged =
      JSON.stringify(nextConceptFilters) !== JSON.stringify(item.conceptFilters || [])

    if (conceptChanged) {
      item.conceptFilters = nextConceptFilters
    }

    const sqlChanged = syncCrossFilterSqlForItem(item)
    if (conceptChanged || sqlChanged) {
      updated.push(itemId)
    }
  })

  return updated
}

export function clearAllCrossFiltersFromGridItems(
  gridItems: Record<string, CrossFilterItemLike>,
): string[] {
  const updated: string[] = []

  Object.entries(gridItems).forEach(([itemId, item]) => {
    const hadFilters =
      Boolean(item.conceptFilters?.length) ||
      Boolean(item.chartFilters?.length) ||
      Boolean(item.filters?.length)

    item.conceptFilters = []
    item.chartFilters = []
    item.filters = []

    if (hadFilters) {
      updated.push(itemId)
    }
  })

  return updated
}

export function createCrossFilterController(
  options: CreateCrossFilterControllerOptions = {},
): CrossFilterController {
  const selections = new Map<string, CrossFilterSelection[]>()

  const getValidFields = (): Set<string> => {
    const raw = options.validFields
      ? toValue(options.validFields as MaybeRefOrGetter<Iterable<string>>)
      : []
    return new Set(raw)
  }

  const normalizeSelection = (selection: CrossFilterSelection): CrossFilterSelection => {
    const filtered = filterAllowedDimensionFilters(selection.filters, getValidFields(), {
      normalizeLocalFields: options.normalizeLocalFields ?? true,
    })
    return {
      source: selection.source,
      filters: filtered,
      chart: cloneValueMap(selection.chart || filtered),
      append: selection.append,
    }
  }

  return {
    getSelections() {
      return Array.from(selections.values())
        .flat()
        .map((selection) => ({
          source: selection.source,
          filters: cloneValueMap(selection.filters),
          chart: cloneValueMap(selection.chart || selection.filters),
          append: selection.append,
        }))
    },
    getSelectionSources() {
      return Array.from(selections.keys())
    },
    applyDimensionClick(selection, operation) {
      const normalized = normalizeSelection(selection)
      const nextOperation = operation ?? (selection.append ? 'append' : 'add')
      if (Object.keys(normalized.filters).length === 0) {
        if (nextOperation !== 'append') {
          selections.delete(selection.source)
        }
        return {}
      }

      const existing = selections.get(selection.source) || []

      if (nextOperation === 'remove') {
        selections.delete(selection.source)
        return normalized.filters
      }

      if (nextOperation === 'add') {
        selections.set(selection.source, [normalized])
        return normalized.filters
      }

      const hasExactMatch = existing.some((entry) =>
        areValueMapsEqual(entry.filters, normalized.filters),
      )
      const next = hasExactMatch
        ? existing.filter((entry) => !areValueMapsEqual(entry.filters, normalized.filters))
        : [...existing, normalized]

      if (next.length === 0) {
        selections.delete(selection.source)
      } else {
        selections.set(selection.source, next)
      }

      return normalized.filters
    },
    clearSource(source) {
      selections.delete(source)
    },
    clearAll() {
      selections.clear()
    },
    hasSelectionFrom(source) {
      return selections.has(source)
    },
    getSqlFilterInputsFor(itemId) {
      return Array.from(selections.entries())
        .filter(([source]) => source !== itemId)
        .flatMap(([source, entries]) =>
          entries.map((entry) => ({
            source,
            value: cloneValueMap(entry.filters),
          })),
        )
    },
    getChartSelectionsFor(itemId) {
      return (selections.get(itemId) || []).map((entry) =>
        cloneValueMap(entry.chart || entry.filters),
      )
    },
    getFilterExpressionFor(itemId) {
      return buildCrossFilterExpression(this.getSqlFilterInputsFor(itemId))
    },
    getSqlFiltersFor(itemId, baseFilters = []) {
      const expression = this.getFilterExpressionFor(itemId)
      return expression ? [...baseFilters, expression] : [...baseFilters]
    },
  }
}

export function useCrossFilterController(
  options: MaybeRefOrGetter<CreateCrossFilterControllerOptions> = {},
) {
  const version = ref(0)
  const controller = createCrossFilterController(toValue(options))

  const bump = () => {
    version.value += 1
  }

  return {
    version: computed(() => version.value),
    applyDimensionClick(selection: CrossFilterSelection, operation?: CrossFilterOperation) {
      const result = controller.applyDimensionClick(selection, operation)
      bump()
      return result
    },
    clearSource(source: string) {
      controller.clearSource(source)
      bump()
    },
    clearAll() {
      controller.clearAll()
      bump()
    },
    hasSelectionFrom(source: string) {
      version.value
      return controller.hasSelectionFrom(source)
    },
    getSelections() {
      version.value
      return controller.getSelections()
    },
    getSelectionSources() {
      version.value
      return controller.getSelectionSources()
    },
    getSqlFilterInputsFor(itemId: string) {
      version.value
      return controller.getSqlFilterInputsFor(itemId)
    },
    getChartSelectionsFor(itemId: string) {
      version.value
      return controller.getChartSelectionsFor(itemId)
    },
    getFilterExpressionFor(itemId: string) {
      version.value
      return controller.getFilterExpressionFor(itemId)
    },
    getSqlFiltersFor(itemId: string, baseFilters: string[] = []) {
      version.value
      return controller.getSqlFiltersFor(itemId, baseFilters)
    },
  }
}
