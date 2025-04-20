import { Article, Paragraph } from './docTypes.ts'

export const DashboardTutorial = new Article(
  'Dashboards',
  [
    new Paragraph(
      'Purpose',
      'Trilogy is designed as a data consumption language, and one of the fastest ways to expore data is through visualization. The dashboarding system in Trilogy Studio is designed to be streamlined but powerful. The semantic model means that default selections can be tailored and rich.',
    ),
    new Paragraph(
      'Purpose',
      'It aspires to be good out of the box, with progressive disclosure of capability. It does not yet allow pixel-perfect customization, but it is designed to be extensible and feature requests are welcome.',
    ),
    new Paragraph(
      'Purpose',
      'We`ll use the demo model you set up in the first tutorial. If you haven`t done that yet, go back and run through the imports. Make sure you have a model and connection read to go below.',
    ),
    new Paragraph('ModelList', '', 'model-validator'),
    new Paragraph('ConnectionList', '', 'connection-validator'),
    new Paragraph(
      'Purpose',
      "Now that you have a connection and model set up, let\s get charting! Dashboards are accessed through the dashboard icon the left nav, but we'll drop one in right below. The demo model comes with a default example. ",
    ),
    new Paragraph(
      'Purpose',
      `Dashboards are driven by Trilogy - so mostly, you'll just be writing queries. The one special thing on a dashboard is the global where clause. The filter bar at the top defines this; it will be concatenated to the where clause of every query on the dashboard. This is a great way to filter all of your charts at once.
  You can also cross-filter by clicking on any element in the chart. This happens by default.`,
    ),
    new Paragraph(
      'Purpose',
      `In the below dashboard, try the following: <br>-Click on a manufacturer to filter other views. <br>-Go to edit mode and update the markdown on the top. <br>-Add a new chart. <br>-Change the horizontal bar chart to a vertical.`,
    ),
    new Paragraph('Purpose', '', 'dashboard'),
    new Paragraph(
      'Purpose',
      'When starting a new dashboard, you can either create a blank one or use a template. The templates are designed to be a good starting point for common use cases. You can also import dashboards from other users. Some of the public models will come with default dashboards.',
    ),
    new Paragraph(
      'Purpose',
      'Models can only be built off editors you have marked as a source. There\'s a toggle button in the top right of the editor. This is intended to make sure you only build off editors that are intended to be reusable resources.',
    ),
    new Paragraph(
      'Purpose',
      'Each chart can have their own query, so it\'s easy to define metrics in place. For dimensions, it\'s best to define them in the model so that automatic cross-filtering can be applied; if they are local to a chart, they cannot be applied to other views.',
    ),
    new Paragraph(
      'Purpose',
      'If you have an active LLM configured, the top search bar can be used for natural language filtering with the LLM - use ctrl+shift+enter.',
    ),
    new Paragraph(
      'Purpose',
      'Feel free to explore from here. A good place to start is clicking on the editors icon in the left nav and exploring the pre-populated demo editors, which show more functionality. Alternatively, poke more around the docs!',
    ),
  ],
  'Dashboard Tutorial',
)
