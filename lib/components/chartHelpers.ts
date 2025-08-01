// chartHelpers.ts
import type { View } from 'vega'
import type { ResultColumn,  ChartConfig, FieldKey } from '../editors/results'
import { ColumnType } from '../editors/results'
import type { ScenegraphEvent, SignalValue } from 'vega'
import {
  convertTimestampToISODate,
  isCategoricalColumn,
  isGeographicColumn,
  filteredColumns,
} from '../dashboards/helpers'

const DATETIME_COLS = [ColumnType.DATE, ColumnType.DATETIME, ColumnType.TIMESTAMP]
const COORDINATION_TIMEOUT = 750 // ms to wait before processing a brush clear as background click

export interface ChartEventHandlers {
  onDimensionClick: (data: any) => void
  onPointClick: (data: any) => void
  onBackgroundClick: () => void
}

export interface BrushState {
  lastBrushClearTime: number
  lastClickTime: number
  pendingBackgroundClick: boolean
}

export class ChromaChartHelpers {
  private brushState: BrushState = {
    lastBrushClearTime: 0,
    lastClickTime: 0,
    pendingBackgroundClick: false,
  }

  constructor(private eventHandlers: ChartEventHandlers) {}

  /**
   * Downloads the chart as a PNG file
   */
  async downloadChart(vegaView: View | null, emit: (event: string, ...args: any[]) => void): Promise<void> {
    if (!vegaView) {
      console.warn('Chart view not available for download')
      return
    }

    try {
      // Generate PNG image from the Vega view
      const imageUrl = await vegaView.toImageURL('png', 2) // 2x scale for better quality

      // Create download link
      const link = document.createElement('a')
      link.download = `chart-${Date.now()}.png`
      link.href = imageUrl

      // Trigger download
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      console.log('Chart downloaded successfully')
    } catch (error) {
      console.error('Error downloading chart:', error)
      emit('download-error', error)
    }
  }

  /**
   * Handles brush selection events for line and area charts
   */
  handleBrush(
    _: string,
    item: SignalValue,
    config: ChartConfig,
    columns: Map<string, ResultColumn>,
    emit: (event: string, ...args: any[]) => void
  ): void {
    if (item && ['line', 'area'].includes(config.chartType)) {
      if (!config.xField) return

      const timeField = columns.get(config.xField)
      if (!timeField) return

      let dateLookup = config.xField
      if (DATETIME_COLS.includes(timeField?.type)) {
        dateLookup = 'yearmonthdate_' + config.xField
      }

      const values = item[dateLookup as keyof typeof item] ?? []
      
      // Check if values exists and has elements
      if (!values || !Array.isArray(values) || values.length === 0) {
        // Brush is being cleared - record the time and schedule a background click
        this.brushState.lastBrushClearTime = Date.now()
        
        // If the last click time was within the coordination timeout, cancel the background click
        if (Date.now() - this.brushState.lastClickTime < COORDINATION_TIMEOUT) {
          console.log('Cancelling background click due to recent point click')
          this.brushState.pendingBackgroundClick = false
          return
        }
        
        console.log(
          'Scheduling background click due to brush clear, elapsed since last point click:',
          Date.now() - this.brushState.lastClickTime
        )
        this.eventHandlers.onBackgroundClick()
        return
      }

      const start = values[0]
      const end = values[values.length - 1]
      const timeAddress = timeField?.address

      if (!timeField || !timeAddress) return

      if (DATETIME_COLS.includes(timeField?.type)) {
        this.eventHandlers.onDimensionClick({
          filters: {
            [timeAddress]: [convertTimestampToISODate(start), convertTimestampToISODate(end)],
          },
          chart: { [config.xField]: [start, end] },
          append: false,
        })
      } else if ([ColumnType.NUMBER, ColumnType.INTEGER].includes(timeField?.type)) {
        this.eventHandlers.onDimensionClick({
          filters: { [timeAddress]: [start, end] },
          chart: { [config.xField]: [start, end] },
          append: false,
        })
      }
    } else {
      this.eventHandlers.onBackgroundClick()
    }
  }

  /**
   * Handles point click events for all chart types
   */
  handlePointClick(
    event: ScenegraphEvent,
    item: any,
    config: ChartConfig,
    columns: Map<string, ResultColumn>
  ): void {
    const currentTime = Date.now()
    this.brushState.lastClickTime = currentTime
    const append = event.shiftKey

    if (!item || !item.datum) {
      this.eventHandlers.onBackgroundClick()
      return
    }

    // Handle geographic charts
    if (config.geoField) {
      this.handleGeographicClick(item, config, columns, append)
      return
    }

    // Handle other chart types
    this.handleStandardClick(item, config, columns, append)
  }

  /**
   * Handles clicks on geographic charts
   */
  private handleGeographicClick(
    item: any,
    config: ChartConfig,
    columns: Map<string, ResultColumn>,
    append: boolean
  ): void {
    if (!config.geoField) return

    const geoField = columns.get(config.geoField)
    const geoConcept = geoField?.address

    if (!geoConcept || !geoField) return

    this.eventHandlers.onDimensionClick({
      filters: { [geoConcept]: item.datum[config.geoField] },
      chart: { [config.geoField]: item.datum[config.geoField] },
      append,
    })
  }

