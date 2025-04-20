import { Article, Paragraph } from './docTypes.ts'

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
            'Let\'s set one up. If you haven\'t already done the first tutorial, go back and create `my-first-editor` using that. We\'ll use that as a base.',
        ),
        new Paragraph('Purpose', '', 'editor-validator'),
        new Paragraph(
            'Purpose',
            'Clear the editor below. Define your first concept; pi, as const pi <- 3.14; This is the simplest possible concept; it has a constant value and does not require a datasource to resolve.  Then type select pi; and run the query. You should see a result of 3.14.',
        ),
        new Paragraph('Purpose', '', 'demo-editor'),
        new Paragraph(
            'Purpose',
            `Let's get fancier. Define the following:
<pre>
key food_id int;
property food_id.food_name string;
property food_id.food_type string;
property food_id.food_calories int;

datasource food_info (
    id:food_id,
    name:food_name,
    type: food_type,
    calories:food_calories,
)
grain (food_id)
query '''
select
    1 as id, 'banana' as name, 'fruit' as type, 100 as calories
union all
select             
    2 as id, 'apple' as name, 'fruit' as type, 200 as calories
union all
select
    3 as id, 'orange' as name, 'fruit' as type, 50 as calories
union all
select
    4 as id, 'grape' as name, 'fruit' as type, 30 as calories
union all
select
    5 as id, 'celery' as name, 'vegetable' as type, 10 as calories
''';
</pre>
`,
        ),
        new Paragraph(
            'Purpose',
            `Then try running these queries:<br>
select sum(food_calories) as total_calories;<br>
where food_calories<100 select food_type, avg(food_calories) as avg_high_calorie;<br>
select food_name, rank food_name by food_calories desc as calories_rank;<br>
''';
`,
        ),
        new Paragraph(
            'Purpose',
            `We've defined all the key parts of a model - a key, some properties, and a datasource to fetch. When working with a real database, you can save time by using the 'create model from table' button when browsing tables in the connection screen. This will build a default model you can then edit off that table.`,
        ),



    ],
    'Model Tutorial',
)
