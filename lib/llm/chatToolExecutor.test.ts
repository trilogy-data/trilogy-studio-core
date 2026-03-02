import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatToolExecutor } from './chatToolExecutor'
import { MAX_TOOL_RESULT_ROWS } from './toolLoopCore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { ChatStoreType } from '../stores/chatStore'

// Minimal mock factory helpers
function makeRow(i: number) {
  return { id: i, value: `row-${i}` }
}

function makeResultsData(rowCount: number) {
  return {
    data: Array.from({ length: rowCount }, (_, i) => makeRow(i)),
    headers: { id: { name: 'id', type: 'int' }, value: { name: 'value', type: 'string' } },
  }
}

function makeArtifact(id: string, type: 'results' | 'chart' | 'markdown', data: any) {
  return { id, type, data, config: { resultSize: data?.data?.length ?? 0, columnCount: 2 } }
}

function makeChatStoreMock(artifacts: any[]) {
  return {
    activeChat: {
      artifacts,
      imports: [],
      dataConnectionName: 'test-conn',
      activeArtifactIndex: -1,
      getArtifactById: (id: string) => artifacts.find((a) => a.id === id) ?? null,
      addArtifact: vi.fn(),
      hideArtifact: vi.fn(),
    },
    activeChatId: 'chat-1',
  } as unknown as ChatStoreType
}

function makeConnectionStoreMock() {
  return {
    connections: {
      'test-conn': { connected: true },
    },
    getConnectionSources: () => [],
  } as unknown as ConnectionStoreType
}

function makeExecutor(artifacts: any[]) {
  const queryService = {} as any
  const connectionStore = makeConnectionStoreMock()
  const chatStore = makeChatStoreMock(artifacts)
  return new ChatToolExecutor(queryService, connectionStore, chatStore)
}

describe('ChatToolExecutor — get_artifact_rows', () => {
  it('returns error when no active chat', async () => {
    const executor = new ChatToolExecutor(
      {} as any,
      makeConnectionStoreMock(),
      { activeChat: null, activeChatId: null } as unknown as ChatStoreType,
    )
    const result = await executor.executeToolCall('get_artifact_rows', {
      artifact_id: 'art-1',
      start_row: 0,
      end_row: 10,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('No active chat')
  })

  it('returns error for unknown artifact ID', async () => {
    const executor = makeExecutor([])
    const result = await executor.executeToolCall('get_artifact_rows', {
      artifact_id: 'does-not-exist',
      start_row: 0,
      end_row: 5,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('returns error for non-tabular artifact types', async () => {
    const executor = makeExecutor([
      makeArtifact('art-md', 'markdown', { markdown: '# Hello', query: '', queryResults: null }),
    ])
    const result = await executor.executeToolCall('get_artifact_rows', {
      artifact_id: 'art-md',
      start_row: 0,
      end_row: 5,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not contain tabular data')
  })

  it('fetches a specific range from a results artifact', async () => {
    const rowCount = 200
    const data = makeResultsData(rowCount)
    const executor = makeExecutor([makeArtifact('art-big', 'results', data)])

    const result = await executor.executeToolCall('get_artifact_rows', {
      artifact_id: 'art-big',
      start_row: 50,
      end_row: 59,
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('Rows 50-59 of 200 total')
    // Should contain the requested rows
    expect(result.message).toContain('"id": 50')
    expect(result.message).toContain('"id": 59')
    // Should not contain rows outside the range
    expect(result.message).not.toContain('"id": 49,')
    expect(result.message).not.toContain('"id": 60,')
  })

  it('clamps start_row to 0 when given a negative value', async () => {
    const data = makeResultsData(10)
    const executor = makeExecutor([makeArtifact('art-1', 'results', data)])

    const result = await executor.executeToolCall('get_artifact_rows', {
      artifact_id: 'art-1',
      start_row: -5,
      end_row: 2,
    })
    expect(result.success).toBe(true)
    expect(result.message).toContain('Rows 0-2 of 10 total')
  })

  it('clamps end_row to last row when given an out-of-range value', async () => {
    const data = makeResultsData(10)
    const executor = makeExecutor([makeArtifact('art-1', 'results', data)])

    const result = await executor.executeToolCall('get_artifact_rows', {
      artifact_id: 'art-1',
      start_row: 0,
      end_row: 999,
    })
    expect(result.success).toBe(true)
    expect(result.message).toContain('Rows 0-9 of 10 total')
  })

  it('works for chart artifact type', async () => {
    const data = makeResultsData(20)
    const executor = makeExecutor([makeArtifact('art-chart', 'chart', data)])

    const result = await executor.executeToolCall('get_artifact_rows', {
      artifact_id: 'art-chart',
      start_row: 5,
      end_row: 9,
    })
    expect(result.success).toBe(true)
    expect(result.message).toContain('Rows 5-9 of 20 total')
  })

  it('handles data with toJSON() method', async () => {
    const rawData = makeResultsData(20)
    const artifactWithToJSON = {
      id: 'art-json',
      type: 'results' as const,
      data: { toJSON: () => rawData },
      config: { resultSize: 20, columnCount: 2 },
    }
    const executor = makeExecutor([artifactWithToJSON])

    const result = await executor.executeToolCall('get_artifact_rows', {
      artifact_id: 'art-json',
      start_row: 0,
      end_row: 4,
    })
    expect(result.success).toBe(true)
    expect(result.message).toContain('Rows 0-4 of 20 total')
  })
})

describe('ChatToolExecutor — get_artifact truncation', () => {
  it('returns full data for small result sets', async () => {
    const data = makeResultsData(10)
    const executor = makeExecutor([makeArtifact('art-small', 'results', data)])

    const result = await executor.executeToolCall('get_artifact', { artifact_id: 'art-small' })
    expect(result.success).toBe(true)
    expect(result.message).not.toContain('_truncated')
    expect(result.message).not.toContain('rows cut off')
  })

  it('truncates data for large result sets and includes cut notice', async () => {
    const rowCount = MAX_TOOL_RESULT_ROWS + 100
    const data = makeResultsData(rowCount)
    const executor = makeExecutor([makeArtifact('art-large', 'results', data)])

    const result = await executor.executeToolCall('get_artifact', { artifact_id: 'art-large' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('_truncated')
    expect(result.message).toContain('rows cut off')
    expect(result.message).toContain('get_artifact_rows')
    // Head row should be present
    expect(result.message).toContain('"id": 0')
    // A mid-range row should not be present in main data
    const midRow = MAX_TOOL_RESULT_ROWS / 2 + 1
    const parsed = JSON.parse(result.message!.replace(/^Artifact "[^"]*" \([^)]*\):\n/, ''))
    expect(parsed.data.data).toHaveLength(MAX_TOOL_RESULT_ROWS / 2)
    expect(parsed._tail).toHaveLength(MAX_TOOL_RESULT_ROWS / 2)
    expect(parsed._truncated).toContain(`${rowCount}`)
  })
})
