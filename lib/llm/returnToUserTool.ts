/**
 * The conventional loop-terminating tool. Lives in its own dependency-free
 * module so lean consumers (the `agent` entry) can use it without pulling in
 * the Trilogy chat prompt and its syntax reference.
 */
export const RETURN_TO_USER_TOOL = {
  name: 'return_to_user',
  description:
    "Signal that you are done and return control to the user. You MUST call this tool when you have completed all requested tasks and are ready for the user's next input. Provide a brief summary of what was accomplished. Never end a turn with plain text — always call this tool when finished.",
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'A brief summary of what was accomplished or a response to the user.',
      },
    },
    required: ['message'],
  },
} as const
