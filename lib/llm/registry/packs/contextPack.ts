import type { RegisteredTool } from '../types'

export function buildContextPack(): RegisteredTool[] {
  return [
    {
      pack: 'context',
      definition: {
        name: 'compact_conversation',
        description:
          'Summarize and archive the older part of this conversation to free up context. Use when the conversation has grown very long, or the user asks to clean up / summarize the history. Recent messages are kept verbatim; archived ones are replaced by a detailed summary from the next turn onward.',
        input_schema: {
          type: 'object',
          properties: {
            focus: {
              type: 'string',
              description: 'Optional: what to emphasize preserving in the summary',
            },
          },
        },
      },
      availability: (ctx) =>
        ctx.session.requestCompaction
          ? { available: true }
          : { available: false, hint: 'Compaction is not available in this context.' },
      execute: async (input, ctx) =>
        ctx.session.requestCompaction!(input.focus ? String(input.focus) : undefined),
    },
  ]
}
