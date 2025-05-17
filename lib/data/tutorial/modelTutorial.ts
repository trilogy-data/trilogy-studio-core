import { Article, Paragraph } from './docTypes.ts'
import { Results } from '../../editors/results.ts'
export const ModelTutorial = new Article(
  'Model Tutorial',
  [
    new Paragraph(
      'Purpose',
      'The prior two tutorials cover how to query data and create dashboards. Both of those rely on the foundational concept of Trilogy - the model.',
    ),
    new Paragraph(
      'Purpose',
      'A model is simply a collection of editors that have been marked as sources. Any source can be imported by name into another editor, or multiple times under different aliases. Composition of models is how more complex models are built.',
    ),
    new Paragraph(
      'Purpose',
      'The core aspects of models are concepts and datasources. Concepts represent the abstract logical model of the data, while datasources represent physical instantiations of it.',
    ),
    new Paragraph(
      'Purpose',
      'These are loosely coupled, meaning that you can evolve or change your underlying database schema and simply update the datasources to point to the new tables and column names. Critically, queries operate on concepts so do not need to change.',
    ),
    new Paragraph(
      'Purpose',
      "Let's set one up. If you haven't already done the first tutorial, go back and create `my-first-editor` using that. We'll use that as a base.",
    ),
    new Paragraph('Purpose', '', 'editor-validator'),

    new Paragraph('Tutorial Queries', 'bsb', 'tutorial-prompts', {
      context: 'sql-tutorial',
      editorId: 'sql-basic-editor',
      prompts: [
        {
          title: 'Declaring a Constant',
          description:
            'In the editor below, we will define pi and select it. A constant is the simplest possible concept; it does not require a datasource to resolve. Constants are useful for variables in scripts. Run and confirm you see 3.14.',
          example: 'const pi <- 3.14; select pi;',
          hints: ["Don't forget the semicolon at the end!"],
          validationFn: (results: Results) => {
            return results.data?.[0]?.pi === 3.14
          },
        },
        {
          title: 'Typing',
          description:
            "Trilogy has a core type system and a metadata based trait system. Let's try it. In the below definition, `list` and `string` are core types, while us_state_short is a `trait`. Any number of traits can modify a base type. Traits are metadata signals that can be used for typechecking of custom functions or by other systems; for example, here, if you click visualize, you will have a default state map as the studio can make intelligent default choices based on standard lib traits.",
          example: `import std.geography; 
auto states <- ['NY', 'CA', 'TX']::list<string::us_state_short>;

select 
    unnest(states) as state, 
    random(state)*100 as rank 
order by 
    state asc;`,
          hints: [
            "Don\'t forget the import statement. Importing without a name puts all values in the base namespace.",
            "Make sure the state output is named state and you've ordered properly.",
          ],
          validationFn: (results: Results) => {
            return (
              results.data?.length === 3 &&
              results.data?.[0]?.state === 'CA' &&
              results.data?.[1]?.state === 'NY' &&
              results.data?.[2]?.state === 'TX'
            )
          },
        },
        {
          title: 'Typing',
          description:
            'In the last question, we imported from the standard library (under std) which is always available. Most of the time, you will be importing from your own model. Add an import from lineitem - the row level of orders in the demo model - and see if you can get the count of orders, aliased as order_count.',
          example: `import lineitem;
            ... your query here`,
          hints: ['select count(order.id) as order_count;'],
          validationFn: (results: Results) => {
            return results.data?.length === 1 && results.data?.[0]?.order_count === 15000
          },
        },
        {
          title: 'Typing',
          description:
            "Now, let's try a datasouce. Datasources bind concepts to physical resources. We can extend our demo model by adding a new concept defining our HQ locations, and a mapping to regions. Then write a query to fetch total sales by headquarters.",
          example: `import lineitem;


property order.customer.nation.region.id.headquarters string;

datasource region_headquarters (
    region_id: ?order.customer.nation.region.id,
    headquarters: order.customer.nation.region.headquarters,)
grain (order.customer.nation.region.id)
query '''
select 1 as region_id, 'HQ1' as headquarters
union all
select 2 as region_id, 'HQ2' as headquarters
union all
select 3 as region_id, 'HQ3' as headquarters
union all
select 4 as region_id, 'HQ4' as headquarters
''';
`,
          hints: [
            `select 
    order.customer.nation.region.headquarters,
    total_revenue
order by total_revenue desc;`,
          ],
          validationFn: (results: Results) => {
            // at least one row has order_customer_nation_region_headquarters == HQ4 and total_revenue == 451328736.4183
            return (
              results.data?.some(
                (row) =>
                  row.order_customer_nation_region_headquarters === 'HQ4' &&
                  Math.round(row.total_revenue) === 451328736,
              ) ?? false
            )
          },
        },
        // More prompts...
      ],
    }),

    new Paragraph('Purpose', `Review the standard library doc for always available traits.`, 'tip'),
    new Paragraph(
      'Purpose',
      `We've defined all the key parts of a model - a key, some properties, and a datasource to fetch. In a real database, you'll usually be working off an actual table. Let's try that out. Follow these steps:
      <ul>
      <li>1. Create a new duckdb connection called 'iris-data' using the connection list below.</li>
      <li>2. Copy the SQL command to create the table.</li>
      <li>3. Click the black doc icon to create a new SQL editor. This will take you to the editor!</li>
      <li>4. Paste in the code and run it.</li>
      <li>5. Click 'set editor as startup script' in the top right.</li>
      <li>6. Come back here by using the 'documentation' on the left.</li>
      </ul>
     `,
    ),
    new Paragraph('Purpose', `It's important to not miss step 5 - that way every time you connect, the table will be automatically populated!.`, 'tip'),
    new Paragraph(
      'Purpose',
      `CREATE TABLE iris_data AS select *, row_number() over () as pk FROM read_csv('https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv');`,
      'code'
    ),
    new Paragraph(
      'Purpose',
      '',
      'connections'
    ),

    new Paragraph(
      'Purpose',
      `Now we're ready to create a new model. The steps below will again take you out of this tutorial, but you can always come back here by clicking the 'documentation' icon on the left.
      <ul>
      <li>1. Click on the connection you have, and expand the memory database.</li>
      <li>2. Hit refresh if needed. On the row with the iris table, click the database icon to generate a new raw datasource file.</li>
      <li>3. In the open file, change pk to be a "key" instead of "property" and replace the placeholder tags with pk. (example: property pk.species string;)</li>
      <li>4. In the open file, add a grain clause below the field mapping - grain(pk)</li>
      <li>5. Click the 'set as source' in top right to make this importable by other files.</li>
      <li>6. Rename the file to 'iris'.</li>
      </ul>
     `,
    ),
    new Paragraph(
      'Purpose',
      `The grain clause defines the primary key of your datasource. In this case, we've added a surrogate key called pk. Grains are used to understand when information needs to be grouped, and by what. The property tag is used similarly. A datasource can have no grain, in which case it is a heap and most operations on it will require an extra group to deduplicate.
     `,
      'tip'
    ),
    new Paragraph(
      'Purpose',
      `
key pk int; # surrogate primary key for the dataset
property pk.sepal_length float;
property pk.sepal_width float;
property pk.petal_length float;
property pk.petal_width float;
property pk.species string;

datasource iris_data (
	sepal_length:sepal_length,
	sepal_width:sepal_width,
	petal_length:petal_length,
	petal_width:petal_width,
	species:species,
	pk:pk,
)
grain (pk)
address iris_data;
     `,
      'code'
    ),
    new Paragraph(
      'Purpose',
      `Make sure your file looks like the above. Now create a new trilogy editor by clicking the orange document icon by your connection. Copy the below code and run it! 
     `,
    ),
    new Paragraph(
      'Purpose',
      `import iris;
select
	species,
	avg(petal_length) as avg_petal_length,
	avg(petal_width) as avg_petal_width
;
     `,
      'code'
    ),
    new Paragraph(
      'Purpose',
      `If you get any errors, double check names and that you have set the iris file as a source. If you get a "no such table" error, make sure you have run the startup script to create the table. 
     `,
      'tip'
    ),
    new Paragraph(
      'Purpose',
      `Make sure your file looks like the above. Now create a new trilogy editor by clicking the orange document icon by your connection. Copy the below code and run it! 
     `,
    ),
  ],
  'Model Tutorial',
)
