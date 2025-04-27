import { Article, Paragraph } from './docTypes.ts'

export const llmTutorial = new Article('LLM Connections', [
      new Paragraph(
        'Connections',
        'LLMs can optionally be used to enhance the studio experience. The LLM screen is accessible on the left-hand nav and provides some basic validation that your LLM will work. LLMs is not required, but we aim to make the best use of them when available.',
      ),
      new Paragraph(
        'Connections',
        'Core LLM use cases are - dashboard filtering with natural language, query generation from natural language. More features may be added.',
      ),
      new Paragraph(
        'Connections',
        'Make sure to update the model - by selecting one from the dropdown and explicitly clicking update model - after first setting up an LLM. We don\'t know what models are available until you first connect.',
        'tip'
      ),
      new Paragraph(
        'Managing Connections',
        'You can view current LLM connections below. Only one LLM connection can be the default at a time. You can set a default by clicking the star icon. The default LLM will be used for all LLM functionality. Try setting one up, confirm you can connect, select an appropriate model, and save. Then head to an editor or a dashboard to try it out!',
      ),
      new Paragraph('LLMList', '', 'llm-connections'),
      new Paragraph(
        'Connections',
        'LLMs operate on the imported concept context. Make sure you have a datasource selected on a dashboard, or add imports to an editor before typing your comment. Ctrl-shift-enter is the default LLM activation shortcut; typically you will highlight text and then run this.',
        'tip'
      ),
    ])