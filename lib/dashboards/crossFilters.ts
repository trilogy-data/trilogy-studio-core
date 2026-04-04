import { computed, ref, type MaybeRefOrGetter, toValue } from 'vue'
import { buildFilterExpression } from './conditions'
import type { CrossFilterEntry } from './conditions'

export type { CrossFilterScalar, CrossFilterEntry } from './conditions'

// CrossFilterValueMap uses the discriminated-union CrossFilterEntry so that every
// filter carries an explicit op ('eq' | 'range' | 'in' | 'is_null').  This lets
// conditions.ts build parameterised SQL placeholders instead of embedding values.
export type CrossFilterValueMap = Record<string, CrossFilterEntry>

// CrossFilterChartMap holds raw values used only for chart-side visual state
// (e.g. Vega brush highlighting).  These never touch SQL.
export type CrossFilterScalar = string | number | Date
export type CrossFilterChartValue = CrossFilterScalar | CrossFilterScalar[]
export type CrossFilterChartMap = Record<string, CrossFilterChartValue>

export type CrossFilterOperation = 'add' | 'append' | 'remove'

export interface CrossFilterSelection {
  source: string
  filters: CrossFilterValueMap
  chart?: CrossFilterChartMap
  append?: boolean
}

export interface CrossFilterInputLike {
  source: string
  value: CrossFilterValueMap
}

// Chart filters carry raw chart values (for Vega highlighting), not CrossFilterEntry.
// Keeping these separate prevents CrossFilterEntry objects from leaking into
// the Vega comparison logic.
export interface CrossFilterChartInputLike {
  source: string
  value: CrossFilterChartMap
}

export interface SqlFilterLike {
  source: string
  value: string
  parameters?: Record<string, string | number>
}

export interface CrossFilterItemLike {
  allowCrossFilter?: boolean
  conceptFilters?: CrossFilterInputLike[]
  chartFilters?: CrossFilterChartInputLike[]
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
  getChartSelectionsFor(itemId: string): CrossFilterChartMap[]
  getFilterExpressionFor(itemId: string): string
  getSqlFiltersFor(itemId: string, baseFilters?: string[]): string[]
  getSqlParametersFor(itemId: string): Record<string, string | number>
}

function cloneValueMap(value: CrossFilterValueMap): CrossFilterValueMap {
  return { ...value }
}

function cloneChartMap(value: CrossFilterChartMap): CrossFilterChartMap {
  return { ...value }
}

function areEntriesEqual(a: CrossFilterEntry, b: CrossFilterEntry): boolean {
  if (a.op !== b.op) return false
  switch (a.op) {
    case 'is_null':
      return true
    case 'eq':
      return a.value === (b as { op: 'eq'; value: CrossFilterScalar }).value
    case 'range': {
      const bRange = b as { op: 'range'; value: [CrossFilterScalar, CrossFilterScalar] }
      return a.value[0] === bRange.value[0] && a.value[1] === bRange.value[1]
    }
    case 'in': {
      const bIn = b as { op: 'in'; value: CrossFilterScalar[] }
      return (
        a.value.length === bIn.value.length && a.value.every((v, i) => v === bIn.value[i])
      )
    }
  }
}

function areValueMapsEqual(left: CrossFilterValueMap, right: CrossFilterValueMap): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  if (leftKeys.length !== rightKeys.length) {
    return false
  }
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && areEntriesEqual(left[key], right[key]),
  )
}

function areChartValuesEqual(a: CrossFilterChartValue, b: CrossFilterChartValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  return a === b
}

function areChartMapsEqual(left: CrossFilterChartMap, right: CrossFilterChartMap): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && areChartValuesEqual(left[key], right[key]),
  )
}

function applyChartSelectionOperation(
  existing: CrossFilterChartInputLike[],
  source: string,
  value: CrossFilterChartMap,
  operation: CrossFilterOperation,
): CrossFilterChartInputLike[] {
  const withoutSource = existing.filter((f) => f.source !== source)
  const forSource = existing.filter((f) => f.source === source)

  if (operation === 'remove') return withoutSource
  if (operation === 'add') return [...withoutSource, { source, value: cloneChartMap(value) }]

  const hasExactMatch = forSource.some((f) => areChartMapsEqual(f.value, value))
  const nextForSource = hasExactMatch
    ? forSource.filter((f) => !areChartMapsEqual(f.value, value))
    : [...forSource, { source, value: cloneChartMap(value) }]

  return [...withoutSource, ...nextForSource]
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
  filters: CrossFilterValueMap,
  validFields: Iterable<string> = [],
  options: { normalizeLocalFields?: boolean } = {},
): CrossFilterValueMap {
  const valid = new Set(validFields)
  const normalizeLocalFields = options.normalizeLocalFields ?? false

  return Object.entries(filters).reduce(
    (acc, [field, entry]) => {
      // Skip values that are not valid CrossFilterEntry objects
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !['eq', 'range', 'in', 'is_null'].includes((entry as any).op)
      ) {
        return acc
      }

      const normalized = normalizeFieldName(field, valid, normalizeLocalFields)
      if (!normalized) {
        return acc
      }
      acc[normalized] = entry
      return acc
    },
    {} as CrossFilterValueMap,
  )
}