  /**
   * Handles clicks on standard charts (bar, line, point, etc.)
   */
  private handleStandardClick(
    item: any,
    config: ChartConfig,
    columns: Map<string, ResultColumn>,
    append: boolean
  ): void {
    let baseFilters = {}
    let baseChart = {}

    // Handle color field clicks
    if (config.colorField) {
      const colorField = columns.get(config.colorField)
      if (colorField && (isCategoricalColumn(colorField) || isGeographicColumn(colorField))) {
        const colorConcept = colorField?.address
        if (colorConcept && colorField) {
          baseFilters = { [colorConcept]: item.datum[config.colorField] }
          baseChart = {
            [config.colorField]: item.datum[config.colorField],
          }
        }
      }
    }

    // Handle x and y field clicks
    const xFieldRaw = config.xField
    const yFieldRaw = config.yField

    if (!xFieldRaw || !yFieldRaw) return

    const xField = columns.get(xFieldRaw)?.address
    const yField = columns.get(yFieldRaw)?.address

    if (!xField || !yField) return

    // Determine eligible fields for filtering
    const eligible = this.getEligibleFields(config, columns)

    // Handle x-field clicks
    if (item.datum[xFieldRaw] && eligible.includes(xFieldRaw)) {
      let xFilterValue = item.datum[xFieldRaw]
      
      if (DATETIME_COLS.includes(columns.get(xFieldRaw)?.type as ColumnType)) {
        xFilterValue = convertTimestampToISODate(item.datum[xFieldRaw])
      }
      
      baseFilters = { ...baseFilters, [xField]: xFilterValue }
      baseChart = { ...baseChart, [xFieldRaw]: item.datum[xFieldRaw] }
    }
    // Handle y-field clicks
    else if (item.datum[yFieldRaw] && eligible.includes(yFieldRaw)) {
      let yFilterValue = item.datum[yFieldRaw]
      
      if (DATETIME_COLS.includes(columns.get(yFieldRaw)?.type as ColumnType)) {
        yFilterValue = convertTimestampToISODate(item.datum[yFieldRaw])
      }
      
      baseFilters = { ...baseFilters, [yField]: yFilterValue }
      baseChart = { ...baseChart, [yFieldRaw]: item.datum[yFieldRaw] }
    }

    this.eventHandlers.onDimensionClick({
      filters: baseFilters,
      chart: baseChart,
      append,
    })
    
    this.eventHandlers.onPointClick(item.datum)
  }

  /**
   * Gets eligible fields for filtering based on chart type
   */
  private getEligibleFields(config: ChartConfig, columns: Map<string, ResultColumn>): string[] {
    let eligible = filteredColumns('categorical', columns).map((x) => x.name)
    eligible = eligible.concat(filteredColumns('geographic', columns).map((x) => x.name))
    eligible = eligible.concat(filteredColumns('latitude', columns).map((x) => x.name))
    eligible = eligible.concat(filteredColumns('longitude', columns).map((x) => x.name))
    
    if (config.chartType !== 'area') {
      eligible = eligible.concat(filteredColumns('temporal', columns).map((x) => x.name))
    }
    
    return eligible
  }

  /**
   * Validates if configuration fields still exist in columns
   */
  validateConfigFields(config: ChartConfig, columns: Map<string, ResultColumn>): boolean {
    let isValid = true
    const fieldsToCheck: FieldKey[] = [
      'xField',
      'yField',
      'colorField',
      'sizeField',
      'groupField',
      'geoField',
      'trellisField',
    ]

    for (const field of fieldsToCheck) {
      if (config[field] && !columns.has(config[field])) {
        config[field] = ''
        isValid = false
      }
    }

    return isValid
  }

  /**
   * Sets up event listeners for the Vega view
   */
  setupEventListeners(
    view: View,
    config: ChartConfig,
    columns: Map<string, ResultColumn>,
    isMobile: boolean,
    debouncedBrushHandler: (name: string, item: SignalValue) => void
  ): (() => void) | null {
    if (['area', 'line'].includes(config.chartType)) {
      view.addSignalListener('brush', debouncedBrushHandler)
      view.addEventListener('click', (event, item) => {
        this.handlePointClick(event, item, config, columns)
      })
      
      return () => {
        view.removeSignalListener('brush', debouncedBrushHandler)
        view.removeEventListener('click', (event, item) => {
          this.handlePointClick(event, item, config, columns)
        })
      }
    } else if (isMobile) {
      const touchHandler = (event: any, item: any) => {
        this.handlePointClick(event, item, config, columns)
      }
      view.addEventListener('touchend', touchHandler)
      
      return () => {
        view.removeEventListener('touchend', touchHandler)
      }
    } else {
      const clickHandler = (event: any, item: any) => {
        this.handlePointClick(event, item, config, columns)
      }
      view.addEventListener('click', clickHandler)
      
      return () => {
        view.removeEventListener('click', clickHandler)
      }
    }
  }
}