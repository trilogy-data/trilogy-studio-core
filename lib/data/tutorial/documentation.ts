import { DocumentationNode, Article, Paragraph } from './docTypes.ts'
import { DashboardTutorial } from './dashboardTutorial.ts'
import { ModelTutorial } from './modelTutorial.ts'
import { IntroTutorial } from './introTutorial.ts'
import { llmTutorial } from './llmTutorial.ts'
import {Reference} from './reference.ts'
import { TOS } from './terms_of_service.ts'

export const documentation: DocumentationNode[] = [
  new DocumentationNode('Studio', [
    IntroTutorial,
    DashboardTutorial,
    ModelTutorial,
    llmTutorial,
    new Article('Functionality', [
      new Paragraph(
        'Tip',
        'Trilogy Studio is a statically hosted website that uses a mix of precompiled scripts and dynamic imports for some connections to reduce bundle size.',
      ),
      new Paragraph(
        'Tip',
        'For Trilogy specific features, the studio relies on a pseudo-language server (there is a proper LSP available for vs-code, used in the vs-code extension, as well). By default this will use a cloud-hosted backend but studio can be configured to use a local address as well. ',
      ),
      new Paragraph(
        'Tip',
        'Trilogy Studio requires internet access to download certain dependencies - such as DuckDB WASM - on demand when utilizing a relevant connection. It can then be used offline if a local backend server is running. A pure offline option may be available in the future.',
        'tip',
      ),
    ]),
    new Article('Navigation', [
      new Paragraph(
        'Navigation',
        'On desktop, Trilogy Studio uses a left-hand navigation bar, a sidebar with context, and a main pane (which may be split) to present information. The sidebar is further split into sections; the first icons change the sidebar for the query editor, while the next section configures entirely new main screen experiences. Configuration/profile are accessible at the bottom. On mobile, Trilogy will instead use a top menu to access a navigation screen, and the main display will show only one particular field at a time.',
      ),
      new Paragraph(
        'Tip',
        "Don't forget to save! By default, Trilogy Studio stores your editors, connections, and models in browser local storage. Use the save buttons on the left-hand nav to record changes. You can also use the keyboard shortcuts Ctrl + S to save your work.",
        'tip',
      ),
    ]),

    new Article('Querying', [
      new Paragraph(
        'Querying',
        'A core goal of Trilogy Studio is to enable seamless running of Trilogy against backends. Raw SQL is fully supported as well to help with debugging, diagnostics, and other development tasks.',
      ),
      new Paragraph(
        'Editor Selection',
        'When creating an editor, you will select a type. Trilogy editors run Trilogy code; SQL editors run SQL. An editor must be associated with a connection and may be associated with a model.',
      ),
      new Paragraph(
        'Query Execution',
        'When running Trilogy queries, your command will first go to a backend server to be parsed/type-checked, then the output SQL will be returned to the editor to be run as a normal SQL query. SQL editors will submit directly to the configured connection without the first parsing pass.',
      ),
    ]),
    new Article('Connections', [
      new Paragraph(
        'Connections',
        'Editors must be associated with a connection. A connection represents a particular underlying backend database resource. Many IDEs can share one connection, but only a single query can be executed on a connection at a single point in time. Connections are also associated with a model, which enables configuration of additional editors as semantic sources.',
      ),
      new Paragraph(
        'Managing Connections',
        "You can view current connections below. Edit the model associated with a connection by clicking the model name next to it (or 'set model' if not set). Connections will not automatically connect on startup by default; click the connection button to connect. This connection view is always accessible through the connections page on the left side.",
      ),
      new Paragraph('ConnectionList', '', 'connections'),
    ]),
    new Article('DuckDB', [
      new Paragraph(
        'DuckDB',
        'DuckDB is always available as an in-browser database using the DuckDB WASM integration. No authentication is required. DuckDB also natively supports csv uploads through a widget available on the connection view. Most community duckdb models will reference publically available CSV or parquet files.',
      ),
    ]),
    new Article('Bigquery', [
      new Paragraph(
        'Connections',
        'Bigquery is supported through Oauth authentication as your identity. If you wish to use a service key file, please upvote this github issue: <a href="https://github.com/trilogy-data/trilogy-studio-core/issues/33" target="_blank">BQ Service Account Support</a>.',
      ),
    ]),
    new Article('Snowflake', [
      new Paragraph(
        'Connections',
        'Snowflake is supported with private key authentication. Read more at this link: <a href="https://docs.snowflake.com/en/user-guide/key-pair-auth" target="_blank">Snowflake Private Key Pairs</a>. You will need to provide the private key to connect after configuring your user with the public key portion. The rest of the authentication header can be derived from this. Remember to use caution of saving this key.',
      ),
    ]),
    new Article('Scheduling', [
      new Paragraph(
        'Scheduling',
        'Scheduling dashboards/scripts is a future feature. Please upvote this github issue: <a href="https://github.com/trilogy-data/trilogy-studio-core/issues/75" target="_blank">Scheduling</a>.',
      ),
    ]),
  ]),
  Reference,
  new DocumentationNode('Privacy And Data', [
    new Article('Privacy Policy', [
      new Paragraph('Last Updated', 'February 22, 2025'),
      new Paragraph(
        'Introduction',
        'This Privacy Policy explains how Trilogy Studio handles your information. While most processing occurs in your browser, we utilize some external services to enhance your development experience.',
        'section',
      ),
      new Paragraph(
        'Information We Collect',
        'Telemetry: We collect feature usage counts and patterns and coarse browser/geographic information to inform product decision and system performance using GoatTrack. This data is anonymous and does not include any personally identifiable information. Telemetry can be disabled in settings.',
        'section',
      ),
      new Paragraph(
        'Query Processing',
        'We process Trilogy queries to transform them to SQL based on your model inputs if you use the default query service. Results are returned to your browser for execution. No actual database connections or credentials are transmitted.',
        'subsection',
      ),
      new Paragraph(
        "What We Don't Collect",
        'We do not collect database credentials, database contents, query results, personal information, full source code, or authentication tokens, or any other personal information. Please report any issues with this to the github repository.',
        'section',
      ),
      new Paragraph(
        'Data Processing',
        'Query Execution: All database execution happens between your browser and remote service. Query results never pass through our servers.',
        'section',
      ),
      new Paragraph(
        'Security Measures',
        'Any saved local credentials will be encrypted in storage using a passphrase or Chrome credential storage. See Stored Info for more details.',
        'section',
      ),
      new Paragraph(
        "Children's Privacy",
        'Trilogy Studio is intended for adult data professionals.',
        'section',
      ),
      new Paragraph(
        'International Data',
        'Telemetry data may cross borders. SQL compilation happens in the US with default query service (fly.io).',
        'section',
      ),
      new Paragraph(
        'Changes to Privacy Policy',
        'We may update this policy to reflect new features or services, changed functionality, legal requirements, and security improvements.',
        'section',
      ),
      new Paragraph(
        'Google Account',
        'Trilogy Studio uses Google OAuth to authenticate users when using a Google Bigquery Oauth connection. Trilogy Studio uses a token provided by Google to authenticate your account. Trilogy Studio only requests scopes required for Bigquery read/write access, and the token never leaves your browser. It is used to communicate directly with Bigquery with the google javascript client library.',
      ),
      new Paragraph(
        'Contact Information',
        "For privacy-related questions: please post on the github repository <a href='https://github.com/trilogy-data/trilogy-studio-core'>here</a>.",
        'section',
      ),
      new Paragraph(
        'Legal Rights',
        'You retain all legal rights regarding your personal data, your source code, your database contents, and generated outputs.',
        'section',
      ),
      new Paragraph(
        'Effective Date',
        'This policy is effective as of February 22, 2025.',
        'conclusion',
      ),
    ]),
    new Article('Stored Info', [
      new Paragraph(
        'Local Data',
        'Trilogy Studio uses browser local storage for your editors and models. These do not leave your browser (except when a model is sent in to generate a query).',
      ),
      new Paragraph(
        'Secret Storage',
        'For databases and LLM connections that require credentials (password, API Key) to access, Trilogy Studio can optionally also store them locally for reuse. [They will never be sent to a remote server]. It will attempt to use secure browser credential storage but will fall back to storing the secret in local browser storage encrypted with a pass phrase if the browser APIs are not available. Be careful storing credentials and be prepared to rotate - consider using a password manager.',
      ),
      new Paragraph(
        'Secret Storage',
        'Local storage is convenient, but if you have a browser secret manager, that is a great place to store secrets as well!',
        'tip',
      ),
      new Paragraph(
        'Secret Storage',
        'A best practice is to use unique API tokens (such as for LLMs) and passwords in the studio, both to easily track usage and make rotation simple.',
        'tip',
      ),
    ]),
    new Article('Google', [
      new Paragraph(
        'Google Account',
        'Trilogy Studio uses Google OAuth to authenticate users when using a Google Bigquery connection. Trilogy Studio uses a token provided by Google to authenticate your account through the interactive sign-in flow. Trilogy Studio only requests scopes required for Bigquery read/write access, and the token never leaves your browser. This token is only used to communicate directly with BigQuery with the standard google javascript client library.',
      ),
    ]),
    new Article('Snowflake', [
      new Paragraph(
        'Google Account',
        'Trilogy Studio supports private key authentication for Snowflake. You will need to provide the private key to connect after configuring your user with the public key portion in Snowflake directly. The rest of the authentication header can be derived from this.',
      ),
    ]),
    new Article('Telemetry Details', [
      new Paragraph(
        'Telemetry',
        `<a href="https://www.goatcounter.com/">GoatCounter</a> is used to collect anonymized
        statistics about usage in the studio, such as feature usage. No uniquely identifying information is collected, though the system type, browser, screensize and country are recorded. You can disable telemetry in the settings menu.`,
      ),
    ]),
  ]),
  TOS,
  
]
