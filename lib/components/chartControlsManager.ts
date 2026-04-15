// chartControlsManager.ts
import { ref } from 'vue'
import type { ChartConfig, ResultColumn, Row } from '../editors/results'
import { determineDefaultConfig } from '../dashboards/helpers'
import { ChromaChartHelpers } from './chartHelpers'

const DEFAULTABLE_CHART_TYPES = [
  'bar',
  'line',
  'barh',
  'point',
  'geo-map',
  'tree',
  'area',
  'headline',
  'donut',
  'heatmap',
] as const

type DefaultableChartType = (typeof DEFAULTABLE_CHART_TYPES)[number]

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

  private getChartTypeDefaults(
    data: readonly Row[],
    columns: Map<string, ResultColumn>,
    chartType?: ChartConfig['chartType'],
  ): Partial<ChartConfig> {
    if (chartType && (DEFAULTABLE_CHART_TYPES as readonly string[]).includes(chartType)) {
      return determineDefaultConfig(data, columns, chartType as DefaultableChartType)
    }
    return determineDefaultConfig(data, columns)
  }

  private applyMissingDefaultsForCurrentChartType(
    data: readonly Row[],
    columns: Map<string, ResultColumn>,
  ): void {
    const chartType = this.internalConfig.value.chartType
    const defaults = this.getChartTypeDefaults(data, columns, chartType)
    const fieldsToBackfill: Array<keyof ChartConfig> = [
      'xField',
      'yField',
      'yField2',
      'colorField',
      'sizeField',
      'groupField',
      'trellisField',
      'trellisRowField',
      'geoField',
      'annotationField',
    ]

    for (const field of fieldsToBackfill) {
      const currentValue = this.internalConfig.value[field]
      const defaultValue = defaults[field]
      if (
        (currentValue === undefined || currentValue === '') &&
        typeof defaultValue === 'string' &&
        defaultValue !== ''
      ) {
        this.internalConfig.value[field] = defaultValue as never
      }
    }
  }

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
      const configDefaults = this.getChartTypeDefaults(data, columns, initialConfig.chartType)
      this.internalConfig.value = {
        ...this.internalConfig.value,
        ...configDefaults,
        ...initialConfig,
      }
      this.applyMissingDefaultsForCurrentChartType(data, columns)
    } else {
      // Auto select chart type and fields based on data types
      const configDefaults = this.getChartTypeDefaults(data, columns)
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
      const configDefaults = this.getChartTypeDefaults(
        data,
        columns,
        value as ChartConfig['chartType'],
      )

      // Update all config fields
      Object.assign(this.internalConfig.value, configDefaults)
    } else {
      this.applyMissingDefaultsForCurrentChartType(data, columns)
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
