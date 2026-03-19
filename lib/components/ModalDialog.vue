<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    show: boolean
    title?: string
    maxWidth?: string
    testId?: string
    closeOnOverlay?: boolean
  }>(),
  {
    title: '',
    maxWidth: '400px',
    testId: '',
    closeOnOverlay: true,
  },
)

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <div
    v-if="props.show"
    class="modal-overlay"
    @click="props.closeOnOverlay ? emit('close') : undefined"
  >
    <div
      class="modal-panel"
      :style="{ maxWidth: props.maxWidth }"
      :data-testid="props.testId || undefined"
      @click.stop
    >
      <div v-if="props.title || $slots.header" class="modal-header">
        <slot name="header">
          <h3 class="modal-title">{{ props.title }}</h3>
        </slot>
      </div>
      <div class="modal-body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="modal-footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

.modal-panel {
  width: 100%;
  background-color: var(--bg-color);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  overflow: hidden;
}

.modal-header {
  padding: 18px 20px 0;
}

.modal-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
}

.modal-body {
  padding: 16px 20px 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 20px 20px;
}
</style>
