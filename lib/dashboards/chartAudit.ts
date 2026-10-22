import { type ChartConfig, type ResultColumn, type Row } from '../editors/results'
import {
  type ChartFieldRole,
  filteredColumns,
  isCategoricalColumn,
  isHexColumn,
  isImageColumn,
  isNumericColumn,
  isTemporalColumn,
} from './helpers'
import {
  type DiscreteRole,
  MAX_HEADLINE_ROWS,
  MAX_TRELLIS_CELLS,
  ROLE_CAPACITY,
  cardinalityMap,
  fitsRole,
} from './chartCardinality'

export type ChartAuditRule =
  | 'over-capacity'
  | 'trellis-cells'
  | 'never-bound'
  | 'role-type'
  | 'volume'
  | 'detail-aggregation'

export interface ChartAuditIssue {
  rule: ChartAuditRule
  role?: ChartFieldRole
  field?: string
  message: string
}

/** The discrete roles each chart type reads, with the capacity they are held to. */
const DISCRETE_ROLES: Partial<
  Record<ChartConfig['chartType'], Partial<Record<ChartFieldRole, DiscreteRole>>>
> = {
  bar: { xField: 'axis' },
  barh: { yField: 'axis' },
  heatmap: { xField: 'axis', yField: 'axis' },
  donut: { yField: 'legend' },
  boxplot: { groupField: 'axis' },
}

/** Roles that must hold a numeric column when bound. */
const NUMERIC_ROLES: Partial<Record<ChartConfig['chartType'], ChartFieldRole[]>> = {
  bar: ['yField', 'yField2'],
  barh: ['xField'],
  line: ['yField', 'yField2'],
  area: ['yField', 'yField2'],
  point: ['xField', 'yField', 'sizeField'],
  heatmap: ['colorField'],
  headline: ['xField'],
  donut: ['xField'],
  boxplot: ['yField'],
}

