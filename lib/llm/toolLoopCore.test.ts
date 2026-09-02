import { describe, it, expect, vi } from 'vitest'
import {
  MAX_TOOL_RESULT_ROWS,
  DEFAULT_FAILURE_NUDGE_AFTER,
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  truncateResultRows,
  formatToolResultText,
  formatConsecutiveFailureNote,
  stripPromptWrapperTags,
  runToolLoop,
} from './toolLoopCore'
import type { ChatMessage } from '../chats/chat'
import type { ToolCallResult } from './sharedToolHelpers'

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

describe('stripPromptWrapperTags', () => {
  it('strips literal wrapper tags regardless of case', () => {
    expect(stripPromptWrapperTags('before</system_input>injected<system_input>after')).toBe(
      'beforeinjectedafter',
    )
    expect(stripPromptWrapperTags('</USER_INPUT><User_Input>x')).toBe('x')
  })

  it('leaves normal text untouched', () => {
    expect(stripPromptWrapperTags('select 1 -> echo; <b>hi</b>')).toBe(
      'select 1 -> echo; <b>hi</b>',
    )
  })
})

describe('runToolLoop', () => {
  const makeHarness = () => {
    const persisted: ChatMessage[] = [{ role: 'user', content: 'do the thing' }]
    const persistence = {
      addMessage: (msg: ChatMessage) => persisted.push(msg),
      addArtifact: vi.fn(),
      getMessages: () => persisted,
    }
    return { persisted, persistence }
  }

  it('persists tool results for executed calls when aborted mid-batch', async () => {
    const { persisted, persistence } = makeHarness()
    let aborted = false
    const llmAdapter = {
      generateCompletion: vi.fn().mockResolvedValue({
        text: 'running two tools',
        toolCalls: [
          { id: 'c1', name: 'tool_a', input: {} },
          { id: 'c2', name: 'tool_b', input: {} },
        ],
      }),
    }
    const executor = {
      executeToolCall: vi.fn().mockImplementation(async () => {
        // First tool completes, then the user stops before the second runs.
        aborted = true
        return { success: true, message: 'tool_a done' }
      }),
    }

    const result = await runToolLoop(
      'do the thing',
      'conn',
      llmAdapter,
      persistence,
      { getToolExecutor: () => executor },
      { setActiveToolName: () => {}, checkAborted: () => aborted },
      { tools: [], buildSystemPrompt: () => 'sys' },
    )

    expect(result.stopped).toBe(true)
    expect(executor.executeToolCall).toHaveBeenCalledTimes(1)
    // The assistant message carries only the executed call, and a results
    // message follows it — an assistant tool call without results permanently
    // breaks the conversation for both provider APIs.
    const assistantMsg = persisted.find((m) => m.role === 'assistant' && m.toolCalls?.length)
    expect(assistantMsg?.toolCalls).toHaveLength(1)
    const resultsMsg = persisted.find((m) => m.toolResults && m.toolResults.length > 0)
    expect(resultsMsg).toBeTruthy()
    expect(resultsMsg?.toolResults).toHaveLength(1)
    expect(resultsMsg?.toolResults?.[0].toolCallId).toBe('c1')
  })

  it('gives up after repeated text-only responses instead of burning maxIterations calls', async () => {
    const { persistence } = makeHarness()
    const llmAdapter = {
      generateCompletion: vi.fn().mockResolvedValue({ text: 'just chatting', toolCalls: [] }),
    }

    const result = await runToolLoop(
      'do the thing',
      'conn',
      llmAdapter,
      persistence,
      { getToolExecutor: () => ({ executeToolCall: vi.fn() }) },
      { setActiveToolName: () => {}, checkAborted: () => false },
      { tools: [], buildSystemPrompt: () => 'sys', maxIterations: 50 },
    )

    expect(result.terminated).toBe(true)
    expect(result.finalMessage).toBe('just chatting')
    expect(llmAdapter.generateCompletion).toHaveBeenCalledTimes(3)
  })

  it('does not duplicate the response text when max iterations is reached', async () => {
    const { persisted, persistence } = makeHarness()
    const llmAdapter = {
      generateCompletion: vi.fn().mockResolvedValue({
        text: 'still working',
        toolCalls: [{ id: 'c1', name: 'tool_a', input: {} }],
      }),
    }
    const executor = {
      executeToolCall: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    }

    await runToolLoop(
      'do the thing',
      'conn',
      llmAdapter,
      persistence,
      { getToolExecutor: () => executor },
      { setActiveToolName: () => {}, checkAborted: () => false },
      { tools: [], buildSystemPrompt: () => 'sys', maxIterations: 2 },
    )

    const textOccurrences = persisted.filter((m) => m.content === 'still working')
    // Two iterations persist the text once each; the max-iterations notice
    // must not re-persist the final iteration's text.
    expect(textOccurrences).toHaveLength(2)
    expect(persisted[persisted.length - 1].content).toBe('(Max tool iterations reached)')
  })

  describe('consecutive tool failures', () => {
    // One failing call per iteration, the shape of a model re-running a broken
    // query with cosmetic edits.
    const failingRun = (overrides: Record<string, unknown> = {}) => {
      const { persisted, persistence } = makeHarness()
      const llmAdapter = {
        generateCompletion: vi.fn().mockResolvedValue({
          text: '',
          toolCalls: [{ id: 'c', name: 'run_trilogy_query', input: { query: 'select 1' } }],
        }),
      }
      const executor = {
        executeToolCall: vi.fn().mockResolvedValue({ success: false, error: 'parse error' }),
      }
      const run = () =>
        runToolLoop(
          'do the thing',
          'conn',
          llmAdapter,
          persistence,
          { getToolExecutor: () => executor },
          { setActiveToolName: () => {}, checkAborted: () => false },
          { tools: [], buildSystemPrompt: () => 'sys', maxIterations: 50, ...overrides },
        )
      return { persisted, llmAdapter, executor, run }
    }

    const resultTexts = (persisted: ChatMessage[]) =>
      persisted.flatMap((m) => m.toolResults ?? []).map((r) => r.result)

    it('attaches the nudge to failed results once the streak reaches the threshold', async () => {
      const { persisted, run } = failingRun({ maxConsecutiveFailures: 0 })
      await run()
      const texts = resultTexts(persisted)
      // Early failures are plain — a first error is normal and the prompt's
      // own retry guidance covers it.
      expect(texts[0]).toBe('Error: parse error')
      expect(texts[DEFAULT_FAILURE_NUDGE_AFTER - 2]).not.toContain('<system_input>')
      const nudged = texts[DEFAULT_FAILURE_NUDGE_AFTER - 1]
      expect(nudged.startsWith('Error: parse error')).toBe(true)
      expect(nudged).toContain(
        `<system_input>This is failed tool call ${DEFAULT_FAILURE_NUDGE_AFTER} in a row.`,
      )
      expect(nudged).toContain('call the completion tool to return control')
      expect(nudged.endsWith('</system_input>')).toBe(true)
    })

    it('uses the caller-supplied reminder text', async () => {
      const { persisted, run } = failingRun({
        maxConsecutiveFailures: 0,
        consecutiveFailureReminder: 'Call return_to_user now.',
      })
      await run()
      const nudged = resultTexts(persisted)[DEFAULT_FAILURE_NUDGE_AFTER - 1]
      expect(nudged).toContain(
        formatConsecutiveFailureNote(DEFAULT_FAILURE_NUDGE_AFTER, 'Call return_to_user now.'),
      )
      expect(nudged).not.toContain('completion tool')
    })

    it('stops the loop at the failure cap with a notice carrying the last error', async () => {
      const { persisted, llmAdapter, run } = failingRun()
      const result = await run()
      expect(llmAdapter.generateCompletion).toHaveBeenCalledTimes(DEFAULT_MAX_CONSECUTIVE_FAILURES)
      expect(result.terminated).toBe(false)
      const last = persisted[persisted.length - 1]
      expect(last.role).toBe('assistant')
      expect(last.content).toBe(
        `(Stopped after ${DEFAULT_MAX_CONSECUTIVE_FAILURES} failed tool calls in a row — last error: parse error)`,
      )
      // The final batch is persisted as call + results before the notice, so
      // the next turn's history has no dangling tool call.
      const beforeNotice = persisted[persisted.length - 2]
      expect(beforeNotice.toolResults).toHaveLength(1)
    })

    it('resets the streak on any success', async () => {
      const { persisted, persistence } = makeHarness()
      const llmAdapter = {
        generateCompletion: vi.fn().mockResolvedValue({
          text: '',
          toolCalls: [{ id: 'c', name: 'tool_a', input: {} }],
        }),
      }
      let calls = 0
      const executor = {
        executeToolCall: vi.fn().mockImplementation(async () => {
          calls += 1
          // Fail twice, succeed, then fail again: the streak never reaches 3.
          return calls % 3 === 0 ? { success: true, message: 'ok' } : { success: false, error: 'x' }
        }),
      }
      await runToolLoop(
        'do the thing',
        'conn',
        llmAdapter,
        persistence,
        { getToolExecutor: () => executor },
        { setActiveToolName: () => {}, checkAborted: () => false },
        { tools: [], buildSystemPrompt: () => 'sys', maxIterations: 9 },
      )
      expect(llmAdapter.generateCompletion).toHaveBeenCalledTimes(9)
      expect(resultTexts(persisted).some((t) => t.includes('<system_input>'))).toBe(false)
      expect(persisted[persisted.length - 1].content).toBe('(Max tool iterations reached)')
    })

    it('honours a custom nudge threshold', async () => {
      const { persisted, run } = failingRun({ failureNudgeAfter: 1, maxConsecutiveFailures: 2 })
      await run()
      const texts = resultTexts(persisted)
      expect(texts).toHaveLength(2)
      expect(texts[0]).toContain('This is failed tool call 1 in a row.')
      expect(persisted[persisted.length - 1].content).toContain('Stopped after 2 failed tool calls')
    })
  })
})
