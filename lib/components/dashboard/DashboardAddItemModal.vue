<script lang="ts" setup>
import { ref } from 'vue'
import ModalDialog from '../ModalDialog.vue'
import { CELL_TYPES, type CellType } from '../../dashboards/base'

export interface DashboardAddItemModalProps {
  show: boolean
}

defineProps<DashboardAddItemModalProps>()

const emit = defineEmits<{
  add: [type: CellType]
  close: []
}>()

const newItemType = ref<CellType>(CELL_TYPES.CHART)

const itemOptions: Array<{
  value: CellType
  label: string
  description: string
  icon: string
  testId: string
}> = [
  {
    value: CELL_TYPES.CHART,
    label: 'Chart',
    description: 'Visualize trends, comparisons, and distributions.',
    icon: 'mdi-chart-bar',
    testId: 'dashboard-add-item-type-chart',
  },
  {
    value: CELL_TYPES.TABLE,
    label: 'Table',
    description: 'Show detailed rows and values in a grid.',
    icon: 'mdi-table-large',
    testId: 'dashboard-add-item-type-table',
  },
  {
    value: CELL_TYPES.MARKDOWN,
    label: 'Markdown',
    description: 'Add notes, headings, or narrative context.',
    icon: 'mdi-text-box-outline',
    testId: 'dashboard-add-item-type-markdown',
  },
  {
    value: CELL_TYPES.FILTER,
    label: 'Filter',
    description: 'Let viewers narrow the dashboard interactively.',
    icon: 'mdi-filter-variant',
    testId: 'dashboard-add-item-type-filter',
  },
  {
    value: CELL_TYPES.SECTION_HEADER,
    label: 'Section Header',
    description: 'Break the dashboard into labeled sections.',
    icon: 'mdi-format-title',
    testId: 'dashboard-add-item-type-section-header',
  },
]

function addItem(): void {
  emit('add', newItemType.value)
}

function closeModal(): void {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <ModalDialog
      :show="show"
      title="Add New Item"
      max-width="680px"
      test-id="dashboard-add-item-modal"
      @close="closeModal"
    >
      <div class="add-item-content">
        <p class="add-item-description">
          Choose the kind of block you want to add to the dashboard.
        </p>

        <div class="item-type-grid" role="radiogroup" aria-label="Dashboard item type">
          <label
            v-for="option in itemOptions"
            :key="option.value"
            class="item-option"
            :class="{ selected: newItemType === option.value }"
          >
            <input
              v-model="newItemType"
              class="item-option-input"
              type="radio"
              name="dashboard-add-item-type"
              :value="option.value"
              :data-testid="option.testId"
            />
            <span class="item-option-card">
              <span class="item-option-icon" aria-hidden="true">
                <i class="mdi" :class="option.icon"></i>
              </span>
              <span class="item-option-text">
                <span class="item-option-label">{{ option.label }}</span>
                <span class="item-option-help">{{ option.description }}</span>
              </span>
            </span>
          </label>
        </div>
      </div>

      <template #footer>
        <button class="cancel-button" @click="closeModal">Cancel</button>
        <button @click="addItem" class="add-button" data-testid="dashboard-add-item-confirm">
          Add Item
        </button>
      </template>
    </ModalDialog>
  </Teleport>
</template>

<style scoped>
.add-item-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.add-item-description {
  margin: 0;
  color: var(--text-faint);
  line-height: 1.5;
}

.item-type-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.item-option {
  min-width: 0;
  cursor: pointer;
}

.item-option-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.item-option-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 88px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--query-window-bg);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
  box-sizing: border-box;
}

.item-option:hover .item-option-card {
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.26);
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.035);
}

.item-option.selected .item-option-card {
  border-color: var(--special-text);
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.08);
  box-shadow: 0 0 0 3px rgba(var(--special-text-rgb, 37, 99, 235), 0.1);
}

.item-option-input:focus-visible + .item-option-card {
  border-color: var(--special-text);
  box-shadow: 0 0 0 3px rgba(var(--special-text-rgb, 37, 99, 235), 0.14);
}

.item-option-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 10px;
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.1);
  color: var(--special-text);
  font-size: 18px;
}

.item-option-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.item-option-label {
  color: var(--text-color);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

.item-option-help {
  color: var(--text-faint);
  font-size: 12px;
  line-height: 1.45;
}

.cancel-button,
.add-button {
  min-width: 108px;
  height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.cancel-button {
  background-color: var(--button-bg-color);
  color: var(--text-color);
  border-color: var(--border);
}

.add-button {
  background-color: var(--special-text);
  color: white;
  border-color: var(--special-text);
}

@media (max-width: 640px) {
  .item-type-grid {
    grid-template-columns: 1fr;
  }

  .item-option-card {
    min-height: 76px;
    padding: 12px;
  }

  :deep(.modal-overlay) {
    padding: 12px;
  }

  :deep(.modal-header) {
    padding: 16px 16px 0;
  }

  :deep(.modal-body) {
    padding: 14px 16px 16px;
  }

  :deep(.modal-footer) {
    gap: 8px;
    padding: 0 16px 16px;
  }
}

@media (max-width: 480px) {
  :deep(.modal-footer) {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .cancel-button,
  .add-button {
    width: 100%;
    min-width: 0;
    height: 42px;
  }
}
</style>
