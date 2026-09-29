import { Article, Paragraph } from './docTypes'

export const StartupScripts = new Article('Startup Scripts', [
  new Paragraph(
    'Connection Setup',
    'Startup scripts prepare a connection before you use it, for example by creating tables, loading data, or applying session settings. Once enabled on a SQL editor, they run automatically whenever that connection connects or resets. No separate run-on-connect setting is needed. This does not make the connection itself connect automatically when Studio opens.',
  ),
  new Paragraph(
    'Configure a Startup Script',
    `<ol>
      <li>Create or choose a connection in the Connections sidebar.</li>
      <li>Create a SQL editor associated with that connection and give it a descriptive name, such as <code>setup/load_sales.sql</code>.</li>
      <li>Write and test the setup SQL for your database.</li>
      <li>Enable <strong>Startup</strong> in the editor toolbar (the tooltip reads “Run this script on connection startup”).</li>
      <li>Save the editor and connection so the configuration is available after reloading Studio.</li>
      <li>Connect to run its startup scripts. If already connected, save your work, reload Studio, and reconnect to apply the setup.</li>
    </ol>`,
  ),
  new Paragraph(
    'Example: Prepare a DuckDB Table',
    'For a DuckDB connection, the following SQL creates a small table that other editors can query. CREATE OR REPLACE makes it safe to rerun when reconnecting or resetting. Use the equivalent repeatable setup syntax for your database.',
  ),
  new Paragraph(
    'DuckDB Setup SQL',
    `CREATE OR REPLACE TABLE startup_example AS
SELECT 1 AS id, 'ready' AS status;`,
    'code',
  ),
  new Paragraph(
    'When Scripts Run',
    'All editors marked Startup for that connection run after the database connection resets, including when it first connects. Changing the SQL or toggling Startup in the editor does not immediately rerun it. To rerun setup for an already connected session, save your work, reload Studio, and reconnect. The sidebar’s Refresh connection action only reloads database metadata when already connected; it does not reset the session or rerun startup scripts. Startup submits the editor contents directly as SQL, without Trilogy compilation. Only editors belonging to that connection are selected.',
  ),
  new Paragraph(
    'Multiple Scripts and Dependencies',
    'Separate startup scripts are launched in parallel, with no guaranteed execution order. Put dependent SQL statements in one script, in the order they need to run, using a database that supports multi-statement scripts. Design setup to be repeatable: use CREATE OR REPLACE or IF NOT EXISTS where appropriate, and avoid inserts that duplicate data on each reconnect.',
    'tip',
  ),
  new Paragraph(
    'Diagnosing a Failure',
    'If a startup script fails, the connection is marked failed and the connection error popup identifies the script name (or remote file path), the connection, and the original database error. Open the named SQL editor, fix the SQL or the referenced data access, save it, and reconnect. For example, Startup script "setup/load_sales.sql" failed on connection "analytics" is followed by the database’s explanation. Other scripts may already have run; a startup failure does not roll back the entire group.',
  ),
  new Paragraph(
    'Disable a Startup Script',
    'Open the SQL editor, turn off Startup, and save. Future connections and resets will skip that script. Disabling it does not undo SQL that already ran, such as creating a table or loading data.',
  ),
])
