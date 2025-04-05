// useFilterDebounce.ts
import { ref, type Ref } from 'vue'

type OnChangeFunction = (value: string) => void

export function useFilterDebounce(initialValue = '', onChange?: OnChangeFunction) {
  const filter: Ref<string> = ref(initialValue)
  const filterInput: Ref<string> = ref(initialValue)
  const debounceTimeout: Ref<number | null> = ref(null)

  function onFilterInput(event: Event) {
    const target = event.target as HTMLInputElement
    filterInput.value = target.value

    if (debounceTimeout.value !== null) {
      clearTimeout(debounceTimeout.value)
    }

    debounceTimeout.value = window.setTimeout(() => {
      applyFilter(filterInput.value)
    }, 500)
  }

  function applyFilter(filterValue: string) {
    filter.value = filterValue

    if (onChange && typeof onChange === 'function') {
      onChange(filterValue)
    }
  }

  // Clean up function
  function cleanup() {
    if (debounceTimeout.value !== null) {
      clearTimeout(debounceTimeout.value)
    }
  }

  return {
    filter,
    filterInput,
    onFilterInput,
    applyFilter,
    cleanup,
  }
}
