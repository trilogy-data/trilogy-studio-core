import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import {
  useCrossFilterController,
  type CrossFilterOperation,
  type CrossFilterSelection,
  type CreateCrossFilterControllerOptions,
} from '../dashboards/crossFilters'
import {
  useCrossFilterEligibility,
  type CrossFilterEligibilityService,
} from './useCrossFilterEligibility'
import type { EligibleCrossFilterFieldsOptions } from '../stores/queryExecutionService'

export interface UseResolvedCrossFilterControllerOptions
  extends EligibleCrossFilterFieldsOptions {
  queryExecutionService: CrossFilterEligibilityService
  connectionId: MaybeRefOrGetter<string>
  enabled?: MaybeRefOrGetter<boolean>
  immediate?: boolean
  normalizeLocalFields?: boolean
  staticValidFields?: MaybeRefOrGetter<Iterable<string>>
}

export function useResolvedCrossFilterController(
  options: UseResolvedCrossFilterControllerOptions,
) {
  const eligibility = useCrossFilterEligibility(options)
  const staticValidFields = computed(() => Array.from(toValue(options.staticValidFields ?? []) ?? []))

  const controller = useCrossFilterController({
    validFields: () => [...eligibility.eligibleFields.value, ...staticValidFields.value],
    normalizeLocalFields: options.normalizeLocalFields ?? true,
  } satisfies CreateCrossFilterControllerOptions)

  const canAcceptSelections = computed(
    () =>
      !eligibility.loading.value ||
      eligibility.eligibleFields.value.length > 0 ||
      staticValidFields.value.length > 0,
  )

  return {
    version: controller.version,
    eligibleFields: eligibility.eligibleFields,
    eligibilityLoading: eligibility.loading,
    eligibilityError: eligibility.error,
    refreshEligibility: eligibility.refresh,
    applyDimensionClick(selection: CrossFilterSelection, operation?: CrossFilterOperation) {
      if (!canAcceptSelections.value) {
        return {}
      }
      return controller.applyDimensionClick(selection, operation)
    },
    clearSource: controller.clearSource,
    clearAll: controller.clearAll,
    hasSelectionFrom: controller.hasSelectionFrom,
    getSelections: controller.getSelections,
    getSelectionSources: controller.getSelectionSources,
    getSqlFilterInputsFor: controller.getSqlFilterInputsFor,
    getChartSelectionsFor: controller.getChartSelectionsFor,
    getFilterExpressionFor: controller.getFilterExpressionFor,
    getSqlFiltersFor: controller.getSqlFiltersFor,
  }
}
