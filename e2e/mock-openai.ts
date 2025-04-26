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
  [key: string]: string
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
 * @param responseMap - Map of prompt substrings to response content
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
    let responseContent = 'Default mocked response'

    for (const [key, value] of Object.entries(responseMap)) {
      if (prompt.includes(key)) {
        responseContent = value
        break
      }
    }

    return {
      choices: [
        {
          message: {
            content: responseContent,
          },
        },
      ],
      usage: {
        prompt_tokens: Math.floor(prompt.length / 4), // Rough approximation
        completion_tokens: Math.floor(responseContent.length / 4),
        total_tokens: Math.floor((prompt.length + responseContent.length) / 4),
      },
    }
  }
}
