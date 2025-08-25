<template>
  <div class="chart-controls-panel">
    <div class="inner-padding">
      <!-- Chart Type Selection -->
      <div class="control-section">
        <div class="chart-type-icons">
          <button
            v-for="type in charts"
            :key="type.value"
            @click="updateConfig('chartType', type.value)"
            class="chart-icon"
            :class="{ selected: config.chartType === type.value }"
            :title="type.label"
            :data-testid="`chart-type-${type.value}`"
          >
            <div class="icon-container">
              <i :class="type.icon" class="icon"></i>
            </div>
          </button>
        </div>
      </div>

      <!-- Dynamic Control Sections -->
      <div
        v-for="section in controlSections"
        :key="section.name"
        class="control-section"
        v-show="section.controls.length > 0 || section.name === 'advanced'"
      >
        <label class="control-section-label">{{ section.label }}</label>
        
        <!-- Vega Editor Button (special case for Advanced section) -->
        <div v-if="section.name === 'advanced'" class="control-group no-drag">
          <label class="chart-label">Vega Editor</label>
          <button
            @click="$emit('open-vega-editor')"
            class="editor-btn"
            title="Open chart spec in Vega Editor"
          >
            <i class="mdi mdi-open-in-new icon"></i>
            Open in Editor
          </button>
        </div>

        <!-- Dynamic Controls -->
        <div
          v-for="control in section.controls"
          :key="control.id"
          class="control-group no-drag"
        >
          <label class="chart-label" :for="control.id">{{ control.label }}</label>
          
          <!-- Checkbox Input -->
          <input
            v-if="control.inputType === 'checkbox'"
            type="checkbox"
            :id="control.id"
            :checked="config[control.field] as boolean"
            @change="updateConfig(control.field, ($event.target as HTMLInputElement).checked)"
            data-testid="toggle-legend"
          />

          <!-- Select Input -->
          <select
            v-else
            :id="control.id"
            :value="config[control.field]"
            @change="updateConfig(control.field, ($event.target as HTMLInputElement).value)"
            class="form-select no-drag"
          >
            <option v-if="control.allowEmpty" value="">None</option>
            
            <!-- Options from predefined list -->
            <template v-if="control.options">
              <option
                v-for="option in control.options"
                :key="option"
                :value="option"
              >
                {{ option }}
              </option>
            </template>
            
            <!-- Options from filtered columns -->
            <template v-else>
              <option
                v-for="column in filteredColumns(control.columnFilter)"
                :key="column.name"
                :value="column.name"
              >
                {{ column.name }}{{ column.description ? ` - ${column.description}` : '' }}
              </option>
            </template>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue'
import type { PropType } from 'vue'
import type { ChartConfig, ResultColumn } from '../editors/results'
import { Controls, type ChartControl } from '../dashboards/constants'

interface ControlSection {
  name: string
  label: string
  controls: EnhancedChartControl[]
}

interface EnhancedChartControl extends ChartControl {
  inputType: 'select' | 'checkbox'
}

export default defineComponent({
  name: 'ChartControlPanel',
  emits: ['update-config', 'open-vega-editor'],
  props: {
    config: {
      type: Object as PropType<ChartConfig>,
      required: true,
    },
    charts: {
      type: Array as PropType<Array<{ value: string; label: string; icon: string }>>,
      required: true,
    },
    filteredColumns: {
      type: Function as PropType<
        (
          type:
            | 'numeric'
            | 'categorical'
            | 'temporal'
            | 'latitude'
            | 'longitude'
            | 'geographic'
            | 'all',
        ) => ResultColumn[]
      >,
      required: true,
    },
  },
  setup(props, { emit }) {
    // Helper function to determine input type
    const getInputType = (field: string): 'select' | 'checkbox' => {
      return ['hideLegend', 'hideLabel', 'showTitle'].includes(field) ? 'checkbox' : 'select'
    }

    // Enhanced controls with input type
    const enhancedControls = computed((): EnhancedChartControl[] => {
      return Controls
        .filter((control) => control.visibleFor.includes(props.config.chartType))
        .map((control) => ({
          ...control,
          inputType: getInputType(control.field)
        }))
    })

    // Group controls into sections
    const controlSections = computed((): ControlSection[] => {
      const sections: Record<string, ControlSection> = {
        axes: { name: 'axes', label: 'Axes', controls: [] },
        appearance: { name: 'appearance', label: 'Appearance', controls: [] },
        advanced: { name: 'advanced', label: 'Advanced', controls: [] }
      }

      enhancedControls.value.forEach((control) => {
        const sectionName = control.filterGroup || 'advanced'
        if (sections[sectionName]) {
          sections[sectionName].controls.push(control)
        }
      })

      // Return only sections that have controls or are advanced (which has the editor button)
      return Object.values(sections).filter(
        section => section.controls.length > 0 || section.name === 'advanced'
      )
    })

    // Centralized update function
    const updateConfig = (field: string, value: any) => {
      emit('update-config', field, value)
    }

    return {
      controlSections,
      updateConfig
    }
  },
})
</script>

<style scoped>
.chart-controls-panel {
  width: calc(100% - 10px);
  height: 100%;
  padding: 4px;
  background-color: var(--bg-color);
  overflow-y: scroll;
}

.inner-padding {
  padding: 5px;
}

.control-section {
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 8px;
}

.control-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.control-section-label {
  font-weight: 600;
  font-size: var(--small-font-size);
  display: block;
  margin-bottom: 4px;
  color: var(--text-color);
}

.control-group {
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chart-label {
  font-size: var(--small-font-size);
  margin-bottom: 0;
  white-space: nowrap;
  min-width: 80px;
  flex-shrink: 0;
}

.form-select {
  width: 100%;
  padding: 2px 4px;
  border: 1px solid var(--border-color);
  border-radius: 2px;
  background-color: var(--bg-color);
  color: var(--text-color);
  font-size: var(--small-font-size);
  height: var(--chart-control-height);
  flex-grow: 1;
}

.chart-type-icons {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-bottom: 6px;
}

.chart-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--chart-control-height);
  height: var(--chart-control-height);
  border: 1px solid var(--border-light);
  border-radius: 2px;
  background-color: var(--button-bg);
  cursor: pointer;
  transition: background-color 0.2s;
}

.chart-icon:hover {
  background-color: var(--button-mouseover);
}

.chart-icon.selected {
  background-color: var(--special-text);
  color: white;
}

.icon-container {
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon {
  font-size: var(--icon-size);
}

.editor-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border-light);
  border-radius: 2px;
  background-color: var(--button-bg);
  color: var(--text-color);
  cursor: pointer;
  font-size: var(--small-font-size);
  transition: background-color 0.2s;
}

.editor-btn:hover {
  background-color: var(--button-mouseover);
}

@media (max-width: 768px) {
  .form-select {
    height: var(--chart-control-height);
  }
}
</style>