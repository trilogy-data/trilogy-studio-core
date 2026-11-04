// chartControlsManager.ts
import { ref } from 'vue'
import type { ChartConfig, ResultColumn, Row } from '../editors/results'
import { isLayeredConfig } from '../editors/results'
import {
  determineDefaultConfig,
  mergeAuthoredChartConfig,
  DEFAULTABLE_CHART_TYPES,
  type DefaultableChartType,
} from '../dashboards/helpers'
import { ChromaChartHelpers } from './chartHelpers'

const emptyConfig = (): ChartConfig => ({
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

export class ChartControlsManager {
  // Controls visibility state
  public controlsVisible = ref(false)
  public showingControls = ref(false)

  // Internal configuration that merges provided config with defaults
  public internalConfig = ref<ChartConfig>(emptyConfig())

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
    if (initialConfig && isLayeredConfig(initialConfig) && !force) {
      // A layered config is authored as a whole -- by a chart statement or an
      // agent -- and its field bindings live on the sub-layers. Merging
      // single-chart defaults into it would only add root fields the renderer
      // ignores, so take it verbatim.
      this.internalConfig.value = { ...initialConfig }
    } else if (initialConfig && !force) {
      // An authored config is overlaid on the type defaults, which fill the
      // roles it left empty. Facets and columns it already bound stay its
      // call: see `mergeAuthoredChartConfig` for why the defaults cannot just
      // be spread underneath.
      const configDefaults = this.getChartTypeDefaults(data, columns, initialConfig.chartType)
      this.internalConfig.value = {
        ...emptyConfig(),
        ...mergeAuthoredChartConfig(configDefaults, initialConfig),
      } as ChartConfig
    } else {
      // Auto select chart type and fields based on data types
      const configDefaults = this.getChartTypeDefaults(data, columns)
      this.internalConfig.value = { ...emptyConfig(), ...configDefaults }
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
      this.internalConfig.value = { ...emptyConfig(), ...configDefaults }
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
