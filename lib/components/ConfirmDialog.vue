<script setup lang="ts">
import ModalDialog from './ModalDialog.vue'

export interface ConfirmDialogProps {
  show: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  confirmTestId?: string
  cancelTestId?: string
  confirmDisabled?: boolean
}

withDefaults(defineProps<ConfirmDialogProps>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  confirmTestId: '',
  cancelTestId: '',
  confirmDisabled: false,
})

const emit = defineEmits<{
  close: []
  confirm: []
}>()
</script>

<template>
  <ModalDialog :show="show" :title="title" @close="emit('close')">
    <p class="confirm-message">{{ message }}</p>
    <template #footer>
      <button :data-testid="cancelTestId || undefined" class="cancel-btn" @click="emit('close')">
        {{ cancelLabel }}
      </button>
      <button
        :data-testid="confirmTestId || undefined"
        class="confirm-btn"
        :disabled="confirmDisabled"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.confirm-message {
  margin: 0;
  line-height: 1.55;
  color: var(--text-color);
}

.cancel-btn {
  background-color: var(--button-bg-color);
  color: var(--text-color);
  border: 1px solid var(--border);
}

.confirm-btn {
  background-color: var(--delete-color);
  color: white;
  border: 1px solid var(--delete-color);
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
