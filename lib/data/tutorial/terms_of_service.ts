import { DocumentationNode, Article, Paragraph } from './docTypes.ts'

export const TOS = new DocumentationNode('Terms of Service', [
  new Article('Terms of Service', [
    new Paragraph('Last Updated', 'February 22, 2025'),
    new Paragraph(
      'Service Description',
      'Trilogy Studio (referred to as "IDE" henceforth) enables users to interact with public data or data in databases they own. The IDE communicates with non-user services only to do basic telemetry and preprocessing of Trilogy code using the default language server (if a local one is not configured). The primary purpose of this preprocessing is to generate SQL to be returned to the browser for execution.',
      'section',
    ),
    new Paragraph(
      'Data Privacy and Security',
      'No Data Collection: We do not collect, store, or process any of your data or database contents, beyond metadata provided in the model definition. All database interactions occur directly between your browser and your database through client-side JavaScript.',
      'section',
    ),
    new Paragraph(
      'Local Processing',
      'All code execution and data processing occur locally in your browser. We have no access to your database credentials, queries, or results.',
      'subsection',
    ),
    new Paragraph(
      'User Responsibility',
      'You are solely responsible for securing your database connections, managing database credentials, implementing appropriate security measures, backing up your data, and ensuring compliance with applicable data protection laws.',
      'subsection',
    ),
    new Paragraph(
      'Service Limitations',
      "Browser Limitations: The IDE is subject to your browser's technical limitations, including memory constraints and processing capabilities.",
      'section',
    ),
    new Paragraph(
      'Connection Requirements',
      'Stable internet connection required for IDE access. Database connectivity depends on your database configuration and network conditions.',
      'subsection',
    ),
    new Paragraph(
      'User Obligations',
      'You agree to use the IDE in compliance with applicable laws, not attempt to circumvent browser security measures, not use the IDE for illegal or unauthorized purposes, maintain the security of your database credentials, and not redistribute or modify the IDE code without permission.',
      'section',
    ),
    new Paragraph(
      'Disclaimers',
      'Service Availability: We provide the IDE "as is" and make no guarantees about its availability or functionality.',
      'section',
    ),
    new Paragraph(
      'Security Disclaimer',
      'While we implement standard security measures in our code, we cannot guarantee the security of your database connections or local environment.',
      'subsection',
    ),
    new Paragraph(
      'Liability Limitations',
      'We are not liable for data loss or corruption, database connection issues, browser performance problems, security breaches in your database, misuse of the IDE, or consequential damages.',
      'section',
    ),
    new Paragraph(
      'User Rights',
      'You retain all rights to your code, your database, your data, and any outputs generated using the IDE.',
      'subsection',
    ),
    new Paragraph(
      'Modifications',
      'We reserve the right to modify the IDE functionality, these Terms of Service, and supported features and libraries.',
      'section',
    ),
    new Paragraph('Termination', 'You may stop using the IDE at any time.', 'section'),
    new Paragraph(
      'Contact',
      "For questions about these terms, please create an issue on the github repository <a href='https://github.com/trilogy-data/trilogy-studio-core'>here</a>.",
      'section',
    ),
    new Paragraph(
      'Agreement',
      'By using the IDE, you agree to these terms and conditions.',
      'conclusion',
    ),
  ]),
])
