
import { DocumentationNode, Article, Paragraph } from './docTypes.ts'
import { builtinFunctions } from './builtinFunctions.ts'
import { windowFunctions } from './windowFunctionsReference.ts'
import { modelReference } from './modelReference.ts'

export const Reference = new DocumentationNode('Trilogy Reference', [
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
            'To capture the iterative SQL development loop, Trilogy directly embeds a lightweight metadata definition syntax, allowing you to query and evolve the semantic layer in the same tool - and even in the same query session. This definition language (semantic layer, ERD, etc.) provides static typing/enforcement, and handles joins [1-1, 1-many, many-to-1], aggregations, filtering, and nulls automatically.',
        ),
        new Paragraph(
            'Trilogy Query Structure',
            "Let's take a look. Standard Trilogy reads like SQL SELECT, without the FROM or GROUP BY clauses.",
        ),
        new Paragraph(
            'Trilogy Query Example',
            'WHERE\n    store_sales.date.year=2001 \n    AND store_sales.date.month_of_year=1 \n    AND store_sales.item.current_price > 1.2 * avg(store_sales.item.current_price) BY store_sales.item.category\nSELECT\n    store_sales.customer.state,\n    count(store_sales.customer.id) AS customer_count\nHAVING\n    customer_count > 10\nORDER BY\n    customer_count ASC NULLS FIRST,\n    store_sales.customer.state ASC NULLS FIRST\nLIMIT 100;',
            'code',
        ),
        new Paragraph(
            'How Trilogy Differs from SQL',
            "Those aren't the only clauses to be gone - Trilogy removes the need for joins - and even tables - via the metadata layer. Information about how to join tables is encoded once and used automatically if required. Definitions look like creating a SQL table, but columns are bound to an additionally abstracted concept label, not raw datatypes. This enables Trilogy to dynamically traverse joins when needed.",
        ),
        new Paragraph(
            'How Trilogy Differs from SQL',
            `key order_id int;
key store_id int;
property store_id.store_name string;

datasource orders (
  order_id: order_id,
  store_id: store_id
)
grain (order_id)
address tbl_orders;

datasource stores (
  store_id: store_id
  store_name: store_name
)
grain (store_id)
address tbl_stores;
`,

            'code',
        ),

        new Paragraph(
            'The Value of Trilogy',
            "But writing out that datasource is work - a table can be queried quickly because someone else set it up. Trilogy provides the same experience through model imports. It's expected that datasources will be written once, and reused many times. Trilogy can be shared and imported through .preql files using a python-like import syntax.",
        ),
        new Paragraph(
            'The Value of Trilogy',
            'Complex models spanning dozens of tables can be imported with a single line.',
        ),
        new Paragraph(
            'Trilogy Equivalent',
            'import concepts.sales AS sales;\nSELECT\n    sales.territory_name,\n    sales.sub_total,\n    sales.total_taxes,\n    sales.total_sales\nORDER BY\n    sales.territory_name DESC;',
            'code',
        ),
        new Paragraph(
            'How Trilogy Works',
            'Explore the rest of the reference documentation for more details on how Trilogy works and explore these concepts in more detail.',
        ),
    ]),
    new Article('Code', [
        new Paragraph(
            'How Trilogy Works',
            `Studio and dependent code is open-source under the MIT license. The code is available on GitHub at the following locations:
        <li><a href='https://github.com/trilogy-data/trilogy-studio-core' target='_blank'>trilogy-studio-core</a> - the core code for the studio, including the language server and query editor.</li>
        <li><a href='https://github.com/trilogy-data/pytrilogy' target='_blank'>pytrilogy</a> - reference implementation of Trilogy language parsing/execution.</li>`,
        ),
        new Paragraph(
            'How Trilogy Works',
            `Stars appreciated, contributions welcome! If you find a bug, please file an issue on the relevant repository.
        `,
        ),
    ]),
    new Article('Querying Data', [
        new Paragraph(
            'SELECT Without FROM, JOIN, or GROUP BY',
            'In Trilogy, you write queries without explicitly specifying tables, joins, or grouping.',
        ),
        new Paragraph(
            'Example Query',
            "SELECT\n    product_line,\n    revenue,\n    revenue_from_top_customers,\n    revenue_from_top_customers / revenue AS revenue_from_top_customers_pct\nWHERE\n    product_line IN ('widgets', 'doodads');",
            'code',
        ),
        new Paragraph(
            'SELECT Without FROM, JOIN, or GROUP BY',
            'Queries begin with a SELECT, and can include WHERE, HAVING, ORDER BY, and LIMIT clauses. Trilogy automatically handles joins and grouping based on the defined model.',
        ),
        new Paragraph(
            'SELECT Without FROM, JOIN, or GROUP BY',
            'Like SQL, the where clause filters results *before* the selection, and the having *after*. The order by clause sorts the results, and the limit clause restricts the number of rows returned.',
        ),
        new Paragraph(
            'SELECT Without FROM, JOIN, or GROUP BY',
            'This query would restrict data to red products in Massachsusetts, then select the product name and aggregate total sales within the filter state, further filter to only those with total sales greater than 1000, ordering by total sales in descending order, and limiting the results to 10 rows.',
        ),
        new Paragraph(
            'Example Query',
            `WHERE product_name like '%red%' and sales.state = 'MA' 
SELECT 
  product_name, 
  sum(sales) AS total_sales 
HAVING total_sales > 1000 
ORDER BY 
  total_sales DESC 
LIMIT 10;`,
            'code',
        ),
        new Paragraph(
            'SELECT Without FROM, JOIN, or GROUP BY',
            'All concepts and outputs must be explicitly named, using AS to bind any transformation. The having clause and order clause can only reference fields in the select list, while the where clause can reference any field in the model.',
        ),
    ]),
    new Article('Syntax', [
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
select
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
        new Paragraph('where', `where_clause: where expression ("," expression)* ","?`, 'code'),
        new Paragraph(
            'having',
            'The having clause restricts data after the select expression. It can reference any field in the select list, including aggregates.',
        ),
        new Paragraph('having', `having_clause: where expression ("," expression)* ","?`, 'code'),
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
            `datasource IDENTIFIER 
( column_assignment_list )
grain_clause?
complete_for_clause?
(address='string' | query='''string''')
`,
            'code',
        ),
        new Paragraph(
            'Merge',
            'merge_statement: merge IDENTIFIER (, IDENTIFIER)_ ,? comment_',
            'code',
        ),
        new Paragraph(
            'Import',
            'import_statement: import (IDENTIFIER .) * IDENTIFIER as IDENTIFIER',
            'code',
        ),
        new Paragraph(
            'Function Definition',
            'function_derivation: def ( (IDENTIFIER ,)* ) -> EXPR;',
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
            `datasource sales (
  order_id: orders.id,
  cu_id: ~customers.id,
  revenue: orders.revenue
)\ngrain (orders.id)\naddress warehouse.sales;\n\ndatasource customers (\n    customer_id: customers.id,\n    name: customers.name\n)\ngrain (customers.id)\naddress warehouse.customers;`,
            'code',
        ),
        new Paragraph(
            'Partial Keys',
            'A query of the form `SELECT sum(orders.revenue), customer.name` would mean "get all customer names, and their total revenue". This would be resolved via a join through customer.id, with the order table being on the right side of the join, to ensure that all customers were returned regardless of if they placed an order.',
        ),
    ]),
    new Article('Grains and Aggregation', [
        new Paragraph(
            'What Is a Grain?',
            'A grain represents the unique combination of keys. Tables and aggregations both have grains, which determine the minimum keys required to uniquely identify a row of data. For example, finding the total sales by customer id, anme, and address would be an aggregation to the grain of a customer id, no matter how many other customer properties are included. Properties of a key are implicitly dropped from any grain that includes that key, though a grain without the key associated with a property will include that property in the grain.',
        ),
        new Paragraph(
            'Example',
            'SELECT\n    order_date,\n    order_year,\n    SUM(total_spent) AS total_revenue;',
            'code',
        ),
        new Paragraph(
            'What Is a Grain?',
            'This query would aggregate revenue to the grain of order_date, as order year is a property of order date.',
        ),
    ]),
    builtinFunctions,
    windowFunctions,
    new Article('Custom Functions', [
        new Paragraph(
            'Defining Functions',
            'Custom functions can be used to extend the language with reusable code macros. Functions are defined using the def keyword and have a list of arguments and are mapped to an expression. Any argument alias will be locally scoped within the function, but external concepts can be referenced as well.',
        ),
        new Paragraph(
            'Defining Functions',
            'This function will multiple the input concept by itself and then by whatever the value of the global scale_factor is. Note the @ - custom functions references require the @ prefix.',
        ),
        new Paragraph(
            'Example',
            `const scale_factor<-2;\ndef square_scale(x) -> x * x *scale_factor;\n\nSELECT
  number,
  @square_scale(number) AS squared
;`,
            'code',
        ),
        new Paragraph(
            'Defining Functions',
            'Functions may have optional defaults by adding an `= value` after the argument name.',
        ),
        new Paragraph(
            'Example',
            `def pretty_percent(x, digits=2) ->  round(x*100, digits)::string || '%';\n\nconst number<-.4555;\n\nSELECT
  number,
  @pretty_percent(number) AS percent,
  @pretty_percent(number, 3) AS three_percent
;`,
            'code',
        ),
    ]),
    modelReference,
])