const field = (config: ChartConfig, role: ChartFieldRole): string | undefined => {
  const value = config[role]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * Lint a chart config against the data it will draw.
 *
 * This is the assertion side of `determineDefaultConfig`: a config the picker
 * produces for any result shape should come back with no issues, and the
 * corpus test holds it to that. Each rule is a readability floor, not a
 * validity check (`validateChartConfigForData` owns those):
 *
 *  - `over-capacity`: a discrete role holds more distinct values than it can
 *    show (`ROLE_CAPACITY`) while a narrower unbound categorical column exists.
 *    A required role with nothing better available is allowed through.
 *  - `trellis-cells`: both trellis dimensions together exceed `MAX_TRELLIS_CELLS`.
 *  - `never-bound`: a hex or image column sits in a field role.
 *  - `role-type`: a value role holds a non-numeric column.
 *  - `volume`: the chart type cannot show this many rows (a one-row scatter,
 *    a headline past its tile grid).
 *  - `detail-aggregation`: a bar chart folds many rows into each mark although
 *    a second numeric column would have let the rows plot individually.
 */
export const auditChartConfig = (
  data: readonly Row[],
  columns: Map<string, ResultColumn>,
  config: ChartConfig,
): ChartAuditIssue[] => {
  const issues: ChartAuditIssue[] = []
  const categorical = filteredColumns('categorical', columns).filter(
    (col) => !isHexColumn(col) && !isImageColumn(col),
  )
  const cardinality = cardinalityMap(data, categorical)
  const numericCount = filteredColumns('numeric', columns).length

  const bound = new Map<ChartFieldRole, string>()
  for (const role of Object.keys(config) as ChartFieldRole[]) {
    const name = field(config, role)
    if (name && columns.has(name)) bound.set(role, name)
  }
  const boundNames = new Set(bound.values())

  const discreteRoles: Partial<Record<ChartFieldRole, DiscreteRole>> = {
    ...(DISCRETE_ROLES[config.chartType] ?? {}),
    trellisField: 'facet',
    trellisRowField: 'facet',
  }
  const colorColumn = bound.has('colorField') ? columns.get(bound.get('colorField')!) : undefined
  if (colorColumn && isCategoricalColumn(colorColumn)) discreteRoles.colorField = 'legend'

  for (const [role, name] of bound) {
    const column = columns.get(name)!
    if (isHexColumn(column) || isImageColumn(column)) {
      issues.push({
        rule: 'never-bound',
        role,
        field: name,
        message: `${name} is a hex/image column and cannot be drawn as ${role}`,
      })
      continue
    }
    const discrete = discreteRoles[role]
    if (discrete) {
      const count = cardinality.get(name) ?? 0
      const capacity = ROLE_CAPACITY[discrete]
      const narrower = categorical.find(
        (col) => !boundNames.has(col.name) && (cardinality.get(col.name) ?? 0) <= capacity,
      )
      if (count > capacity && (narrower || !isRequired(config.chartType, role))) {
        issues.push({
          rule: 'over-capacity',
          role,
          field: name,
          message: `${name} has ${count} distinct values on ${role} (capacity ${capacity})${narrower ? `; ${narrower.name} fits` : ''}`,
        })
      }
    }
    if (NUMERIC_ROLES[config.chartType]?.includes(role) && !isNumericColumn(column)) {
      issues.push({
        rule: 'role-type',
        role,
        field: name,
        message: `${role} on a ${config.chartType} needs a numeric column, got ${name}`,
      })
    }
  }

  const rowCells = cardinality.get(bound.get('trellisRowField') ?? '') ?? 1
  const columnCells = cardinality.get(bound.get('trellisField') ?? '') ?? 1
  if (
    bound.has('trellisField') &&
    bound.has('trellisRowField') &&
    rowCells * columnCells > MAX_TRELLIS_CELLS
  ) {
    issues.push({
      rule: 'trellis-cells',
      message: `trellis draws ${rowCells * columnCells} panels (max ${MAX_TRELLIS_CELLS})`,
    })
  }

  if (config.chartType === 'point' && data.length < 2) {
    issues.push({ rule: 'volume', message: 'a scatter of one row shows nothing' })
  }
  // A headline is the floor when nothing else can draw the result, so it is
  // only over volume when a scatter or a bar was available instead.
  const chartable =
    numericCount >= 2 ||
    (numericCount >= 1 && categorical.some((col) => fitsRole(cardinality, col.name, 'axis')))
  if (config.chartType === 'headline' && data.length > MAX_HEADLINE_ROWS && chartable) {
    issues.push({
      rule: 'volume',
      message: `headline tiles ${data.length} rows (max ${MAX_HEADLINE_ROWS})`,
    })
  }
  if (config.chartType === 'line' || config.chartType === 'area') {
    const x = bound.get('xField')
    const xColumn = x ? columns.get(x) : undefined
    if (xColumn && !isTemporalColumn(xColumn) && !isCategoricalColumn(xColumn)) {
      issues.push({
        rule: 'role-type',
        role: 'xField',
        field: x,
        message: `${config.chartType} needs an ordered x axis, got ${x}`,
      })
    }
  }

  if ((config.chartType === 'bar' || config.chartType === 'barh') && numericCount >= 2) {
    let capacity = 1
    for (const [role, name] of bound) {
      if (role === 'yField2') continue
      const count = cardinality.get(name)
      if (count !== undefined) capacity *= Math.max(count, 1)
    }
    if (data.length > capacity) {
      issues.push({
        rule: 'detail-aggregation',
        message: `${data.length} rows fold into ${capacity} bars; a scatter of the numeric columns keeps each row`,
      })
    }
  }

  return issues
}

const REQUIRED_ROLES: Partial<Record<ChartConfig['chartType'], ChartFieldRole[]>> = {
  bar: ['xField'],
  barh: ['yField'],
  heatmap: ['xField', 'yField'],
  donut: ['yField'],
  boxplot: ['groupField'],
}

const isRequired = (chartType: ChartConfig['chartType'], role: ChartFieldRole): boolean =>
  REQUIRED_ROLES[chartType]?.includes(role) ?? false

export const formatChartAuditIssues = (issues: ChartAuditIssue[]): string =>
  issues.map((issue) => `[${issue.rule}] ${issue.message}`).join('\n')
