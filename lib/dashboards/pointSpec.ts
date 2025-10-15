import { createFieldEncoding, createColorEncoding, createSizeEncoding } from './helpers'
import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { lightDefaultColor, darkDefaultColor } from './constants'

interface VegaTransform {
  type: string
  [key: string]: any
}

interface VegaMark {
  name?: string
  type: string
  transform?: VegaTransform[]
  [key: string]: any
}

export interface VegaSpec {
  marks?: VegaMark[]
  [key: string]: any
}

export function addLabelTransformToTextMarks(
  spec: VegaSpec,
  labelTransform?: VegaTransform,
): VegaSpec {
  // Default label transform
  const defaultLabelTransform: VegaTransform = {
    type: 'label',
    anchor: ['right', 'left', 'top', 'bottom'],
    offset: [1],
    size: { signal: '[width + 60, height]' },
  }

  // Use provided transform or default
  const transformToAdd = labelTransform || defaultLabelTransform

  // Deep clone the spec to avoid mutating the original
  const modifiedSpec: VegaSpec = JSON.parse(JSON.stringify(spec))

  // Check if marks array exists
  if (!modifiedSpec.marks || !Array.isArray(modifiedSpec.marks)) {
    return modifiedSpec
  }

  // Process each mark
  modifiedSpec.marks = modifiedSpec.marks.map((mark: VegaMark) => {
    // Check if this is a text mark
    if (mark.type === 'text') {
      // Clone the mark to avoid mutation
      const modifiedMark = { ...mark }

      // Check if transform already exists
      if (!modifiedMark.transform) {
        modifiedMark.transform = []
      } else {
        // Clone existing transforms
        modifiedMark.transform = [...modifiedMark.transform]
      }

      // Check if label transform already exists
      const hasLabelTransform = modifiedMark.transform.some(
        (transform: VegaTransform) => transform.type === 'label',
      )

      // Add label transform if it doesn't exist
      if (!hasLabelTransform) {
        modifiedMark.transform.push(transformToAdd)
      }

      return modifiedMark
    }

    return mark
  })

  return modifiedSpec
}

const createBrushParam = (selectedValues: { [key: string]: string | number | Array<any> }[], config: ChartConfig) => {
  let value = {}

  if (selectedValues.length === 0) {
    return {
      name: 'brush',
      select: {
        type: 'interval',
      },
    }
  }

  value = {
    x: selectedValues[0][config.xField as keyof typeof config],
    y: selectedValues[0][config.yField as keyof typeof config],
  }
  return {
    name: 'brush',
    select: {
      type: 'interval',
    },
    value,
  }
}

export const createPointChartSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  selectedValues: { [key: string]: string | number | Array<any> }[],
  currentTheme: string = 'light',
  isMobile: boolean = false,
  data: readonly Row[] = [],
) => {
  const color = currentTheme === 'light' ? lightDefaultColor : darkDefaultColor

  let baseLayer = {
    params: [
      {
        name: 'highlight',
        select: {
          type: 'point',
          on: 'mouseover',
          clear: 'mouseout',
        },
      },
      {
        name: 'select',
        select: {
          type: 'point',
          on: 'click,touchend',
        },
        value: selectedValues,
      },
      createBrushParam(
        // @ts-ignore
        selectedValues.filter((obj) => obj && (obj[config.xField] || obj[config.yField])).length > 0
          ? // @ts-ignore
            selectedValues.filter((obj) => obj[config.xField] || obj[config.yField])
          : [],
        config,
      ),
    ],
    mark: {
      type: 'point',
      filled: config.sizeField ? true : false,
      color: color,
    },
    encoding: {
      color: createColorEncoding(
        config,
        config.colorField,
        columns,
        isMobile,
        currentTheme,
        config.hideLegend,
        data,
      ),
      size: createSizeEncoding(config.sizeField, columns, isMobile, config.hideLegend),
      tooltip: tooltipFields,
    },
  }
  let base = [baseLayer] as any[]
  if (config.annotationField && columns.get(config.annotationField)) {
    base.push({
      mark: {
        type: 'text',
        align: 'left',
        baseline: 'middle',
        dx: 5,
        fontSize: 8,
      },
      encoding: {
        text: { field: config.annotationField, type: 'nominal' },
        color: { value: currentTheme === 'light' ? '#333333' : '#dddddd' },
      },
    })
  }
  return {
    layer: base,
    encoding: {
      x: createFieldEncoding(config.xField || '', columns, {}, true, {
        scale: config.scaleX,
        zero: false,
      }),
      y: createFieldEncoding(config.yField || '', columns, {}, true, {
        scale: config.scaleY,
        zero: false,
      }),
    },
  }
}
