import { type Row, type ResultColumn } from '../editors/results'
import { snakeCaseToCapitalizedWords } from './formatting'
import { isImageColumn, getFormatHint, getVegaFieldType, HIGHLIGHT_COLOR } from './helpers'
import { type ChartConfig } from '../editors/results'

const valueToString = (column: string, value: any): string => {
  if (value === null || value === undefined) {
    return 'datum.${column} === null'
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `datum.${column} === ${String(value)}`
  }
  if (typeof value === 'string') {
    return `datum.${column} === '${value}'` // Escape single quotes for string literals
  }
  if (value instanceof Date) {
    return `time(datum.${column}) === time(datetime(${value.getFullYear()}, ${value.getMonth()}, ${value.getDate()}))`
  }
  // Handle arrays and objects by converting to JSON string
  return `time(datum.${column}) === ${JSON.stringify(value)}`
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

  // Scale font size based on number of metrics and layout
  const fontSizeFormula = isMobile
    ? `min(24, max(height, 120)/${Math.max(6, total * 2)})` // Use height for mobile
    : `min(30, max(width, 150)/${Math.max(8, total * 2)})` // Use width for desktop

  const labelFontSizeFormula = isMobile
    ? `min(12, max(height, 150)/${Math.max(4, total * 2.5)})` // Use height for mobile
    : `min(14, max(width, 200)/${Math.max(6, total * 3)})` // Use width for desktop
  let topMark = {}
  let includeLabel = includeLabelSetting
  let selectMarks: object[] = []
  if (isImageColumn(columns.get(column) as ResultColumn)) {
    includeLabel = false // Don't show label for image columns
    let align = isMobile? 'center' : 'center'
    topMark = {
      transform: [{ filter: valueToString(column, datum) }],
      mark: {
        type: 'image',
        width: isMobile ? { expr: `width` } : { expr: `width / ${total}` },
        height: isMobile ? { expr: `height / 3` } : { expr: `height` },
        align,
        baseline: 'middle',
        x: isMobile ? { expr: `width/2 + (${xOffset} / 100) * width` } : { expr: `width/2+ (${xOffset} / 100) * width` }, // Horizontal offset for desktop
        y: isMobile ? { expr: `${yOffset*1.5}`} : { expr: `height/2` }, // Vertical offset for mobile, fixed for desktop
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
          select: 'point',
          value: intChart,
        },
      ],
    }
    selectMarks = isMobile? [
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
          x: isMobile ?  { expr: `width/2+ (${xOffset} / 100) * width` } : { expr: `width/2+ (${xOffset} / 100) * width` }, // Horizontal offset for desktop
          y: isMobile ? { expr: `(${yOffset} / 100) * height` } : 0,
        },
      },
    ] : []
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
          select: 'point',
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
  // get all columns that are isNumericColumn using isNumericColumn
  let columnsArray = Array.from(columns.values())
  let dataFull = data ? data : []

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
        return createHeadlineLayer(
          column.name,
          (index1 + 1) * (index2 + 1),
          size,
          columns,
          currentTheme,
          isMobile,
          datum,
          !(config.hideLegend === true),
          filtered_display,
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
