import { Article, Paragraph, DocData } from './docTypes.ts'

// Helper type for DocData function property for brevity
type FuncData = { function: DocData['function'] }

export const windowFunctions = new Article('Window Functions', [
  new Paragraph(
    'Trilogy Built-in Functions',
    'Window functions are a set of built-in functions in the Trilogy query language that allow you to perform calculations across a set of rows related to the current row. These functions are essential for data analysis, reporting, and complex aggregations.',
  ),
  new Paragraph(
    'Function Usage & Concepts',
    `Each function definition includes its input requirements and output characteristics. Key information includes:
        <ul>
            <li><b>Input Types:</b> The allowed data types for each argument.</li>
            <li><b>Output Type:</b> The data type of the value returned by the function.</li>
            <li><b>Output Purpose:</b> Describes the conceptual role of the output.
                <ul>
                    <li><b>PROPERTY:</b> Represents an attribute derived from existing data, typically associated with the grain of the input(s). Example: <code>UPPER(name)</code>.</li>
                    <li><b>METRIC:</b> Represents a calculated value that summarizes data across rows, respecting the query's grouping. Example: <code>SUM(revenue)</code>.</li>
                    <li><b>KEY:</b> Represents an identifier or a dimension used for joining or grouping, often changing the grain of the data. Example: <code>UNNEST(tags)</code>.</li>
                    <li><b>CONSTANT:</b> Represents a fixed value, independent of the input data rows. Example: <code>CURRENT_DATE()</code>.</li>
                </ul>
            </li>
        </ul>`,
  ),

  new Paragraph(
    'RANK',
    'Computes the rank of each row within its partition, with ties receiving the same rank. The rank starts at 1 for the first row in each partition.',
    'function',
    {
      function: {
        inputTypes: ['ANY'],
        outputType: 'INT',
        outputPurpose: 'PROPERTY',
        example: 'rank repo.license by license_repo_count desc;',
      },
    } as FuncData,
  ),
  // new Paragraph(
  //     'ROW_NUMBER',
  //     'Assigns a unique sequential integer to each row within its partition, starting at 1. Unlike RANK, it does not assign the same number to tied rows.',
  //     'function',
  //     {
  //     function: {
  //         inputTypes: ['ANY'],
  //         outputType: 'INT',
  //         outputPurpose: 'PROPERTY',
  //         example: 'row_number repo.license by license_repo_count desc;',
  //     },
  //     } as FuncData,
  // ),
  // new Paragraph(
  //     'DENSE_RANK',
  //     'Similar to RANK, but does not leave gaps in the ranking sequence when there are ties. The next rank after a tie is the next consecutive integer.',
  //     'function',
  //     {
  //       function: {
  //         inputTypes: ['ANY'],
  //         outputType: 'INT',
  //         outputPurpose: 'PROPERTY',
  //         example: 'dense_rank repo.license by license_repo_count desc;',
  //       },
  //     } as FuncData,
  // ),
  new Paragraph(
    'LAG',
    'Accesses data from a previous row in the same partition without changing the partitioning or ordering of the result set. The offset can be specified to retrieve data from a specific number of rows back.',
    'function',
    {
      function: {
        inputTypes: ['ANY', 'INT'],
        outputType: 'ANY',
        outputPurpose: 'PROPERTY',
        example: 'lag repo.license by license_repo_count desc;',
      },
    } as FuncData,
  ),
  new Paragraph(
    'LEAD',
    'Accesses data from a subsequent row in the same partition without changing the partitioning or ordering of the result set. The offset can be specified to retrieve data from a specific number of rows ahead.',
    'function',
    {
      function: {
        inputTypes: ['ANY', 'INT'],
        outputType: 'ANY',
        outputPurpose: 'PROPERTY',
        example: 'lead repo.license by license_repo_count desc;',
      },
    } as FuncData,
  ),
])
