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
2. For each CSV: read_project_file to inspect headers / a few rows. RECOMMENDED for static CSVs that won't change at query time: materialize them into in-memory tables via a startup script, so DuckDB doesn't re-do CSV auto-detection (delimiter sniffing + type inference) on every query bind — that's the dominant per-query cost. Concretely:
   - create_file(name="setup.sql", type="sql", content="CREATE TEMP TABLE foo AS SELECT * FROM read_csv_auto('foo.csv'); ...") — one CREATE TEMP TABLE per CSV, table name = sanitized basename ("sales orders.csv" → "sales_orders").
   - set_file_purpose(name="setup.sql", purpose="startup") — runs on every connect / reset, and re-runs immediately so subsequent queries see the tables.
   Use judgement: skip materialization for CSVs you expect to change frequently, ones that are too large to fit in memory, or projects with no CSVs. Startup scripts can also be written in trilogy (.preql) when that's a better fit.
3. For each CSV: create_file(type="trilogy", ...) to define a datasource and concepts. Bind the datasource to the materialized table name when one was created in step 2; otherwise reference read_csv_auto('foo.csv') directly.
4. lint_file after each create / update on .preql files — fix errors before moving on. (lint_file on .sql is informational only; SQL is exercised at startup or via run_trilogy_query.)
5. run_trilogy_query for a quick smoke test (e.g. \`select count(*) as n from <some_concept>;\`).
6. return_to_user with a list of the files created and any caveats.

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
    name: 'create_file',
    description:
      "Create a new project file. Use type='trilogy' for a .preql data model (returns lint results — the file is created even on errors so you can iterate via update_file). Use type='sql' for raw SQL, typically a startup script of CREATE TEMP TABLE statements that materialize CSVs into in-memory tables.",
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'File name. The right extension (.preql / .sql) is appended if missing.',
        },
        type: {
          type: 'string',
          enum: ['trilogy', 'sql'],
          description:
            "'trilogy' for a .preql data model file; 'sql' for raw SQL (startup scripts, table setup).",
        },
        content: { type: 'string', description: 'File contents.' },
      },
      required: ['name', 'type', 'content'],
    },
  },
  {
    name: 'update_file',
    description:
      'Replace the contents of an existing .preql or .sql file. Returns lint results for trilogy files. If the file is tagged as a startup script, the connection is re-initialized so the new content takes effect immediately.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name including extension.' },
        content: { type: 'string', description: 'New file contents.' },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'set_file_purpose',
    description:
      "Tag a project file with a purpose, or clear its purpose tags. purpose='startup' marks the file (typically a .sql or .preql) as a connection startup script — its contents run on every connect / reset, in parallel with any other startup-tagged files. The tool also re-runs startup immediately so changes land in the current session. purpose='none' clears purpose tags. Used to materialize CSVs into in-memory tables before query-time bind, avoiding DuckDB's per-query CSV auto-detection.",
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'File name including extension.',
        },
        purpose: {
          type: 'string',
          enum: ['startup', 'none'],
          description:
            "'startup' to register as a connection startup script; 'none' to remove purpose tags.",
        },
      },
      required: ['name', 'purpose'],
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
    name: 'lint_file',
    description:
      'Lint a project file. For .preql / trilogy files: runs the resolver and returns syntax errors, unresolved references, and the concepts the file defines. For .sql files: no static linter — returns an informational note pointing at runtime checks (set_file_purpose=startup, run_trilogy_query). Use after create / update or any time you want to recheck without re-writing.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name including extension.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'run_trilogy_query',
    description:
      "Run a Trilogy query against the project's data connection (cross-references all attached editors). Use for smoke tests like `select count(*) as n from sales_total;`.",
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
