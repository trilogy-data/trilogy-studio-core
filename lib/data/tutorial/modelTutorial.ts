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
            "Trilogy has a core type system and a metadata based trait system. Let's check it out with the below statement. List and String are core types, while us_state_short is a trait. Any number of traits can modify a base type. Traits can be consumed by other systems; for example, here, if you click visualize, you will have a default state map.",
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
    new Paragraph(
      'Purpose',
      `We've defined all the key parts of a model - a key, some properties, and a datasource to fetch. When working with a real database, you can save time by using the 'create model from table' button when browsing tables in the connection screen. This will build a default model you can then edit off that table.`,
      'tip',
    ),
    new Paragraph('Purpose', `Review the standard library doc for always available traits.`, 'tip'),
  ],
  'Model Tutorial',
)
