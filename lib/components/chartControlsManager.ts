// chartControlsManager.ts
import { ref } from 'vue'
import type { ChartConfig, ResultColumn, Row } from '../editors/results'
import { determineDefaultConfig } from '../dashboards/helpers'
import { ChromaChartHelpers } from './chartHelpers'

export class ChartControlsManager {
  // Controls visibility state
  public controlsVisible = ref(false)
  public showingControls = ref(false)

  // Internal configuration that merges provided config with defaults
  public internalConfig = ref<ChartConfig>({
    chartType: 'bar',
    xField: '',
    yField: '',
    yField2: '',
    colorField: '',
    sizeField: '',
    groupField: '',
    trellisField: '',
    geoField: '',
    annotationField: '',
    hideLegend: false,
    showTitle: false,
  })

  constructor(private chartHelpers: ChromaChartHelpers) {}

  // Hover event handlers
  onChartMouseEnter(): void {
    this.controlsVisible.value = true
  }

  onChartMouseLeave(): void {
    this.controlsVisible.value = false
  }

  // Toggle controls visible/hidden
  toggleControls(): void {
    this.showingControls.value = !this.showingControls.value
  }

  // Initialize configuration with reasonable defaults
  initializeConfig(
    data: readonly Row[],
    columns: Map<string, ResultColumn>,
    initialConfig?: ChartConfig | null,
    onChartConfigChange?: (config: ChartConfig) => void,
    force: boolean = false,
  ): void {
    if (initialConfig && !force) {
      // Use external config if provided
      this.internalConfig.value = { ...this.internalConfig.value, ...initialConfig }
    } else {
      // Auto select chart type and fields based on data types
      const configDefaults = determineDefaultConfig(data, columns)
      this.internalConfig.value = { ...this.internalConfig.value, ...configDefaults }
      if (onChartConfigChange) {
        onChartConfigChange({ ...this.internalConfig.value })
      }
    }
  }

  // Update configuration and handle chart type changes
  updateConfig(
    field: keyof ChartConfig,
    value: string | boolean | number,
    data: readonly Row[],
    columns: Map<string, ResultColumn>,
    onChartConfigChange?: (config: ChartConfig) => void,
  ): void {
    // @ts-ignore
    this.internalConfig.value[field] = value

    console.log(`Updated config field ${field} to`, value)

    if (field === 'chartType') {
      // Reset other fields when changing chart type
      const configDefaults = determineDefaultConfig(
        data,
        columns,
        value as
          | 'bar'
          | 'line'
          | 'barh'
          | 'point'
          | 'usa-map'
          | 'tree'
          | 'area'
          | 'headline'
          | 'donut'
          | 'heatmap',
      )

      // Update all config fields
      Object.assign(this.internalConfig.value, configDefaults)
    }

    // Notify parent component if the callback is provided
    if (onChartConfigChange) {
      onChartConfigChange({ ...this.internalConfig.value })
    }
  }

  // Validate configuration fields
  validateAndResetConfig(
    data: readonly Row[],
    columns: Map<string, ResultColumn>,
    onChartConfigChange?: (config: ChartConfig) => void,
    initialConfig?: ChartConfig | null,
  ): boolean {
    const wasValid = this.chartHelpers.validateConfigFields(this.internalConfig.value, columns)
    if (!wasValid) {
      this.initializeConfig(data, columns, initialConfig, onChartConfigChange, false)
      const wasValidWithInitialConfig = this.chartHelpers.validateConfigFields(
        this.internalConfig.value,
        columns,
      )
      if (!wasValidWithInitialConfig) {
        this.initializeConfig(data, columns, null, onChartConfigChange, true)
        return false
      }
      return false
    }
    return true
  }
}