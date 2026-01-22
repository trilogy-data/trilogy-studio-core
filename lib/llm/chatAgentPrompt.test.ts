import { describe, it, expect } from 'vitest'
import { parseToolCalls } from './chatAgentPrompt'

describe('parseToolCalls', () => {
  describe('tool_use format (Anthropic style)', () => {
    it('should parse single tool call without text', () => {
      const response =
        '<tool_use>{"name": "edit_editor", "input": {"content": "SELECT * FROM users;"}}</tool_use>'
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(1)
      expect(calls[0].name).toBe('edit_editor')
      expect(calls[0].input).toEqual({ content: 'SELECT * FROM users;' })
    })

    it('should parse single tool call with preceding text', () => {
      const response = `Let me edit the query for you.
<tool_use>{"name": "edit_editor", "input": {"content": "SELECT * FROM users;"}}</tool_use>`
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(1)
      expect(calls[0].name).toBe('edit_editor')
      expect(calls[0].input).toEqual({ content: 'SELECT * FROM users;' })
    })

    it('should parse multiple tool calls', () => {
      const response = `Let me do both.
<tool_use>{"name": "validate_query", "input": {"query": "SELECT 1"}}</tool_use>
<tool_use>{"name": "edit_editor", "input": {"content": "SELECT 1;"}}</tool_use>`
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(2)
      expect(calls[0].name).toBe('validate_query')
      expect(calls[0].input).toEqual({ query: 'SELECT 1' })
      expect(calls[1].name).toBe('edit_editor')
      expect(calls[1].input).toEqual({ content: 'SELECT 1;' })
    })

    it('should parse tool call with nested JSON objects in input', () => {
      const response = `<tool_use>{"name": "edit_chart_config", "input": {"chartConfig": {"chartType": "point", "xField": "seats", "yField": "distance"}}}</tool_use>`
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(1)
      expect(calls[0].name).toBe('edit_chart_config')
      expect(calls[0].input).toEqual({
        chartConfig: {
          chartType: 'point',
          xField: 'seats',
          yField: 'distance',
        },
      })
    })

    it('should parse text + multiple tool calls with nested JSON (real Anthropic scenario)', () => {
      // This simulates the exact scenario reported by the user where:
      // 1. There's descriptive text before the tool calls
      // 2. Multiple tool calls in sequence
      // 3. One tool call has deeply nested JSON (chartConfig)
      const response = `Interesting data! There does appear to be a general trend that larger aircraft (more seats) tend to fly longer distances, though it's not perfectly linear. Let me write this query to the editor and set up a scatter plot visualization to show this relationship clearly:
<tool_use>{"name": "edit_editor", "input": {"content": "import flight;\\n\\n# Do planes that fly longer distances tend to carry more passengers?\\nselect\\n    aircraft.aircraft_model.seats,\\n    avg(distance) as avg_distance,\\n    count(id2) as flight_count\\norder by\\n    aircraft.aircraft_model.seats asc\\nlimit 100;"}}</tool_use>
<tool_use>{"name": "edit_chart_config", "input": {"chartConfig": {"chartType": "point", "xField": "aircraft_aircraft_model_seats", "yField": "avg_distance", "sizeField": "flight_count"}}}</tool_use>`

      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(2)

      // First tool call: edit_editor
      expect(calls[0].name).toBe('edit_editor')
      expect(calls[0].input.content).toContain('import flight;')
      expect(calls[0].input.content).toContain('avg(distance)')

      // Second tool call: edit_chart_config with nested object
      expect(calls[1].name).toBe('edit_chart_config')
      expect(calls[1].input).toEqual({
        chartConfig: {
          chartType: 'point',
          xField: 'aircraft_aircraft_model_seats',
          yField: 'avg_distance',
          sizeField: 'flight_count',
        },
      })
    })

    it('should parse tool call with deeply nested JSON', () => {
      const response = `<tool_use>{"name": "complex_tool", "input": {"level1": {"level2": {"level3": {"value": "deep"}}}}}</tool_use>`
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(1)
      expect(calls[0].name).toBe('complex_tool')
      expect(calls[0].input).toEqual({
        level1: { level2: { level3: { value: 'deep' } } },
      })
    })

    it('should parse tool call with JSON.stringify output (escaped newlines)', () => {
      // Note: This tests the format that JSON.stringify produces, where special chars are escaped
      const content = 'SELECT *\nFROM users\nWHERE active = true;'
      const input = { content }
      const response = `<tool_use>{"name": "edit_editor", "input": ${JSON.stringify(input)}}</tool_use>`
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(1)
      expect(calls[0].name).toBe('edit_editor')
      expect(calls[0].input.content).toBe(content)
    })

    it('should parse tool call with array values', () => {
      const response = `<tool_use>{"name": "multi_query", "input": {"queries": ["SELECT 1", "SELECT 2", "SELECT 3"]}}</tool_use>`
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(1)
      expect(calls[0].input.queries).toEqual(['SELECT 1', 'SELECT 2', 'SELECT 3'])
    })

    it('should handle tool calls with various whitespace patterns', () => {
      const response = `<tool_use>
{
  "name": "spaced_tool",
  "input": {
    "key": "value"
  }
}
</tool_use>`
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(1)
      expect(calls[0].name).toBe('spaced_tool')
      expect(calls[0].input).toEqual({ key: 'value' })
    })
  })

  describe('function_call format (alternative)', () => {
    it('should parse function_call format', () => {
      const response = `<function_call>{"name": "test_function", "arguments": {"arg1": "value1"}}</function_call>`
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(1)
      expect(calls[0].name).toBe('test_function')
      expect(calls[0].input).toEqual({ arg1: 'value1' })
    })
  })

  describe('JSON code block format', () => {
    it('should parse JSON code block with tool structure', () => {
      const response = '```json\n{"tool": "my_tool", "args": {"param": "value"}}\n```'
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(1)
      expect(calls[0].name).toBe('my_tool')
      expect(calls[0].input).toEqual({ param: 'value' })
    })

    it('should parse JSON code block with function structure', () => {
      const response = '```json\n{"function": "my_func", "arguments": {"param": "value"}}\n```'
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(1)
      expect(calls[0].name).toBe('my_func')
      expect(calls[0].input).toEqual({ param: 'value' })
    })

    it('should not parse JSON code block without tool/function key', () => {
      // The JSON code block pattern requires 'tool' or 'function' key to be present
      // This is to avoid matching arbitrary JSON blocks
      const response = '```json\n{"name": "my_tool", "input": {"param": "value"}}\n```'
      const calls = parseToolCalls(response)

      // Should not match because it doesn't have 'tool' or 'function' key
      expect(calls).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('should return empty array for text without tool calls', () => {
      const response = 'This is just a regular response without any tool calls.'
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(0)
    })

    it('should handle malformed JSON gracefully', () => {
      const response = '<tool_use>{"name": "broken", "input": {invalid json}}</tool_use>'
      const calls = parseToolCalls(response)

      // Should not crash, may return empty or skip malformed call
      expect(calls).toHaveLength(0)
    })

    it('should handle empty input object', () => {
      const response = '<tool_use>{"name": "no_args", "input": {}}</tool_use>'
      const calls = parseToolCalls(response)

      expect(calls).toHaveLength(1)
      expect(calls[0].name).toBe('no_args')
      expect(calls[0].input).toEqual({})
    })
  })

  describe('simulated anthropic.ts output format', () => {
    /**
     * These tests simulate the exact output format produced by anthropic.ts
     * when converting the Anthropic API response content array to a string
     */

    it('should parse format produced by anthropic.ts with nested chartConfig', () => {
      // Simulate what anthropic.ts produces:
      // responseText += `\n<tool_use>{"name": "${block.name}", "input": ${JSON.stringify(block.input)}}</tool_use>\n`
      const block1Input = { content: 'SELECT * FROM users;' }
      const block2Input = {
        chartConfig: {
          chartType: 'point',
          xField: 'aircraft_aircraft_model_seats',
          yField: 'avg_distance',
          sizeField: 'flight_count',
        },
      }

      let responseText = 'Interesting data! Let me write this query to the editor:'
      responseText += `\n<tool_use>{"name": "edit_editor", "input": ${JSON.stringify(block1Input)}}</tool_use>\n`
      responseText += `\n<tool_use>{"name": "edit_chart_config", "input": ${JSON.stringify(block2Input)}}</tool_use>\n`

      const calls = parseToolCalls(responseText)

      expect(calls).toHaveLength(2)
      expect(calls[0].name).toBe('edit_editor')
      expect(calls[0].input).toEqual(block1Input)
      expect(calls[1].name).toBe('edit_chart_config')
      expect(calls[1].input).toEqual(block2Input)
    })

    it('should parse format with complex multiline query content', () => {
      // This is the exact scenario from the user's bug report
      const block1Input = {
        content:
          'import flight;\n\n# Do planes that fly longer distances tend to carry more passengers?\nselect\n    aircraft.aircraft_model.seats,\n    avg(distance) as avg_distance,\n    count(id2) as flight_count\norder by\n    aircraft.aircraft_model.seats asc\nlimit 100;',
      }
      const block2Input = {
        chartConfig: {
          chartType: 'point',
          xField: 'aircraft_aircraft_model_seats',
          yField: 'avg_distance',
          sizeField: 'flight_count',
        },
      }

      let responseText =
        "Interesting data! There does appear to be a general trend that larger aircraft (more seats) tend to fly longer distances, though it's not perfectly linear. Let me write this query to the editor and set up a scatter plot visualization to show this relationship clearly:"
      responseText += `\n<tool_use>{"name": "edit_editor", "input": ${JSON.stringify(block1Input)}}</tool_use>\n`
      responseText += `\n<tool_use>{"name": "edit_chart_config", "input": ${JSON.stringify(block2Input)}}</tool_use>\n`

      const calls = parseToolCalls(responseText)

      expect(calls).toHaveLength(2)

      expect(calls[0].name).toBe('edit_editor')
      expect(calls[0].input.content).toContain('import flight;')
      expect(calls[0].input.content).toContain('avg(distance) as avg_distance')

      expect(calls[1].name).toBe('edit_chart_config')
      expect(calls[1].input.chartConfig.chartType).toBe('point')
      expect(calls[1].input.chartConfig.xField).toBe('aircraft_aircraft_model_seats')
    })
  })
})
