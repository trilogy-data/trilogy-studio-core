// mock-openai.ts
import { Page } from '@playwright/test'

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
  const {
    models = [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }, { id: 'text-davinci-003' }],
    completionHandler = defaultCompletionHandler,
  } = options

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

  // Mock the completions endpoint
  await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
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
 * Default handler for completion requests
 * @param requestBody - The request body sent to the OpenAI API
 * @returns Mocked response object
 */
async function defaultCompletionHandler(requestBody: any): Promise<any> {
  console.log('Mock received request:', requestBody)

  // Default response
  return {
    choices: [
      {
        message: {
          content: 'This is a mocked response from OpenAI API',
        },
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  }
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
    const messages = requestBody.messages || []
    const lastMessage = messages[messages.length - 1] || {}
    const prompt = lastMessage.content || ''

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
      const contentText = toolCallResponse.text

      // Format tool calls in OpenAI native format
      const openaiToolCalls =
        toolCallResponse.toolCalls && toolCallResponse.toolCalls.length > 0
          ? toolCallResponse.toolCalls.map((tc, index) => ({
              id: `call_mock_${index}`,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.input),
              },
            }))
          : undefined

      return {
        choices: [
          {
            message: {
              content: contentText,
              tool_calls: openaiToolCalls,
            },
          },
        ],
        usage: {
          prompt_tokens: Math.floor(prompt.length / 4),
          completion_tokens: Math.floor(contentText.length / 4),
          total_tokens: Math.floor((prompt.length + contentText.length) / 4),
        },
      }
    }

    // Handle simple string response
    const responseContent = response as string
    return {
      choices: [
        {
          message: {
            content: responseContent,
          },
        },
      ],
      usage: {
        prompt_tokens: Math.floor(prompt.length / 4),
        completion_tokens: Math.floor(responseContent.length / 4),
        total_tokens: Math.floor((prompt.length + responseContent.length) / 4),
      },
    }
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
