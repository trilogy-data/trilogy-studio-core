import { OpenRouterProvider } from './openrouter'

// URL for the demo token minting service.
// Update this to the production URL once deployed.
export const DEMO_TOKEN_SERVICE_URL = 'http://localhost:8080'

async function fetchDemoToken(): Promise<string> {
  const response = await fetch(`${DEMO_TOKEN_SERVICE_URL}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Demo token service returned ${response.status}: ${response.statusText}`)
  }
  const data = await response.json()
  if (!data.api_key) {
    throw new Error('Demo token service did not return an api_key')
  }
  return data.api_key
}

/**
 * DemoProvider is a dollar-limited, TTL-limited OpenRouter connection
 * whose API key is minted on demand from our token service rather than
 * supplied by the user.  The key is never persisted to storage — every
 * reconnect fetches a fresh (but idempotent-per-IP) token.
 */
export class DemoProvider extends OpenRouterProvider {
  public type: string = 'demo'

  constructor(name: string, model: string) {
    // apiKey starts empty; reset() will populate it before connecting
    super(name, '', model, false)
  }

  /**
   * Fetches a fresh demo token then delegates to OpenRouterProvider.reset()
   * to validate the key and load available models.
   * The token fetch is NOT treated as a user-initiated change so it does
   * not set this.changed = true.
   */
  async reset(): Promise<void> {
    const prevChanged = this.changed
    this.apiKey = await fetchDemoToken()
    this.changed = prevChanged
    return super.reset()
  }

  toJSON(): object {
    return {
      name: this.name,
      model: this.model,
      fastModel: this.fastModel,
      type: 'demo',
      apiKey: null, // never persisted — always re-fetched from the token service
      saveCredential: false,
      isDefault: this.isDefault,
    }
  }

  static async fromJSON(json: Record<string, any>): Promise<DemoProvider> {
    const instance = new DemoProvider(json.name, json.model || '')
    instance.isDefault = json.isDefault || false
    instance.fastModel = json.fastModel || null
    return instance
  }
}
