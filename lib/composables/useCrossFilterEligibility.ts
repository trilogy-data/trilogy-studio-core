import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { EligibleCrossFilterFieldsOptions } from '../stores/queryExecutionService'

export interface CrossFilterEligibilityService {
  getEligibleCrossFilterFields(
    connectionId: string,
    options?: EligibleCrossFilterFieldsOptions,
  ): Promise<string[]>
}

export interface UseCrossFilterEligibilityOptions extends EligibleCrossFilterFieldsOptions {
  queryExecutionService: CrossFilterEligibilityService
  connectionId: MaybeRefOrGetter<string>
  enabled?: MaybeRefOrGetter<boolean>
  immediate?: boolean
}

export function useCrossFilterEligibility(options: UseCrossFilterEligibilityOptions) {
  const eligibleFields = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let requestId = 0

  async function refresh() {
    const connectionId = toValue(options.connectionId)
    const enabled = toValue(options.enabled ?? true)

    if (!enabled || !connectionId) {
      eligibleFields.value = []
      error.value = null
      loading.value = false
      return []
    }

    const currentRequest = ++requestId
    loading.value = true
    error.value = null

    try {
      const fields = await options.queryExecutionService.getEligibleCrossFilterFields(connectionId, {
        imports: toValue(options.imports) ?? [],
        extraFilters: toValue(options.extraFilters) ?? [],
        extraContent: toValue(options.extraContent) ?? [],
        currentFilename: toValue(options.currentFilename) ?? undefined,
      })

      if (currentRequest === requestId) {
        eligibleFields.value = fields
      }

      return fields
    } catch (err) {
      if (currentRequest === requestId) {
        eligibleFields.value = []
        error.value = err instanceof Error ? err.message : String(err)
      }
      return []
    } finally {
      if (currentRequest === requestId) {
        loading.value = false
      }
    }
  }

  watch(
    () => ({
      connectionId: toValue(options.connectionId),
      enabled: toValue(options.enabled ?? true),
      imports: JSON.stringify(toValue(options.imports) ?? []),
      extraFilters: JSON.stringify(toValue(options.extraFilters) ?? []),
      extraContent: JSON.stringify(toValue(options.extraContent) ?? []),
      currentFilename: toValue(options.currentFilename) ?? null,
    }),
    () => {
      void refresh()
    },
    { immediate: options.immediate ?? true },
  )

  return {
    eligibleFields: computed(() => eligibleFields.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    refresh,
  }
}
