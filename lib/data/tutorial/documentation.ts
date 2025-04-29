import { DocumentationNode, Article, Paragraph } from './docTypes.ts'
import { DashboardTutorial } from './dashboardTutorial.ts'
import { ModelTutorial } from './modelTutorial.ts'
import { IntroTutorial } from './introTutorial.ts'
import { llmTutorial } from './llmTutorial.ts'
import { builtinFunctions } from './builtinFunctions.ts'
import { modelReference } from './modelReference.ts'
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
        'Scheduling dashboards/scripts is a future feature. Please upvote this github issue: <a href="https://github.com/trilogy-data/trilogy-studio-core/issues/75" target="_blank">Scheduling</a>.',),
    ]),
  ]),
  new DocumentationNode('Reference', [
    new Article('Overview/Goals', [
      new Paragraph(
        'Introduction',
        'Trilogy is a new, SQL-derived language that compiles to SQL. Trilogy Studio provides you with both native Trilogy and SQL editors, allowing you to query your data in a way that is more expressive and easier to maintain than traditional SQL.',
      ),
      new Paragraph(
        'Introduction',
        'Trilogy aspires to simplify hard parts of SQL, keep and enhance the good, incentivize the best, and add modern reusability, type-checking, and ergonomics. It should be approachable to query by someone that knows only SQL, and easy to model for someone familiar with SQL or Python.',
      ),
      new Paragraph(
        'Iterative SQL Development',
        'To capture the iterative SQL development loop, Trilogy includes a lightweight definition language directly in the language, allowing you to query and evolve the semantic layer in the same tool - and even in the same query session. This definition language (semantic layer, ERD, etc.) provides static typing/enforcement, and handles joins [1-1, 1-many, many-to-1], aggregations, filtering, and nulls automatically.',
      ),
      new Paragraph(
        'Trilogy Query Structure',
        'Trilogy looks like a SQL SELECT, without the FROM or GROUP BY clauses.',
      ),
      new Paragraph(
        'Trilogy Query Example',
        'WHERE\n    store_sales.date.year=2001 \n    AND store_sales.date.month_of_year=1 \n    AND store_sales.item.current_price > 1.2 * avg(store_sales.item.current_price) BY store_sales.item.category\nSELECT\n    store_sales.customer.state,\n    count(store_sales.customer.id) AS customer_count\nHAVING\n    customer_count > 10\nORDER BY\n    customer_count ASC NULLS FIRST,\n    store_sales.customer.state ASC NULLS FIRST\nLIMIT 100;',
        'code',
      ),
      new Paragraph(
        'How Trilogy Differs from SQL',
        'Trilogy removes the need for joins - and even tables - via imported models. The information about how to join tables is encoded once and reused automatically.',
      ),
      new Paragraph(
        'The Value of Trilogy',
        'Trilogy is not the first concept in this space. Many projects have aimed to improve SQL. Trilogy asserts that most of the value of a SQL query is in transformations and SELECT; joins and GROUP BY add little value to the expressiveness of the language.',
      ),
      new Paragraph(
        'Better SQL',
        'Trilogy improves on SQL by moving critical information such as keys, nullability, and query logic into the semantic layer. This allows automation of the hard parts of SQL queries.',
      ),
      new Paragraph(
        'Trilogy vs SQL Example',
        'USE AdventureWorks;\nSELECT \n    t.Name, \n    SUM(s.SubTotal) AS [Sub Total],\n    STR(Sum([TaxAmt])) AS [Total Taxes],\n    STR(Sum([TotalDue])) AS [Total Sales]\nFROM Sales.SalesOrderHeader AS s\n    INNER JOIN Sales.SalesTerritory AS t ON s.TerritoryID = t.TerritoryID\nGROUP BY \n    t.Name\nORDER BY \n    t.Name;',
        'code',
      ),
      new Paragraph(
        'Trilogy Equivalent',
        'import concepts.sales AS sales;\nSELECT\n    sales.territory_name,\n    sales.sub_total,\n    sales.total_taxes,\n    sales.total_sales\nORDER BY\n    sales.territory_name DESC;',
        'code',
      ),
      new Paragraph(
        'How Trilogy Works',
        'Trilogy requires some up-front binding to the database before the first query can be run. The cost to model the data is incurred infrequently, and then the savings are amortized over every user and query.',
      ),
      new Paragraph(
        'Usage',
        'Trilogy is designed to be easy to learn and use, and to be incrementally adopted. Trilogy can be used outside of Trilogy studio as a CLI or build tool.',
      ),
    ]),

    new Article('Querying Data', [
      new Paragraph(
        'SELECT Without FROM, JOIN, or GROUP BY',
        'In Trilogy, you can write queries without explicitly specifying tables, joins, or grouping. The semantic layer handles these details.',
      ),
      new Paragraph(
        'Example Query',
        "SELECT\n    product_line,\n    revenue,\n    revenue_from_top_customers,\n    revenue_from_top_customers / revenue AS revenue_from_top_customers_pct\nWHERE\n    product_line IN ('widgets', 'doodads');",
        'code',
      ),
    ]),
    new Article('Statements', [
      new Paragraph(
        'Basic SELECT Statement',
        'A Trilogy statement consists of one or more lines ending in a semicolon. Trilogy follows SQL syntax closely but removes redundant features like explicit joins and the FROM clause. A basic select could look like this:',
      ),
      new Paragraph(
        'Example',
        "SELECT\n    1 -> constant_one,\n    1 AS constant_one_2,\n    '2' -> constant_string_two;",
        'code',
      ),
      new Paragraph(
        'Select',
        'The general form of a select statement below. The where clause can also go after, but is idiomatically first.',
      ),
      new Paragraph(
        'Select',
        `where? 
"select"i 
select_list 
having? 
order_by? 
limit?`,
        'code',
      ),
      new Paragraph(
        'select_list',
        'A select list has one or more expressions, each with an optional alias. Aliased fields can be immediately referenced.',
      ),
      new Paragraph(
        'select_list',
        `select_item ("," select_item)* ","?
select_item: expression "->" IDENTIFIER ","?`,
        'code',
      ),
      new Paragraph(
        'where',
        'The where clause restricts data before the select expression. It can reference any field in the model, not just those in the select list. It cannot reference aggregates calculated in the select.',
      ),
      new Paragraph('where', `where_clause: "where"i expression ("," expression)* ","?`, 'code'),
      new Paragraph(
        'having',
        'The having clause restricts data after the select expression. It can reference any field in the select list, including aggregates.',
      ),
      new Paragraph('having', `having_clause: "where"i expression ("," expression)* ","?`, 'code'),
      new Paragraph(
        'Select List',
        'A multiselect statement can merge multiple select statements into a unified rowset by defining output keys to align on. This is rarely required, but can be used to produce certain outputs.',
      ),
      new Paragraph(
        'Multi-Select',
        `where? select_statement ( "merge" select_statement)+ 
"align"i align_clause 
having?
order_by? 
limit?`,
        'code',
      ),
      new Paragraph(
        'Align Clause',
        `align_item: IDENTIFIER ":" IDENTIFIER ("," IDENTIFIER)* ","?
align_clause: align_item ("," align_item)* ","?`,
        'code',
      ),
      new Paragraph('datasource text', 'A datasource defines a warehouse table to pull data from'),
      new Paragraph(
        'Datasource',
        `"datasource" IDENTIFIER 
"(" column_assignment_list ")" 
grain_clause?
complete_for_clause?
(address='string' | query='''string''')
`,
        'code',
      ),
      new Paragraph(
        'Merge',
        'merge_statement: "merge" IDENTIFIER ("," IDENTIFIER)_ ","? comment_',
        'code',
      ),
      new Paragraph(
        'Import',
        'import_statement: "import" (IDENTIFIER ".") * IDENTIFIER "as" IDENTIFIER',
        'code',
      ),
      new Paragraph(
        'Function Definition',
        'function_derivation: "def" "(" (IDENTIFIER ",")* ")" -> EXPR;',
        'code',
      ),
    ]),
    new Article('Concepts', [
      new Paragraph(
        'What Are Concepts?',
        'Concepts are core semantic building blocks in Trilogy. They represent keys, properties, or metrics: Keys (unique identifiers), Properties (additional values), and Metrics (aggregatable values).',
      ),
      new Paragraph(
        'Example',
        'key product_id int;# the unique identifier of a product \nproperty product_id.product_name string;# the name of a product \nmetric product_count <-count(product.id); # the count of products',
        'code',
      ),
      new Paragraph(
        'Keys',
        'Keys represent a unique conceptual grain. A combination of one or more keys will uniquely identify a set of properties. If familiar with databases, think of them as your primary/foreign keys. More generally, you can thing of them as something like a passport number, a product ID, a URL, or a stock ticker - a unique shorthand for an entity.',
      ),
      new Paragraph(
        'Key Syntax',
        'Keys have straight forward syntax; the keyword, the name, and the type.',
      ),
      new Paragraph('Example', 'key product_id int;# the unique identifier of a product', 'code'),
      new Paragraph('Properties', 'Properties are values associated with one or more keys'),
      new Paragraph(
        'Property Syntax',
        'Properties have a richer syntax than keys - they require the associated keys, within <>, before the property name.. syntax: `"property" <key1, key2, ..> "." IDENTIFIER type;`',
      ),
      new Paragraph(
        'Single Key Property',
        'A property can be associated with a single key with a shorthand syntax without the full <> group. syntax: `"property" key "." IDENTIFIER type;`',
        'tip',
      ),
      new Paragraph(
        'code',
        'property product_id.product_name string;# the name of a product',
        'code',
      ),
      new Paragraph(
        'Metrics',
        'Metrics are aggregatable values, and can come from properties, keys, or other metrics. Like keys, they have a grain, though this is inferred from the aggregation',
      ),
      new Paragraph(
        'Example',
        'metric product_count <-count(product.id); # the count of products',
        'code',
      ),
      new Paragraph(
        'Dynamic Grain',
        'A basic metric - like `metric product_count <- count(product_id);` - will have a dynamic aggregation level that corresponds to the query it is used in.',
      ),
      new Paragraph(
        'Static Grain',
        'A metric can be created by an aggregation with a defined grain, ex: `metric product_count <-count(product_id) by store;`, in which case it behaves similar to a property. However, where conditions for a select will still be pushed inside these aggregates.',
      ),
    ]),
    new Article('Datasources and Joins', [
      new Paragraph(
        'Defining Datasources',
        'A table in a warehouse is defined as a dataset with each column bound to a concept. When datasources share a common key, trilogy can join between them. Not all joins are equal; some are 1-1, 1-many, or many-1. Trilogy handles these by looking at the grain of each datasource involved. If a join is on a key other than the grain of the sources, the output may need to be grouped up to avoid duplication. ',
      ),
      new Paragraph(
        'Partial Keys',
        'A table may not have all values of a key. For example, a list of orders may not have every customer ID, as not all customers may have placed orders. A datasource can be defined with a key marked as partial by prefixing the ~ character. Trilogy will ensure that partial sources are used on the right side of an outer join to avoid implicitly reducing results.',
      ),
      new Paragraph(
        'Example',
        'datasource sales (\n     order_id: orders.id,\n cu_id:~customers.id,\n revenue: orders.revenue\n)\ngrain (orders.id)\naddress warehouse.sales;\n\ndatasource customers (\n    customer_id: customers.id,\n    name: customers.name\n)\ngrain (customers.id)\naddress warehouse.customers;',
        'code',
      ),
      new Paragraph(
        'Partial Keys',
        'The above two tables could be used to resolve sum(orders.revenue), customer.name via a join through customer.id, with the order table being on the right side of the join.',
      ),
    ]),
    new Article('Grains and Aggregation', [
      new Paragraph(
        'What Is a Grain?',
        'A grain represents the unique combination of keys. Tables and aggregations both have grains, which determine the minimum keys required on a row of data. For example, finding the total sales by customer might be an aggregation to the grain of a customer id. Properties of a key are implicitly dropped from any grain that includes that key, though a grain without the key associated with a property will include that property in the grain.',
      ),
      new Paragraph(
        'Example',
        'SELECT\n    order_date,\n    order_year,\n    SUM(total_spent) AS total_revenue;',
        'code',
      ),
      new Paragraph(
        'What Is a Grain?',
        'This query would aggregate revenue to the grain of order_date, assuming that year is a property of order.',
      ),
    ]),
    builtinFunctions,
    new Article('Custom Functions', [
      new Paragraph(
        'Defining Functions',
        'Functions are reusable snippets of code. Functions are defined using the def keyword and have a list of arguments and are mapped to an expression. Any argument alias will be locally scoped within the function, but external concepts can be referenced as well. The below function will multiple the input concept by itself and then by whatever the value of the global scale_factor is. Functions are called with the @ prefix.',
      ),
      new Paragraph(
        'Example',
        `const scale_factor<-2;\ndef square_scale(x) -> x * x *scale_factor;\n\nSELECT\n    number,\n    @square_scale(number) AS squared;`,
        'code',
      ),
      new Paragraph('Defining Functions', 'Functions may have optional defaults'),
      new Paragraph(
        'Example',
        `def pretty_percent(x, digits=2) ->  round(x*100, digits)::string || '%';\nconst number<-.4555;\n\nSELECT\n    number,\n  @pretty_percent(number) AS percent\n  @pretty_percent(number,3) AS three_percent;`,
        'code',
      ),
    ]),
    modelReference,
    new Article('Advanced Features', [
      new Paragraph(
        'Filtering',
        'Filtering can happen in two locations; the having clause or the where clause. Where clause filtering happens first, and reduces the space of potential results by the filtering criteria. This is applied prior to any aggregation happening in a query, and can reference any field that can be associated in the model. Having clause filtering is used to reduce the final result set, and is restricted to only filter on fields in the output projection.',
      ),
      new Paragraph(
        'Example',
        'WHERE\n sales.year = 2000 \nSELECT\n    product_name,\n    sum(revenue) as total_revenue HAVING total_revenue>1000;',
        'code',
      ),
      new Paragraph('Functions', 'Functions allow reusable expressions.'),
      new Paragraph(
        'Example',
        'def square(x) -> x * x;\n\nSELECT\n    number,\n    @square(number) AS squared;',
        'code',
      ),
    ]),
  ]),
  new DocumentationNode('Privacy And Data', [
    new Article('Privacy Policy', [
      new Paragraph('Last Updated', 'February 22, 2025'),
      new Paragraph(
        'Introduction',
        'This Privacy Policy explains how our browser-based Integrated Development Environment ("IDE") handles your information. While most processing occurs in your browser, we utilize some external services to enhance your development experience.',
        'section',
      ),
      new Paragraph(
        'Information We Collect',
        'Essential Telemetry: We collect screen resolution and viewport size, feature usage counts and patterns, browser type and version, and error rates and types.',
        'section',
      ),
      new Paragraph(
        'Query Processing',
        'We process Trilogy queries to transform them to SQL based on your model inputs.',
        'subsection',
      ),
      new Paragraph(
        'How We Use Your Information',
        'Telemetry Processing: We send anonymous usage data to GoatTrack for analytics. This helps us improve IDE performance and features. Data is aggregated and cannot identify individual users.',
        'section',
      ),
      new Paragraph(
        'Query Services',
        'Queries are sent to our formatting and code generation service. Results are returned to your browser for execution. No actual database connections or credentials are transmitted.',
        'subsection',
      ),
      new Paragraph(
        "What We Don't Collect",
        'We deliberately avoid collecting database credentials, database contents, query results, personal information, full source code, or authentication tokens.',
        'section',
      ),
      new Paragraph(
        'Data Processing',
        'Local Processing: All code execution occurs in your browser. Database connections are direct from browser to database. Query results never pass through our servers.',
        'section',
      ),
      new Paragraph(
        'Remote Processing',
        'Query formatting and optimization occurs on stateless servers. The full content of your editors is sent. All remote processing is temporary with no data retention.',
        'subsection',
      ),
      new Paragraph(
        'Third-Party Services',
        'GoatTrack processes anonymous usage statistics.',
        'section',
      ),
      new Paragraph(
        'Query Processing Service',
        'Temporary processing for formatting and generation, no data retention, HTTPS transmission.',
        'subsection',
      ),
      new Paragraph(
        'Security Measures',
        'All communications use TLS encryption. Telemetry data is anonymized before transmission.',
        'section',
      ),
      new Paragraph(
        'User Controls',
        'You can control local storage preferences and browser data retention.',
        'section',
      ),
      new Paragraph(
        "Children's Privacy",
        'Our IDE is intended for adults and is not designed for users under 13 years of age.',
        'section',
      ),
      new Paragraph(
        'International Data',
        'Telemetry data may cross borders. Query processing occurs in the jurisdiction of your backend. SQL compilation happens in the US primarily. We comply with international data protection laws.',
        'section',
      ),
      new Paragraph(
        'Changes to Privacy Policy',
        'We may update this policy to reflect new features or services, changed functionality, legal requirements, and security improvements. Changes will be communicated through the IDE interface.',
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
        'Secret Storage',
        'For databases and LLM connections that require credentials (password, API Key) to access, Trilogy Studio can optionally store them locally for reuse. [They will never be sent to a remote server]. It will attempt to use secure browser credential storage but will fall back to storing the secret in local browser storage encrypted with a pass phrase if the browser APIs are not available. Be careful storing credentials and be prepared to rotate - consider using a password manager.',
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
    new Article('Google Account', [
      new Paragraph(
        'Google Account',
        'Trilogy Studio uses Google OAuth to authenticate users when using a Google Bigquery Oauth connection. Trilogy Studio uses a token provided by Google to authenticate your account. Trilogy Studio only requests scopes required for Bigquery read/write access, and the token never leaves your browser. This oken is only used to communicate directly with BigQuery with the standard google javascript client library.',
      ),
    ]),
    new Article('Telemetry', [
      new Paragraph(
        'Telemetry',
        `<a href="https://www.goatcounter.com/">GoatCounter</a> is used to collect anonymized
        statistics about usage in the studio, such as aggregate queries run. No uniquely identifying information is collected, though the system type, browser, screensize and country are recorded.`,
      ),
    ]),
  ]),
  new DocumentationNode('Terms of Service', [
    new Article('Terms of Service', [
      new Paragraph('Last Updated', 'February 22, 2025'),
      new Paragraph(
        'Service Description',
        'The Trilogy Studio Integrated Development Environment (referred to as "IDE" henceforth) enables users to interact with their own databases. The IDE communicates with non-user services only to do basic telemetry and preprocessing of Trilogy code using the default language server (if a local one is not configured). The primary purpose of this preprocessing is to generate SQL to be returned to the browser for execution.',
        'section',
      ),
      new Paragraph(
        'Data Privacy and Security',
        'No Data Collection: We do not collect, store, or process any of your data or database contents. All database interactions occur directly between your browser and your database through client-side JavaScript.',
        'section',
      ),
      new Paragraph(
        'Local Processing',
        'All code execution and data processing occur locally in your browser. We have no access to your database credentials, queries, or results.',
        'subsection',
      ),
      new Paragraph(
        'User Responsibility',
        'You are solely responsible for securing your database connections, managing database credentials, implementing appropriate security measures, backing up your data, and ensuring compliance with applicable data protection laws.',
        'subsection',
      ),
      new Paragraph(
        'Service Limitations',
        "Browser Limitations: The IDE is subject to your browser's technical limitations, including memory constraints and processing capabilities.",
        'section',
      ),
      new Paragraph(
        'Connection Requirements',
        'Stable internet connection required for IDE access. Database connectivity depends on your database configuration and network conditions.',
        'subsection',
      ),
      new Paragraph(
        'User Obligations',
        'You agree to use the IDE in compliance with applicable laws, not attempt to circumvent browser security measures, not use the IDE for illegal or unauthorized purposes, maintain the security of your database credentials, and not redistribute or modify the IDE code without permission.',
        'section',
      ),
      new Paragraph(
        'Disclaimers',
        'Service Availability: We provide the IDE "as is" and make no guarantees about its availability or functionality.',
        'section',
      ),
      new Paragraph(
        'Security Disclaimer',
        'While we implement standard security measures in our code, we cannot guarantee the security of your database connections or local environment.',
        'subsection',
      ),
      new Paragraph(
        'Liability Limitations',
        'We are not liable for data loss or corruption, database connection issues, browser performance problems, security breaches in your database, misuse of the IDE, or consequential damages.',
        'section',
      ),
      new Paragraph(
        'User Rights',
        'You retain all rights to your code, your database, your data, and any outputs generated using the IDE.',
        'subsection',
      ),
      new Paragraph(
        'Modifications',
        'We reserve the right to modify the IDE functionality, these Terms of Service, and supported features and libraries. Changes will be communicated through the IDE interface.',
        'section',
      ),
      new Paragraph(
        'Termination',
        'You may stop using the IDE at any time. We may terminate access if you violate these terms.',
        'section',
      ),
      new Paragraph(
        'Contact',
        "For questions about these terms, please create an issue on the github repository <a href='https://github.com/trilogy-data/trilogy-studio-core'>here</a>.",
        'section',
      ),
      new Paragraph(
        'Agreement',
        'By using the IDE, you agree to these terms and conditions.',
        'conclusion',
      ),
    ]),
  ]),
]
