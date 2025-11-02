import { type Row, type ResultColumn } from '../editors/results'
import { snakeCaseToCapitalizedWords } from './formatting'
import { isImageColumn, getFormatHint, getVegaFieldType, HIGHLIGHT_COLOR } from './helpers'
import { type ChartConfig } from '../editors/results'
import { DateTime } from 'luxon'

const HEADLINE_MAX = 20

const valueToString = (column: string, value: any): string => {
  if (value === null || value === undefined) {
    return `datum.${column} === null`
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `datum.${column} === ${String(value)}`
  }
  if (typeof value === 'string') {
    // Use JSON.stringify to properly escape all special characters including newlines
    return `datum.${column} === ${JSON.stringify(value)}`
  }
  if (value instanceof Date) {
    return `time(datum.${column}) === time(datetime(${value.getFullYear()}, ${value.getMonth()}, ${value.getDate()}))`
  }
  if (value instanceof DateTime) {
    const iso = value.toUTC().toISO()
    return `time(datum.${column}) === time(toDate("${iso}"))`
  }
  // Handle arrays and objects by converting to JSON string
  return `datum.${column} === ${JSON.stringify(value)}`
}

const createHeadlineLayer = (
  column: string,
  index: number,
  total: number,
  columns: Map<string, ResultColumn>,
  currentTheme: string,
  isMobile: boolean = false,
  datum: any = null,
  includeLabelSetting = true,
  intChart: { [key: string]: string | number | Array<any> }[],
  maxValueLength: number = 10, // New parameter for max value text length
  maxLabelLength: number = 10, // New parameter for max label text length
) => {
  let xOffset = 0
  let yOffset = 0

  if (isMobile) {
    // Vertical distribution for mobile
    yOffset =
      total > 1
        ? (((index - 1) / (total - 1)) * 0.7 + 0.15) * 100 - 50 // Values from -35% to +35% of height
        : 0 // Center if only one value
  } else {
    // Horizontal distribution for desktop
    xOffset =
      total > 1
        ? (((index - 1) / (total - 1)) * 0.7 + 0.15) * 100 - 50 // Values from -35% to +35% of width
        : 0 // Center if only one value
  }

  // Use the maximum lengths for consistent sizing across all layers
  const fontSizeFormula = isMobile
    ? `min(32, max(12, (height * 0.8) / (${total} * max(1, sqrt(${maxValueLength})))))` // Mobile: scale with height
    : `min(40, max(14, (width * 0.6) / (${total} * max(1, sqrt(${maxValueLength} * 1.5)))))` // Desktop: scale with width

  const labelFontSizeFormula = isMobile
    ? `min(10 , max(8, (height * 0.4) / (${total} * max(1, sqrt(${maxLabelLength})))))` // Mobile labels
    : `min(14, max(10, (width * 0.3) / (${total} * max(1, sqrt(${maxLabelLength} * 1.2)))))` // Desktop labels

  let topMark = {}
  let includeLabel = includeLabelSetting
  let selectMarks: object[] = []
  if (isImageColumn(columns.get(column) as ResultColumn)) {
    includeLabel = false // Don't show label for image columns
    let align = isMobile ? 'center' : 'center'
    topMark = {
      transform: [{ filter: valueToString(column, datum) }],
      mark: {
        type: 'image',
        width: isMobile ? { expr: `width` } : { expr: `width / ${total}` },
        height: isMobile ? { expr: `height / ${total}` } : { expr: `height` },
        align,
        baseline: 'middle',
        x: isMobile
          ? { expr: `width/2 + (${xOffset} / 100) * width` }
          : { expr: `width/2+ (${xOffset} / 100) * width` }, // Horizontal offset for desktop
        y: isMobile ? { expr: `${yOffset * 2.5}` } : { expr: `height/2` }, // Vertical offset for mobile, fixed for desktop
      },
      encoding: {
        url: {
          field: column,
          type: getVegaFieldType(column, columns),
          ...getFormatHint(column, columns),
        },
      },
      params: [
        {
          name: `highlight_${index}`,
          select: { type: 'point', on: 'mouseover', clear: 'mouseout' },
        },
        {
          name: `select_${index}`,
          select: { type: 'point', clear: false },
          value: intChart,
        },
      ],
    }
    selectMarks = isMobile
      ? [
          {
            mark: {
              type: 'rect',
              stroke: {
                expr: `vlSelectionTest('select_${index}_store', datum) && ${valueToString(column, datum)} ? '#FF7F7F' : 'transparent'`,
              },
              strokeWidth: 5,
              width: 1,
              height: 1,
              fillOpacity: 0,
              x: isMobile
                ? { expr: `width/2 + (${xOffset} / 100) * width` }
                : { expr: `width/2+ (${xOffset} / 100) * width` }, // Horizontal offset for desktop
              y: isMobile ? { expr: `${yOffset * 2.5}` } : { expr: `height/2` }, // Vertical offset for mobile, fixed for desktop
            },
          },
        ]
      : [
          {
            mark: {
              type: 'rect',
              stroke: {
                expr: `vlSelectionTest('select_${index}_store', datum) && ${valueToString(column, datum)} ? '#FF7F7F' : 'transparent'`,
              },
              strokeWidth: 5,
              width: 1,
              height: 1,
              fillOpacity: 0,
              x: isMobile
                ? { expr: `width/2+ (${xOffset} / 100) * width` }
                : { expr: `width/2+ (${xOffset} / 100) * width` }, // Horizontal offset for desktop
              y: isMobile ? { expr: `(${yOffset} / 100) * height` } : 0,
            },
          },
        ]
  } else {
    topMark = {
      transform: [{ filter: `${valueToString(column, datum)}` }],
      mark: {
        type: 'text',
        fontSize: { expr: fontSizeFormula },
        fontWeight: 'bold',
        align: 'center',
        baseline: 'middle',
        dx: isMobile ? 0 : { expr: `(${xOffset} / 100) * width` }, // Horizontal offset for desktop
        dy: isMobile ? { expr: `(${yOffset} / 100) * height - 20` } : 0, // Vertical offset for mobile, fixed for desktop
      },
      encoding: {
        text: {
          field: column,
          type: getVegaFieldType(column, columns),
          ...getFormatHint(column, columns),
        },
        color: {
          condition: { param: `select_${index}`, value: HIGHLIGHT_COLOR, empty: false },
          value: currentTheme === 'light' ? '#262626' : '#f0f0f0',
        },
      },
      params: [
        {
          name: `highlight_${index}`,
          select: { type: 'point', on: 'mouseover', clear: 'mouseout' },
        },
        {
          name: `select_${index}`,
          select: { type: 'point', clear: false },
          value: intChart,
        },
      ],
    }
  }
  let labelMark = {
    mark: {
      type: 'text',
      fontSize: { expr: labelFontSizeFormula },
      fontWeight: 'normal',
      align: 'center',
      baseline: 'top',
      dx: isMobile ? 0 : { expr: `(${xOffset} / 100) * width` }, // Same offset as the value for desktop
      dy: isMobile ? { expr: `(${yOffset} / 100) * height` } : 20, // Vertical offset for mobile, fixed for desktop
    },
    encoding: {
      text: { value: snakeCaseToCapitalizedWords(column) },
      color: { value: currentTheme === 'light' ? '#595959' : '#d1d1d1' },
    },
  }
  if (!datum) {
    if (!includeLabel) {
      return []
    } else {
      return [labelMark]
    }
  }
  if (!includeLabel) {
    // If it's an image column, we don't need a label
    return [topMark].concat(selectMarks)
  }
  return [topMark, labelMark].concat(selectMarks)
}

