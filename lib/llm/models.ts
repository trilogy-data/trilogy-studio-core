import { type LLMMessage } from './base'

export interface ChatInteraction {
  messages: LLMMessage[]
  extractionFn: (message: string) => string
  validationFn: (input: string) => Promise<boolean>
  mutationFn: (input: string) => boolean
}