/**
 * Builds parameterised filter expressions from an array of cross-filter inputs.
 * Returns { filterStrings, parameters } where each filterString uses :param
 * placeholders and parameters is the dict of colon-prefixed values (e.g.
 * { ":species": "Acer rubrum" }) that must be sent alongside to the backend.
 */
export function buildCrossFilterExpression(filters: CrossFilterInputLike[]): {
  filterStrings: string[]
  parameters: Record<string, string | number>
} {
  if (!filters.length) {
    return { filterStrings: [], parameters: {} }
  }

  // Group CrossFilterEntry values by field key across all filter maps
  const keyGroups: Record<string, CrossFilterEntry[]> = {}
  for (const filter of filters) {
    for (const [key, entry] of Object.entries(filter.value)) {
      if (!keyGroups[key]) keyGroups[key] = []
      keyGroups[key].push(entry)
    }
  }

  const filterStrings: string[] = []
  let allParameters: Record<string, string | number> = {}

  for (const [key, entries] of Object.entries(keyGroups)) {
    if (entries.length > 1) {
      // Multiple entries for the same field → OR them together, unique param names per branch
      const orConditions: string[] = []
      for (let i = 0; i < entries.length; i++) {
        const { filterString, parameters } = buildFilterExpression(key, entries[i], `_or${i}`)
        orConditions.push(filterString)
        allParameters = { ...allParameters, ...parameters }
      }
      filterStrings.push(`(${orConditions.join(' OR ')})`)
    } else {
      const { filterString, parameters } = buildFilterExpression(key, entries[0])
      filterStrings.push(filterString)
      allParameters = { ...allParameters, ...parameters }
    }
  }

  return { filterStrings, parameters: allParameters }
}

export function syncCrossFilterSqlForItem(item: CrossFilterItemLike): boolean {
  const conceptFilters = item.conceptFilters || []
  const nextFilters = (item.filters || []).filter((filter) => filter.source !== 'cross')
  const { filterStrings, parameters } = buildCrossFilterExpression(conceptFilters)
  const crossExpression = filterStrings.join(' AND ')
  if (crossExpression) {
    nextFilters.push({
      source: 'cross',
      value: crossExpression,
      parameters: Object.keys(parameters).length ? parameters : undefined,
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
  chartMap: CrossFilterChartMap,
  operation: CrossFilterOperation,
): string[] {
  const updated: string[] = []

  Object.entries(gridItems).forEach(([itemId, item]) => {
    if (itemId === sourceId) {
      // For the source item, update chart-only filters for visual highlighting.
      // chartFilters uses CrossFilterChartInputLike (raw values) so DashboardChart.vue
      // can pass them directly to Vega without unwrapping CrossFilterEntry objects.
      const nextChartFilters = applyChartSelectionOperation(
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
      chart: cloneChartMap(selection.chart || {}),
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
          chart: cloneChartMap(selection.chart || {}),
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
      return (selections.get(itemId) || []).map((entry) => cloneChartMap(entry.chart || {}))
    },
    getFilterExpressionFor(itemId) {
      const { filterStrings } = buildCrossFilterExpression(this.getSqlFilterInputsFor(itemId))
      return filterStrings.join(' AND ')
    },
    getSqlFiltersFor(itemId, baseFilters = []) {
      const expression = this.getFilterExpressionFor(itemId)
      return expression ? [...baseFilters, expression] : [...baseFilters]
    },
    getSqlParametersFor(itemId) {
      const { parameters } = buildCrossFilterExpression(this.getSqlFilterInputsFor(itemId))
      return parameters
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
    getSqlParametersFor(itemId: string) {
      version.value
      return controller.getSqlParametersFor(itemId)
    },
  }
}