export const createHeadlineSpec = (
  config: ChartConfig,
  data: readonly Row[] | null,
  columns: Map<string, ResultColumn>,
  currentTheme: string,
  isMobile: boolean = false,
  intChart: { [key: string]: string | number | Array<any> }[],
) => {
  let columnsArray = Array.from(columns.values())
  // Avoid trying to process too much
  let dataFull = data ? data.slice(0, HEADLINE_MAX) : []

  // Calculate maximum text lengths for consistent sizing
  let maxValueLength = 1
  let maxLabelLength = 1

  // Find max label length
  columnsArray.forEach((column) => {
    const labelLength = snakeCaseToCapitalizedWords(column.name).length
    maxLabelLength = Math.max(maxLabelLength, labelLength)
  })

  // Find max value length
  if (dataFull.length > 0) {
    dataFull.forEach((row) => {
      columnsArray.forEach((column) => {
        const value = row ? row[column.name] : null
        if (value !== null && value !== undefined) {
          const valueLength = String(value).length
          maxValueLength = Math.max(maxValueLength, valueLength)
        }
      })
    })
  }

  // Map each column to its visualization layers with proper index
  let size = columnsArray.length * dataFull.length
  let columnLayers = []

  // if we have no data, we create label layers only
  if (dataFull.length === 0) {
    columnLayers = [
      columnsArray.map((column, index2) => {
        let datum = null
        let filtered_display = intChart.filter((item) => {
          return (
            item[column.name] !== undefined &&
            item[column.name] !== null &&
            item[column.name] !== '' &&
            item[column.name] == datum
          )
        })
        return createHeadlineLayer(
          column.name,
          index2 + 1,
          size,
          columns,
          currentTheme,
          isMobile,
          datum,
          !(config.hideLegend === true),
          filtered_display,
          maxValueLength,
          maxLabelLength,
        )
      }),
    ]
  }
  // otherwise, loop through row and columns
  else {
    columnLayers = dataFull.map((row, index1) => {
      return columnsArray.map((column, index2) => {
        let datum = row ? (row ? row[column.name] : null) : null
        let filtered_display = intChart.filter((item) => {
          return (
            item[column.name] !== undefined &&
            item[column.name] !== null &&
            item[column.name] !== '' &&
            item[column.name] == datum
          )
        })
        const index = index1 * columnsArray.length + index2 + 1
        return createHeadlineLayer(
          column.name,
          index,
          size,
          columns,
          currentTheme,
          isMobile,
          datum,
          !(config.hideLegend === true),
          filtered_display,
          maxValueLength,
          maxLabelLength,
        )
      })
    })
  }

  // flatten array of arrays of arrays to a single array
  let flatLayers = columnLayers.reduce(
    (acc, val) => acc.concat(val.reduce((a, v) => a.concat(v), [])),
    [],
  )

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    description: 'A simple headline metric display',
    width: 'container',
    height: 'container',
    data: {
      values: data ? data : [],
    },

    config: {
      view: { stroke: null },
      axis: { grid: false, domain: false },
    },
    layer: flatLayers,
  }
}
