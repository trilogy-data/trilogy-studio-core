

import { Article, Paragraph } from './docTypes.ts'
import { Results } from '../../editors/results.ts'
export const IntroTutorial = new Article(
    'Welcome',
    [
        new Paragraph(
            'Purpose',
            'Trilogy Studio is intended as an accessible demonstration of the features of the Trilogy language, which would otherwise have a high barrier to experimentation. It is open source and feature requests and contributions are welcome.',
        ),
        new Paragraph(
            'Purpose',
            'Trilogy is SQL with a built in semantic layer; it should feel like SQL, but faster and more expressive. The boilerplate of SQL is delegated to the semantic engine, while the expressiveness of SQL is still fully available. You can read more about the language in the Trilogy reference section.',
        ),
        new Paragraph(
            'Purpose',
            'In the rest of this tutorial, we will walk you through a demo-model - based on the TPC-H dataset - to get started. This will give you a feel for how Trilogy works and how you can use it to query data.',
        ),
        new Paragraph(
            'Purpose',
            'A "model" is a collection of associated Trilogy files that define a specific semantic layer. Models can be imported and exported, and are the primary way to share and reuse Trilogy code. In Trilogy Studio, a model will always be associated with a connection, representing a database backend. You can assign the same model to multiple connections for reuse. ',
            'tip',
        ),
        new Paragraph(
            'Purpose',
            'Trilogy Studio has a built in model "store", containing a set of public models hosted on github. The demo model is one of those options. Let\'s get started! Search below for the demo-model, and click the import button to add it. You want to import it to a duckdb connection. Select new duckdb connection and name it demo-connection.',
        ),
        new Paragraph('Purpose', '<PLACEHOLDER>', 'community-models'),
        new Paragraph('ModelList', '', 'model-validator'),
        new Paragraph(
            'Purpose',
            `Now that you have the model imported and associated with a connection, we just need to click the plug icon to connect to it.`,
        ),
        new Paragraph(
            'Purpose',
            `If you had set up the connection first, you could click the connection name to toggle details, and click the model dropdown and select the "demo-model".`,

            'tip',
        ),
        new Paragraph(
            'Purpose',
            `You can also run normal SQL against a connection, using a 'sql' typed editor. This is a good way to debug or test queries that you are not sure how to write in Trilogy, or to manage databases.`,
            'tip',
        ),
        new Paragraph('ConnectionList', '', 'connections'),
        new Paragraph('ConnectionList', '', 'connection-validator'),
        new Paragraph(
            'Purpose',
            'When the above indicator is green, you are good to move on! Note that normally, you will manage connections through the connection panel available on the sidebar - this component is just embedded here as well for the tutorial.',
            'tip',
        ),
        new Paragraph(
            'Purpose',
            'Now that you have a connection and model set up, you can start querying in an editor. Editors are grouped by their storage, then by connection. Local represents local storage in your browser. You should see some auto-created editors below from importing your model Click the new button and create a Trilogy editor named "my-first-editor" associated with the demo connection.',
        ),
        new Paragraph('Purpose', '', 'editors'),
        new Paragraph('Purpose', '', 'editor-validator'),
        new Paragraph(
            'Purpose',
            'When the above indicator is green, you are good to move on! Note again that normally editors are managed through the sidebar. You will also see that some editors are marked as sources - these are importable by other editors on the model. As these often are metadata only, you can use the toggle at the top to hide these if desired. Any editor can be made a source by toggling a button in the editor.',
            'tip',
        ),
        new Paragraph(
            'Purpose',
            `Editors are your interactive SQL experience. They let you write Trilogy, validate it, run it, and look at the results. Running (ctrl-enter) will either execute the full editor or the highlighted chunk of code (with any imports). In the below tutorial editor, we'll run through a few queries and validate your results.`,
        ),
        new Paragraph('Tutorial Queries', 'bsb', 'tutorial-prompts', {
            context: 'sql-tutorial',
            editorId: 'sql-basic-editor',
            prompts: [
                {
                    title: 'Hello World',
                    description:
                        'Just like SQL, you can select constant values without any sources. Let\'s try saying hello world. You have two options; define it in a select directly, or define a constant and then select it. Before running, click the \"validate" button to check your syntax - if it\s correct, you\'ll see your extract concept visible on the right. Note that when you define the concept first, you are able to add a description via the comment.',
                    example: `select 'Hello World' as greeting;
const greeting <- 'Hello World'; # A friendly greeting
select greeting;`,
                    hints: ["Don't forget the closing semicolon or as!", "Select 'Hello World' as greeting;"],
                    validationFn: (results: Results) => {
                        return results.data?.[0]?.greeting.toLowerCase() === 'hello world'
                    },
                },
                {
                    title: 'Multiple Rows',
                    description:
                        "Now, let's try a few different rows. We can unnest an array constant - this is a handy way to get test data.",
                    example: 'SELECT unnest([1,2,3,4]) as constant order by constant asc;',
                    hints: ["Don't forget the semicolon at the end!"],
                    validationFn: (results: Results) => {
                        return results.data?.[0]?.constant == 1 && results.data?.[3]?.constant === 4
                    },
                },
                {
                    title: 'Typing',
                    description:
                        "But let's get to the good stuff. Other tutorials will cover syntax in more depth, but let's import a model and see what we can do. The demo model has an available called lineitem, which is the row level of orders. Let's pull it in and aggregate our sales by nation.",
                    example: `import lineitem as lineitem;
SELECT
    sum(lineitem.extended_price)->sales,
    lineitem.supplier.nation.name,
order by
    sales desc;`,
                    hints: [
                    ],
                    validationFn: (results: Results) => {
                        return (
                            results.data?.[0]?.lineitem_supplier_nation_name === 'UNITED STATES'
                        )
                    },
                }

            ],
        }),
        new Paragraph(
            'Purpose',
            'That\s the basics! You know how to run queries in an editor, how to import a model, and how to connect to a datasource.',
            'tip',
        ),
        new Paragraph(
            'Purpose',
            'For the last query, could you figure out how to visualize the data? Editors support inline visualization for rapid introspection; to create more complicated visuals, check out the dashboarding tutorial up next.',
            'tip',
        ),
        new Paragraph(
            'Purpose',
            'Feel free to explore from here. A good place to start is clicking on the editors icon in the left nav and exploring the pre-populated demo editors, which show more functionality. Alternatively, poke more around the docs!',
        ),
    ],
    'Welcome and Query Tutorial',
)
