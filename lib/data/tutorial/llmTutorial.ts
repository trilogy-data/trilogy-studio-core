import { Article, Paragraph } from './docTypes.ts'

export const llmTutorial = new Article('LLM Tutorial', [
  new Paragraph(
    'Connections',
    'LLMs can optionally be used to enhance the studio experience. The LLM screen is accessible on the left-hand nav and provides some basic validation that your LLM will work. LLMs is not required, but we aim to make the best use of them when available.',
  ),
  new Paragraph(
    'Connections',
    'Gemini has had some of the best results, but any lightweight fast model works well to build scaffholding quickly. You will need to QA answers.',
    'tip',
  ),
  new Paragraph(
    'Connections',
    'Core LLM use cases are - dashboard filtering with natural language, query generation from natural language. Feature requests welcome! To add an LLM, you will need an appropriate API key. Currently, we support OpenAI, Anthropic, and Google, but adding more is straightforward.',
  ),
  new Paragraph(
    'Connections',
    'To improve generative query performance, improve your trilogy model definitions, as they are provided as primary context. Adding more specific types and descriptions to fields will help the model understand better. For complex calculations, consider pre-defining them so they can be easily selected by the model.',
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
  new Paragraph(
    'Connections',
    'LLMs operate on the imported concept context. Make sure you have a datasource selected on a dashboard, or add imports to an editor before typing your comment. Ctrl-shift-enter is the default LLM activation shortcut; typically you will highlight text and then run this.',
    'tip',
  ),
])
