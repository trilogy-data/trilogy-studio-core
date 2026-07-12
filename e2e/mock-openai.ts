// mock-openai.ts
import { Page } from '@playwright/test'

export const CONST_GPT_MODELS = [{ id: 'gpt-5.2' }, { id: 'gpt-5.2-mini' }]
/**
 * Interface for OpenAI Model
 */
interface OpenAIModel {
  id: string
  [key: string]: any
}

/**
 * Interface for mocking options
 */
interface OpenAIMockOptions {
  models?: OpenAIModel[]
  completionHandler?: (requestBody: any) => Promise<any>
}

/**
 * Interface for response map in custom completion handler
 */
interface ResponseMap {
  [key: string]: string | ToolCallResponse
}

/**
 * Interface for tool call response
 */
export interface ToolCallResponse {
  text: string
  toolCalls?: {
    name: string
    input: Record<string, any>
  }[]
}

/**
 * Sets up mocks for OpenAI API calls
 * @param page - Playwright page object
 * @param options - Mocking options
 */
export async function setupOpenAIMocks(page: Page, options: OpenAIMockOptions = {}): Promise<void> {
  const { models = CONST_GPT_MODELS, completionHandler = defaultCompletionHandler } = options

  // Mock the models endpoint
  await page.route('https://api.openai.com/v1/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: models,
      }),
    })
  })

  // Mock the completions endpoint (Responses API)
  await page.route('https://api.openai.com/v1/responses', async (route) => {
    const requestBody = JSON.parse(route.request().postData() || '{}')
    const response = await completionHandler(requestBody)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    })
  })
}

/**
 * Extracts the text of the last input item from a Responses API request body.
 * Items may be role messages (string or part-array content) or
 * function_call_output items (string output).
 */
function extractLastInputText(requestBody: any): string {
  const input = requestBody.input || []
  const last = input[input.length - 1] || {}
  if (typeof last.output === 'string') return last.output
  if (typeof last.content === 'string') return last.content
  if (Array.isArray(last.content)) {
    return last.content.map((part: any) => part.text || '').join(' ')
  }
  return ''
}

/**
 * Builds a Responses API-shaped response body from text and optional tool calls.
 */
function buildResponsesBody(
  text: string,
  toolCalls: { name: string; input: Record<string, any> }[] | undefined,
  promptLength: number,
): any {
  const output: any[] = []
  if (text) {
    output.push({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text }],
    })
  }
  if (toolCalls && toolCalls.length > 0) {
    toolCalls.forEach((tc, index) => {
      output.push({
        type: 'function_call',
        call_id: `call_mock_${index}`,
        name: tc.name,
        arguments: JSON.stringify(tc.input),
      })
    })
  }

  const inputTokens = Math.floor(promptLength / 4)
  const outputTokens = Math.floor(text.length / 4)
  return {
    output,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  }
}

/**
 * Default handler for completion requests
 * @param requestBody - The request body sent to the OpenAI API
 * @returns Mocked response object
 */
async function defaultCompletionHandler(requestBody: any): Promise<any> {
  console.log('Mock received request:', requestBody)

  // Default response
  return buildResponsesBody('This is a mocked response from OpenAI API', undefined, 40)
}

/**
 * Creates a custom completion handler that returns specific responses based on prompt content
 * @param responseMap - Map of prompt substrings to response content (string or ToolCallResponse)
 * @returns Handler function for completion requests
 */
export function createCompletionHandler(
  responseMap: ResponseMap,
): (requestBody: any) => Promise<any> {
  return async (requestBody: any): Promise<any> => {
    const prompt = extractLastInputText(requestBody)

    // Find matching response based on prompt content
    let response: string | ToolCallResponse = 'Default mocked response'

    for (const [key, value] of Object.entries(responseMap)) {
      if (prompt.includes(key)) {
        response = value
        break
      }
    }

    // Handle ToolCallResponse (with tool calls)
    if (typeof response === 'object' && 'text' in response) {
      const toolCallResponse = response as ToolCallResponse
      return buildResponsesBody(toolCallResponse.text, toolCallResponse.toolCalls, prompt.length)
    }

    // Handle simple string response
    return buildResponsesBody(response as string, undefined, prompt.length)
  }
}

/**
 * Helper to create a tool call response with proper formatting
 */
export function createToolCallResponse(
  text: string,
  toolCalls: { name: string; input: Record<string, any> }[],
): ToolCallResponse {
  return { text, toolCalls }
}
