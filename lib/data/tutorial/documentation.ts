class Paragraph {
  title: string
  content: string
  type: string | null
  constructor(title: string, content: string, type: string | null = null) {
    this.title = title
    this.content = content
    this.type = type
  }
}

class Article {
  title: string
  paragraphs: Paragraph[]

  constructor(title: string, paragraphs: Paragraph[]) {
    this.title = title
    this.paragraphs = paragraphs
  }
}

class DocumentationNode {
  title: string
  articles: Article[]

  constructor(title: string, articles: Article[]) {
    this.title = title
    this.articles = articles
  }
}

export const documentation: DocumentationNode[] = [
  new DocumentationNode('Studio', [
    new Article('Navigation', [
      new Paragraph(
        'Navigation',
        'Trilogy Studio uses a left-hand navigation bar, a sidebar with context, and a main pane (which may be split) to present information. The sidebar is further split into sections; the first icons change the sidebar for the query editor, while the next section configures entirely new main screen experiences. Configuration/profile are accessible at the bottom.',
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
        'A core feature of Trilogy Studio is running in Trilogy or SQL against connections representing backend databases.',
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
    ]),
    new Article('Models', [
      new Paragraph(
        'Models',
        'Models are the Trilogy semantic layer. When you run a Trilogy command in a connection with a model associated, it will be able to reference that file as an import in any other editor on the connection. An editor is added to a model with an alias, which is how it should be referenced.',
      ),
      new Paragraph(
        'Tip',
        'Any editor can be turned into a model source. Model sources can be hidden from the navigation tree (and are by default), but there is a button at the top to toggle their visibility.',
        'tip',
      ),
      new Paragraph(
        'Model Parsing',
        "A model contains all the processed metadata of your source trilogy files. If you haven't deleted the demo model, it will be visible below. (You can reset the demo to restore it). Models are automatically parsed on query submission but also support on-demand validation. Click the 'parse' button to parse the model. This will send the model to a backend server to be parsed and type-checked and generate metadata for visibility. You can click on an editor name to view and edit it. This can be useful to fix parse errors easily.",
      ),
    ]),
  ]),
  new DocumentationNode('Demo', [
    new Article('Demo', [
      new Paragraph(
        'Demo',
        "The demo will set up a DuckDB connection to query the TPC-H dataset using publicly available parquet files as model inputs. It's the best way to dive into querying right away. Try the example_query_1 and example_query_2 queries to see how the model can be used to generate SQL. Clicking the reset button below will recreate the 'demo-connection' and all associated editors to default state. Take care with this, as it will revert any changes you have made.",
      ),
      new Paragraph(
        'Investigate Sources',
        "You can toggle 'source' editor visibility to investigate the setup of this model. Can you find all the parquet files used as sources?",
        'tip',
      ),
      new Paragraph(
        'TPC-H',
        "You can read more about the benchmark in the official guide <a href='https://www.tpc.org/tpc_documents_current_versions/pdf/tpc-h_v2.17.1.pdf' target='_blank'>here</a>. Or just google it! There are lots of blogs; see if you can recreate some queries.",
      ),
      new Paragraph(
        'Reset',
        "If this is your first visit, then the demo will be set up automatically. If you make changes, clicking the reset button below will recreate the 'demo-connection' and all associated editors to default state. Take care with this, as it will revert any changes you have made.",
        'tip',
      ),
    ]),
  ]),
  new DocumentationNode('Trilogy Documentation', [
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
        'Trilogy is designed to be easy to learn and use, and to be incrementally adopted. It can be run directly as a CLI, in a GUI, or compiled to SQL and run in standard SQL tooling.',
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
    new Article('Syntax', [
      new Paragraph(
        'Basic SELECT Statement',
        'A Trilogy statement consists of one or more lines ending in a semicolon. Trilogy follows SQL syntax closely but removes redundant features like explicit joins and the FROM clause.',
      ),
      new Paragraph(
        'Example',
        "SELECT\n    1 -> constant_one,\n    1 AS constant_one_2,\n    '2' -> constant_string_two;",
        'code',
      ),
      new Paragraph('Select', 'select_statement: "select"i select_list where? order_by? limit?'),
      new Paragraph(
        'Multi-Select',
        'multi_select_statement: select_statement ("merge" select_statement)+ "align"i align_clause where? order_by? limit?',
      ),
      new Paragraph(
        'Align Clause',
        'align_item: IDENTIFIER ":" IDENTIFIER ("," IDENTIFIER)* ","?\nalign_clause: align_item ("," align_item)* ","?',
      ),
      new Paragraph(
        'Datasource',
        '"datasource" IDENTIFIER "(" column_assignment_list "")" grain_clause? (address | query)',
      ),
      new Paragraph('Merge', 'merge_statement: "merge" IDENTIFIER ("," IDENTIFIER)_ ","? comment_'),
      new Paragraph(
        'Import',
        'import_statement: "import" (IDENTIFIER ".") * IDENTIFIER "as" IDENTIFIER',
      ),
      new Paragraph(
        'Function Definition',
        'function_derivation: "def" "(" (IDENTIFIER ",")* ")" -> EXPR;',
      ),
    ]),
    new Article('Concepts', [
      new Paragraph(
        'What Are Concepts?',
        'Concepts are core semantic building blocks in Trilogy. They represent keys, properties, or metrics: Keys (unique identifiers), Properties (additional values), and Metrics (aggregatable values).',
      ),
      new Paragraph('Example', 'SELECT\n    customer_name,\n    total_spent;', 'code'),
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
        'A grain represents the unique combination of dimensions stored in a table/query.',
      ),
      new Paragraph(
        'Example',
        'SELECT\n    order_date,\n    SUM(total_spent) AS total_revenue;',
        'code',
      ),
    ]),
    new Article('Modeling', [
      new Paragraph(
        'Defining Concepts',
        'Concepts are declared with types: key (a unique identifier), property (value associated with a key), and metric (an agregatable value). A concept can be given a description by providing a comment after the declaration.',
      ),
      new Paragraph(
        'Example',
        'key customer_id int;# comments are inline.\n\nproperty customer_id.name string; #the name of a customer property customer_id.spending float; \n\nmetric total_spent <-sum(spending);',
        'code',
      ),
    ]),
    new Article('Advanced Features', [
      new Paragraph(
        'Filtering',
        'Filtering can be done via WHERE Clause, Rowset Filtering, or Filtered Concepts.',
      ),
      new Paragraph(
        'Example',
        'SELECT\n    product_name,\n    revenue\nWHERE\n    revenue > 1000;',
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
        'We process trilogy queries to transform them to SQL based on your model inputs.',
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
        'Query formatting and optimization occurs on secure servers. Code generation uses anonymized inputs. All remote processing is temporary with no data retention.',
        'subsection',
      ),
      new Paragraph(
        'Third-Party Services',
        "GoatTrack Analytics processes anonymous usage statistics, subject to GoatTrack's privacy policy, with data retention limited to 90 days.",
        'section',
      ),
      new Paragraph(
        'Query Processing Service',
        'Temporary processing for formatting and generation, no data retention, encrypted transmission.',
        'subsection',
      ),
      new Paragraph(
        'Security Measures',
        'All communications use TLS encryption. Telemetry data is anonymized before transmission. Query data is encrypted end-to-end.',
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
        'Telemetry data may cross borders. Query processing occurs in the US. We comply with international data protection laws.',
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
        'For databases that require credentials (password, API Key) to access, Trilogy Studio can optionally store them locally for reuse. [They will never be sent to a remote server]. It will attempt to use secure browser credential storage but will fall back to local browser storage. If preferred, you can use a password manager to autofill conenction details.',
      ),
    ]),
    new Article('Google Account', [
      new Paragraph(
        'Google Account',
        'Trilogy Studio uses Google OAuth to authenticate users when using a Google Bigquery Oauth connection. Trilogy Studio uses a token provided by Google to authenticate your account. Trilogy Studio only requests scopes required for Bigquery read/write access, and the token never leaves your browser. It is used to communicate directly with Bigquery with the google javascript client library.',
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
        'The Trilogy Studio Integrated Development Environment ("IDE") enables users to interact with their own databases. The IDE communicates with non-user services only to do basic telemetry and transform the text of a Trilogy query into SQL, which is returned to the browser to actually communicate with the database.',
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
        'Intellectual Property',
        'The IDE, including its code and interface, remains our intellectual property.',
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
        "For questions about these terms, please post on the github repository <a href='https://github.com/trilogy-data/trilogy-studio-core'>here</a>.",
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
