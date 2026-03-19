import { describe, it, expect } from 'vitest'
import { MAX_TOOL_RESULT_ROWS, truncateResultRows, formatToolResultText } from './toolLoopCore'
import type { ToolCallResult } from './editorRefinementToolExecutor'

// Helper: build a plain jsonData object with N rows
function makeJsonData(rowCount: number) {
  return {
    headers: { id: { name: 'id', type: 'int' }, value: { name: 'value', type: 'string' } },
    data: Array.from({ length: rowCount }, (_, i) => ({ id: i, value: `row-${i}` })),
  }
}

describe('truncateResultRows', () => {
  it('returns all rows unchanged when count is at the limit', () => {
    const data = makeJsonData(MAX_TOOL_RESULT_ROWS)
    const { head, tail, totalRows, cutCount } = truncateResultRows(data)
    expect(cutCount).toBe(0)
    expect(totalRows).toBe(MAX_TOOL_RESULT_ROWS)
    expect(head).toHaveLength(MAX_TOOL_RESULT_ROWS)
    expect(tail).toHaveLength(0)
  })

  it('returns all rows unchanged when count is below the limit', () => {
    const data = makeJsonData(10)
    const { head, tail, totalRows, cutCount } = truncateResultRows(data)
    expect(cutCount).toBe(0)
    expect(totalRows).toBe(10)
    expect(head).toHaveLength(10)
    expect(tail).toHaveLength(0)
  })

  it('splits into head and tail when count exceeds the limit', () => {
    const rowCount = MAX_TOOL_RESULT_ROWS + 50 // 150 rows
    const data = makeJsonData(rowCount)
    const { head, tail, totalRows, cutCount } = truncateResultRows(data)

    const half = MAX_TOOL_RESULT_ROWS / 2
    expect(totalRows).toBe(rowCount)
    expect(cutCount).toBe(50)
    expect(head).toHaveLength(half)
    expect(tail).toHaveLength(half)

    // Head contains the first rows
    expect(head[0]).toEqual({ id: 0, value: 'row-0' })
    expect(head[half - 1]).toEqual({ id: half - 1, value: `row-${half - 1}` })

    // Tail contains the last rows
    expect(tail[0]).toEqual({ id: rowCount - half, value: `row-${rowCount - half}` })
    expect(tail[half - 1]).toEqual({ id: rowCount - 1, value: `row-${rowCount - 1}` })
  })

  it('handles null/missing data gracefully', () => {
    const { head, tail, totalRows, cutCount } = truncateResultRows(null)
    expect(cutCount).toBe(0)
    expect(totalRows).toBe(0)
    expect(head).toHaveLength(0)
    expect(tail).toHaveLength(0)
  })

  it('handles data object with no data array', () => {
    const { head, tail, totalRows, cutCount } = truncateResultRows({ headers: {} })
    expect(cutCount).toBe(0)
    expect(totalRows).toBe(0)
    expect(head).toHaveLength(0)
    expect(tail).toHaveLength(0)
  })
})

describe('formatToolResultText', () => {
  it('returns error string on failure', () => {
    const result: ToolCallResult = { success: false, error: 'Something went wrong' }
    expect(formatToolResultText(result)).toBe('Error: Something went wrong')
  })

  it('returns Success. when no artifact or message', () => {
    const result: ToolCallResult = { success: true }
    expect(formatToolResultText(result)).toBe('Success.')
  })

  it('returns message when no artifact', () => {
    const result: ToolCallResult = { success: true, message: 'Import selected.' }
    expect(formatToolResultText(result)).toBe('Import selected.')
  })

  it('includes artifact ID and row/column counts in success message', () => {
    const jsonData = makeJsonData(5)
    const result: ToolCallResult = {
      success: true,
      artifact: {
        id: 'art-abc',
        type: 'results',
        data: jsonData,
        config: { resultSize: 5, columnCount: 2, query: 'SELECT id, value' },
      },
    }
    const text = formatToolResultText(result)
    expect(text).toContain('Artifact ID: art-abc')
    expect(text).toContain('5 rows')
    expect(text).toContain('2 columns')
    // No truncation notice for small results
    expect(text).not.toContain('rows cut off')
  })

  it('does not truncate when rows are at the limit', () => {
    const jsonData = makeJsonData(MAX_TOOL_RESULT_ROWS)
    const result: ToolCallResult = {
      success: true,
      artifact: {
        id: 'art-full',
        type: 'results',
        data: jsonData,
        config: { resultSize: MAX_TOOL_RESULT_ROWS, columnCount: 2 },
      },
    }
    const text = formatToolResultText(result)
    expect(text).not.toContain('rows cut off')
    expect(text).toContain(`${MAX_TOOL_RESULT_ROWS} rows`)
  })

  it('truncates results and includes cut notice when rows exceed limit', () => {
    const rowCount = MAX_TOOL_RESULT_ROWS + 200
    const jsonData = makeJsonData(rowCount)
    const result: ToolCallResult = {
      success: true,
      artifact: {
        id: 'art-big',
        type: 'results',
        data: jsonData,
        config: { resultSize: rowCount, columnCount: 2 },
      },
    }
    const text = formatToolResultText(result)

    expect(text).toContain(`${rowCount} rows total`)
    expect(text).toContain('rows cut off')
    expect(text).toContain('200 of')
    expect(text).toContain('art-big')
    expect(text).toContain('get_artifact_rows')

    // First row of head should be present
    expect(text).toContain('"id": 0')
    // First row of tail: rowCount - 50
    const tailStart = rowCount - MAX_TOOL_RESULT_ROWS / 2
    expect(text).toContain(`"id": ${tailStart}`)
    // Middle rows should NOT be present
    const midRow = MAX_TOOL_RESULT_ROWS / 2 + 1
    expect(text).not.toContain(`"id": ${midRow},`)
  })

  it('uses toJSON() on artifact data when available', () => {
    const jsonData = makeJsonData(5)
    const dataWithToJSON = {
      toJSON: () => jsonData,
    }
    const result: ToolCallResult = {
      success: true,
      artifact: {
        id: 'art-json',
        type: 'results',
        data: dataWithToJSON as any,
        config: { resultSize: 5, columnCount: 2 },
      },
    }
    const text = formatToolResultText(result)
    expect(text).toContain('5 rows')
    expect(text).not.toContain('rows cut off')
  })
})
