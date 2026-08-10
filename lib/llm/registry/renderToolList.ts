import type { LLMToolDefinition } from '../base'

/** Render a markdown bullet list of tools for inclusion in system prompts.
 *  Prompts should call this instead of hand-writing "AVAILABLE TOOLS" prose,
 *  which historically drifted from the actual tool arrays. */
export function renderToolListMarkdown(tools: LLMToolDefinition[]): string {
  return tools
    .map((tool) => {
      const firstSentence = tool.description.split(/(?<=\.)\s/)[0] || tool.description
      return `- **${tool.name}**: ${firstSentence}`
    })
    .join('\n')
}
