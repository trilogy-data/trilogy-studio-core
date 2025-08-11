import { type Row, type ResultColumn } from '../editors/results'
import { snakeCaseToCapitalizedWords } from './formatting'
import { isImageColumn, getColumnFormat, getVegaFieldType } from './helpers'

const createHeadlineLayer = (
  column: string,
  index: number,
  total: number,
  columns: Map<string, ResultColumn>,
  currentTheme: string,
  isMobile: boolean = false,
  datum: any = null,
) => {
  let xOffset = 0
  let yOffset = 0

  if (isMobile) {
    // Vertical distribution for mobile
    yOffset =
      total > 1
        ? ((index / (total - 1)) * 0.7 + 0.15) * 100 - 50 // Values from -35% to +35% of height
        : 0 // Center if only one value
  } else {
    // Horizontal distribution for desktop
    xOffset =
      total > 1
        ? ((index / (total - 1)) * 0.7 + 0.15) * 100 - 50 // Values from -35% to +35% of width
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
  let includeLabel = true
  if (isImageColumn(columns.get(column) as ResultColumn)) {
    includeLabel = false // Don't show label for image columns
    topMark = {
      mark: {
        type: 'image',
        width: { expr: `width / ${total}` },
        height: { expr: `height / ${total}` },
        align: 'center',
        baseline: 'middle',
        x: isMobile ? { expr: `width/2` } : { expr: `width/2+ (${xOffset} / 100) * width` }, // Horizontal offset for desktop
        y: isMobile ? { expr: `(${yOffset} / 100) * height - 20` } : { expr: `height/2 -20` }, // Vertical offset for mobile, fixed for desktop
      },
      encoding: {
        url: {
          field: column,
          type: getVegaFieldType(column, columns),
          format: getColumnFormat(column, columns),
        },
      },
    }
  } else {
    topMark = {
      mark: {
        type: 'text',
        fontSize: { expr: fontSizeFormula },
        fontWeight: 'bold',
        align: 'center',
        baseline: 'middle',
        dx: isMobile ? 0 : { expr: `(${xOffset} / 100) * width` }, // Horizontal offset for desktop
        dy: isMobile ? { expr: `(${yOffset} / 100) * height - 20` } : -20, // Vertical offset for mobile, fixed for desktop
      },
      encoding: {
        text: {
          field: column,
          type: getVegaFieldType(column, columns),
          format: getColumnFormat(column, columns),
        },
        color: { value: currentTheme === 'light' ? '#262626' : '#f0f0f0' },
      },
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
      dy: isMobile ? { expr: `(${yOffset} / 100) * height` } : 10, // Vertical offset for mobile, fixed for desktop
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
    return [topMark]
  }
  return [topMark, labelMark]
}

export const createHeadlineSpec = (
  data: readonly Row[] | null,
  columns: Map<string, ResultColumn>,
  currentTheme: string,
  isMobile: boolean = false,
) => {
  // get all columns that are isNumericColumn using isNumericColumn
  let columnsArray = Array.from(columns.values())

  // Map each column to its visualization layers with proper index
  let columnLayers = columnsArray.map((column, index) => {
    return createHeadlineLayer(
      column.name,
      index,
      columnsArray.length,
      columns,
      currentTheme,
      isMobile,
      data ? (data[0] ? data[0][column.name] : null) : null,
    )
  })

  // flatten array of arrays to a single array
  let flatLayers = columnLayers.reduce((acc, val) => acc.concat(val), [])

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    description: 'A simple headline metric display',
    width: 'container',
    height: 'container',
    data: {
      values: data ? data[0] : [],
    },
    config: {
      view: { stroke: null },
      axis: { grid: false, domain: false },
    },
    layer: flatLayers,
  }
}
