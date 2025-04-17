import { DocumentationNode, Article, Paragraph } from './docTypes.ts'

export const DashboardTutorial = new Article('Dashboards', [
    new Paragraph(
        'Purpose',
        'Trilogy is designed as a data consumption language, and one of the richest ways for the human brain to understand data is through visualizations. The dashboarding system in Trilogy Studio is designed to be a simple way to create and share visualizations of your data.',
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
        'Now that you have a connection and model set up, let\s get charting! Dashboards are accessed through the dashboard icon the left nav, but we\'ll drop one in right below. The demo model comes with a default example. ',
    ),
    new Paragraph('Purpose', '', 'dashboard'),
    new Paragraph(
        'Purpose',
        'Feel free to explore from here. A good place to start is clicking on the editors icon in the left nav and exploring the pre-populated demo editors, which show more functionality. Alternatively, poke more around the docs!',
    ),
], 'Dashboard Tutorial')