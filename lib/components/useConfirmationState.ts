import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'

export interface ConfirmationState<T> {
  isOpen: Ref<boolean>
  pendingItem: ShallowRef<T | null>
  openConfirmation: (item: T) => void
  closeConfirmation: () => void
  confirm: () => Promise<void>
}

export function useConfirmationState<T>(
  onConfirm: (item: T) => void | Promise<void>,
): ConfirmationState<T> {
  const isOpen = ref(false)
  const pendingItem = shallowRef<T | null>(null)

  const openConfirmation = (item: T) => {
    pendingItem.value = item
    isOpen.value = true
  }

  const closeConfirmation = () => {
    isOpen.value = false
    pendingItem.value = null
  }

  const confirm = async () => {
    if (pendingItem.value) {
      await onConfirm(pendingItem.value)
    }
    closeConfirmation()
  }

  return {
    isOpen,
    pendingItem,
    openConfirmation,
    closeConfirmation,
    confirm,
  }
}
