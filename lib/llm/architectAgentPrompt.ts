/**
 * Architect agent — sets up Trilogy data models from raw files in a
 * project. Distinct toolset from the generic chat: file-centric (list /
 * read / create / update / validate) plus a smoke-test query.
 *
 * Architects don't ask the user — they're spawned by the overseer with a
 * full task description, do the work, and call return_to_user with a
 * summary that bubbles back up via the subchat-completion injection.
 */
import { rulesInput, functions, aggFunctions, datatypes } from './data/constants'
import { RETURN_TO_USER_TOOL } from './chatAgentPrompt'

export interface ArchitectPromptOptions {
  projectName?: string
  projectDescription?: string
  /** Files currently in the project (the architect's working set). */
  files: { name: string; type: string; size: number }[]
  /** Active data connection — what queries run against. */
  dataConnectionName: string
  /** Whether the data connection is currently live. Subchats can't call
   *  connect_data_connection (overseer scope), so this is informational. */
  isDataConnectionActive: boolean
  /** Optional instructions text that replaces ARCHITECT_DEFAULT_INSTRUCTIONS.
   *  Dynamic context (files, data connection) is still appended automatically. */
  instructionsOverride?: string
}

function describeFile(f: { name: string; type: string; size: number }): string {
  return `  - ${f.name}  (${f.type}, ${f.size} bytes)`
}

/** Static instructions block — overridable per-project. Kept as a function so
 *  the embedded Trilogy constants (functions, data types) refresh with the
 *  build, even though the prose around them is stable. */
export function getArchitectDefaultInstructions(): string {
  return `You are an ARCHITECT subchat. Your job is to build a Trilogy data model from the raw files attached to this project. The user does not see this conversation — your overseer does. Work autonomously; when finished, call return_to_user with a brief summary.

TYPICAL WORKFLOW:
1. list_project_files to confirm what's there.
2. For each CSV: read_project_file to inspect headers / a few rows, then create_trilogy_file to define a datasource and concepts for it. CSVs are auto-registered as DuckDB tables — table name is the file name without extension, lightly sanitized (e.g. "sales orders.csv" → "sales_orders").
3. validate_trilogy_file after each create / update — fix errors before moving on.
4. run_trilogy_query for a quick smoke test (e.g. \`select count(*) as n from <some_concept>;\`).
5. return_to_user with a list of the .preql files created and any caveats.

TRILOGY SYNTAX RULES:
${rulesInput}

AGGREGATE FUNCTIONS: ${aggFunctions.join(', ')}
COMMON FUNCTIONS: ${functions.slice(0, 35).join(', ')}
VALID DATA TYPES: ${datatypes.join(', ')}

OPERATIONAL GUIDELINES:
- One .preql file per logical entity (one per CSV is a good default).
- Always include a \`datasource\` block bound to the underlying table, with a sensible \`grain\`.
- Define concepts for every column the user is likely to want; favor descriptive names over the raw column header.
- Don't return until at least one file validates cleanly and a smoke query succeeds, OR you've exhausted reasonable attempts and need to report blockers.
- Errors from the resolver are authoritative — read them carefully; don't guess fixes.`
}

export function buildArchitectSystemPrompt(opts: ArchitectPromptOptions): string {
  const filesBlock =
    opts.files.length > 0
      ? `FILES IN THIS PROJECT:\n${opts.files.map(describeFile).join('\n')}`
      : 'No files in this project yet.'

  const connectionBlock = opts.dataConnectionName
    ? `DATA CONNECTION: ${opts.dataConnectionName}${opts.isDataConnectionActive ? '' : ' (not yet connected — first run_trilogy_query will boot it)'}`
    : 'No data connection bound.'

  const instructions = opts.instructionsOverride?.trim() || getArchitectDefaultInstructions()

  return `${instructions}

${filesBlock}
${connectionBlock}
`
}

export const ARCHITECT_TOOLS = [
  {
    name: 'list_project_files',
    description:
      'List every file attached to the current project: name, type (preql / csv / sql / markdown / etc.), size in bytes.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_project_file',
    description:
      'Read the contents of a project file by name. Files over ~8000 chars are middle-truncated (head + tail kept, middle replaced with a <redacted N chars> marker) — for large CSVs prefer a SELECT * LIMIT 5 via run_trilogy_query to inspect representative rows.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'File name including extension (e.g. "sales.csv", "model.preql").',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_trilogy_file',
    description:
      'Create a new Trilogy (.preql) file in the project. Returns validation results — the file is created even on errors so you can iterate via update_trilogy_file.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name. ".preql" is appended if missing.' },
        content: { type: 'string', description: 'Trilogy source code.' },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'update_trilogy_file',
    description:
      'Replace the contents of an existing Trilogy (.preql) file. Returns validation results.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'rename_project_file',
    description:
      'Rename a file in the project. Both .preql and other attached files (CSV, SQL, markdown, …) can be renamed. Fails if `new_name` collides with an existing file.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Current file name including extension.' },
        new_name: { type: 'string', description: 'New file name including extension.' },
      },
      required: ['name', 'new_name'],
    },
  },
  {
    name: 'delete_project_file',
    description:
      'Remove a file from the project. Use to clean up obsolete .preql models or stale attachments. CSV deletions only detach from the project — the underlying registered DuckDB table is not dropped here.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name including extension.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'validate_trilogy_file',
    description:
      'Validate a Trilogy file against the resolver — returns syntax errors, unresolved references, and the concepts the file defines. Use after create / update and any time you want to lint without re-writing.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'run_trilogy_query',
    description:
      'Run a Trilogy query against the project\'s data connection (cross-references all attached editors). Use for smoke tests like `select count(*) as n from sales_total;`.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The Trilogy query to execute.' },
      },
      required: ['query'],
    },
  },
  RETURN_TO_USER_TOOL,
]
