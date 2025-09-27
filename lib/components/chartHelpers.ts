// chartHelpers.ts
import type { View } from 'vega'
import type { ResultColumn, ChartConfig, FieldKey, BoolFieldKey } from '../editors/results'
import { ColumnType } from '../editors/results'
import type { ScenegraphEvent, SignalValue } from 'vega'
import { convertTimestampToISODate, filteredColumns } from '../dashboards/helpers'

const DATETIME_COLS = [ColumnType.DATE, ColumnType.DATETIME, ColumnType.TIMESTAMP]
const COORDINATION_TIMEOUT = 750 // ms to wait before processing a brush clear as background click
const BACKGROUND_CLICK_SUPPRESSION_TIMEOUT = 50 // ms to suppress background clicks after a point click

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

  constructor(private eventHandlers: ChartEventHandlers) { }

  /**
   * Downloads the chart as a PNG file
   */
  async downloadChart(
    vegaView: View | null,
    emit: (event: string, ...args: any[]) => void,
  ): Promise<void> {
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
  ): void {
    if (item && ['point'].includes(config.chartType)) {
      if (!config.xField || !config.yField) return
      const xField = columns.get(config.xField)
      const yField = columns.get(config.yField)
      if (!xField || !yField || !xField.address || !yField.address) return
      const xRange = item[config.xField as keyof typeof item] ?? []
      const yRange = item[config.yField as keyof typeof item] ?? []

      if (!xRange || !yRange || xRange.length === 0 || yRange.length === 0) {
        // Brush is being cleared - record the time and check if we should suppress background click
        this.brushState.lastBrushClearTime = Date.now()

        // If the last click time was within the coordination timeout, cancel the background click
        if (Date.now() - this.brushState.lastClickTime < COORDINATION_TIMEOUT) {
          console.log('Cancelling background click due to recent point click')
          this.brushState.pendingBackgroundClick = false
          return
        }

        console.log(
          'Scheduling background click due to brush clear, elapsed since last point click:',
          Date.now() - this.brushState.lastClickTime,
        )
        this.eventHandlers.onBackgroundClick()
        return
      }

      this.eventHandlers.onDimensionClick({
        filters: { [xField.address]: xRange, [yField.address]: yRange },
        // TODO: be able to set brush ranges properly
        // chart: { [config.xField]: xRange, [config.yField]: yRange },
        append: false,
      })
    } else if (item && ['line', 'area'].includes(config.chartType)) {
      if (!config.xField) return

      const timeField = columns.get(config.xField)
      if (!timeField) return

      let dateLookup = config.xField
      let isYear = columns.get(config.xField)?.traits?.includes('year') ?? false
      if (DATETIME_COLS.includes(timeField?.type)) {
        dateLookup = 'yearmonthdate_' + config.xField
      } else if (isYear) {
        dateLookup = 'year_' + config.xField
      }

      const values = item[dateLookup as keyof typeof item] ?? []
      // Check if values exists and has elements
      if (!values || !Array.isArray(values) || values.length === 0) {
        // Brush is being cleared - record the time and check if we should suppress background click
        this.brushState.lastBrushClearTime = Date.now()


        // If the last click time was within the coordination timeout, cancel the background click
        if (Date.now() - this.brushState.lastClickTime < COORDINATION_TIMEOUT) {
          console.log('Cancelling background click due to recent point click')
          this.brushState.pendingBackgroundClick = false
          return
        }

        console.log(
          'Scheduling background click due to brush clear, elapsed since last point click:',
          Date.now() - this.brushState.lastClickTime,
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
        if (isYear) {
          this.eventHandlers.onDimensionClick({
            filters: {
              [timeAddress]: [
                convertTimestampToISODate(start).getFullYear(),
                convertTimestampToISODate(end).getFullYear(),
              ],
            },
            chart: { [config.xField]: [start, end] },
            append: false,
          })
        } else {
          this.eventHandlers.onDimensionClick({
            filters: { [timeAddress]: [start, end] },
            chart: { [config.xField]: [start, end] },
            append: false,
          })
        }
      }
    } else {
      // Check if we should suppress background click
      if (
        config.chartType === 'headline' &&
        Date.now() - this.brushState.lastClickTime < BACKGROUND_CLICK_SUPPRESSION_TIMEOUT
      ) {
        console.log(
          `Suppressing background click - within ${BACKGROUND_CLICK_SUPPRESSION_TIMEOUT}ms of point click`,
        )
        return
      }
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
    columns: Map<string, ResultColumn>,
  ): void {
    
    const append = event.shiftKey
    if (!item || !item.datum) {
      if (config.chartType === 'headline'  &&
        Date.now() - this.brushState.lastClickTime < BACKGROUND_CLICK_SUPPRESSION_TIMEOUT) {
        console.log(`suppressing background click - within timeout of point click ${Date.now() - this.brushState.lastClickTime}ms`)
        return
      }

      this.eventHandlers.onBackgroundClick()

      return
    }
    const currentTime = Date.now()
    this.brushState.lastClickTime = currentTime
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
    append: boolean,
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
    append: boolean,
  ): void {
    let baseFilters = {}
    let baseChart = {}

    let baseCols = [config.xField, config.yField, config.colorField, config.annotationField]
    if (config.chartType === 'headline') {
      baseCols = [...Object.keys(item.datum)]
    }
    // Determine eligible fields for filtering
    const eligible = this.getEligibleFields(config, columns)
    // Handle x-field clicks
    let checks = baseCols.filter((f) => f && eligible.includes(f))
    if (checks.length === 0) {
      console.warn('No eligible fields for filtering found')
      return
    }
    //loop over eligible
    eligible.forEach((field) => {
      let fieldAddress = columns.get(field)?.address
      if (!fieldAddress) return
      if (item.datum[field] && eligible.includes(field)) {
        let filterValue = item.datum[field]

        if (DATETIME_COLS.includes(columns.get(field)?.type as ColumnType)) {
          if (config.chartType === 'area') {
            return
          }
          filterValue = convertTimestampToISODate(item.datum[field])
        } else if (columns.get(field)?.traits?.includes('year')) {
          if (config.chartType === 'area') {
            return
          }
          filterValue = convertTimestampToISODate(item.datum[field]).getFullYear()
        }

        baseFilters = { ...baseFilters, [fieldAddress]: filterValue }
        baseChart = { ...baseChart, [field]: item.datum[field] }
      }
    })
    console.log('Point click filters:', baseFilters)

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
    let anySet = false
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
      anySet = anySet || Boolean(config[field])
      if (config[field] && !columns.has(config[field])) {
        config[field] = ''
        isValid = false
      }
    }
    // config set
    const configKeys: BoolFieldKey[] = ['hideLegend', 'showTitle']
    let anyConfigSet = false
    for (const key of configKeys) {
      if (config[key] === true) {
        anyConfigSet = true
      }
    }
    // if we have no values set, update
    if (!anySet && !anyConfigSet) {
      return false
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
    debouncedBrushHandler: (name: string, item: SignalValue) => void,
  ): (() => void) | null {
    if (['area', 'line', 'point'].includes(config.chartType)) {
      // Create a reference to the click handler so we can remove it later
      const clickHandler = (event: any, item: any) => {
        this.handlePointClick(event, item, config, columns)
      }

      view.addSignalListener('brush', debouncedBrushHandler)
      view.addEventListener('click', clickHandler)

      return () => {
        view.removeSignalListener('brush', debouncedBrushHandler)
        view.removeEventListener('click', clickHandler)
      }
    } else if (isMobile) {
      const touchHandler = (event: any, item: any) => {
        this.handlePointClick(event, item, config, columns)
      }
      view.addEventListener('click', touchHandler)
      view.addEventListener('touchend', touchHandler)
      return () => {
        view.removeEventListener('touchend', touchHandler)
        view.removeEventListener('click', touchHandler)
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
