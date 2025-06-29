import { Article, Paragraph } from './docTypes.ts'
import { Results } from '../../editors/results.ts'
export const llmTutorial = new Article('LLM Tutorial', [
  new Paragraph(
    'Connections',
    'LLMs can optionally be used to enhance the studio experience. The LLM screen is accessible on the left-hand nav and provides some basic validation that your LLM will work. LLMs is not required, but we aim to make the best use of them when available.',
  ),
  new Paragraph(
    'Connections',
    'Gemini has had some of the best results, but any lightweight fast model works well to build scaffolding quickly. You will need to QA answers.',
    'tip',
  ),
  new Paragraph(
    'Connections',
    'Core LLM use cases are -query generation from natural language, dashboard generation from natural language, dashboard filtering with natural language, Feature requests welcome! To add an LLM, you will need an appropriate API key. Currently, we support OpenAI, Anthropic, and Google, but adding more is straightforward.',
  ),
  new Paragraph(
    'Connections',
    'To improve LLM performance, the first place to start is your model, as concept definitions are provided as primary context. Adding more specific concepts and - especially - descriptions to fields will help the model understand better. For complex calculations, consider pre-defining them so they can be easily selected by the model.',
  ),
  new Paragraph(
    'Connections',
    "Make sure to update the model to your favorite! Do this by selecting one from the dropdown and explicitly clicking update model - after first setting up an LLM. We don't know what models are available until you first connect.",
    'tip',
  ),
  new Paragraph(
    'Managing Connections',
    'You can view current LLM connections below. Only one LLM connection can be the default at a time. You can set a default by clicking the star icon. The default LLM will be used for all LLM functionality. Try setting one up, confirm you can connect, select an appropriate model, and save. Then head to an editor or a dashboard to try it out!',
  ),
  new Paragraph('LLMList', '', 'llm-connections'),
  new Paragraph('LLMList', 'The LLM experience is not tested on mobile.', 'warning'),
  new Paragraph('Purpose', '', 'editor-validator'),
  new Paragraph(
    'Tutorial Queries',
    "There should be an edito here! Make sure you've completed the first tutorial!",
    'tutorial-prompts',
    {
      context: 'sql-tutorial',
      editorId: 'sql-basic-editor',
      prompts: [
        {
          title: 'Try it out!',
          description:
            'Copy the below input, and hit generate [ctrl-shift-enter]. You can either refine the query or hit [ctrl-shift-enter] again to accept and run.',
          example: `import std.geography; 
auto state_source <- ['NY', 'CA', 'TX']::list<string::us_state_short>;
auto state <- unnest(state_source);
auto state.population <- random(state)*10000;
  
# what states have the most people?`,
          hints: [
            "Don\'t forget the import statement. Importing without a name puts all values in the base namespace.",
            "Make sure the state output is named state and you've ordered properly.",
          ],
          validationFn: (results: Results) => {
            return results.data != null
          },
        },
        {
          title: 'Typing',
          description:
            "LLMs will have access to all imports and the selected context at submission time. If you define new context in the editor, make sure it's selected and syntactically valid. Copy in the below and click the generate button without any selection; if you try with just the comment selected the LLM will not be aware of the new concept you defined.",
          example: `import lineitem;

  property order.customer.nation.region.id.headquarters string;
  
  datasource region_headquarters (
      region_id: ?order.customer.nation.region.id,
      headquarters: order.customer.nation.region.headquarters,)
  grain (order.customer.nation.region.id)
  query '''
  select 0 as region_id, 'HQ0' as headquarters
  union all
  select 1 as region_id, 'HQ1' as headquarters
  union all
  select 2 as region_id, 'HQ2' as headquarters
  union all
  select 3 as region_id, 'HQ3' as headquarters
  union all
  select 4 as region_id, 'HQ4' as headquarters
  ''';

  # what is the total revenue for each headquarter?
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
    },
  ),
  new Paragraph(
    'Connections',
    'LLMs operate on the imported concept context. Make sure you have a datasource selected on a dashboard, or add imports to an editor before typing your comment. Ctrl-shift-enter is the default LLM activation shortcut; typically you will highlight text and then run this.',
    'tip',
  ),
])
