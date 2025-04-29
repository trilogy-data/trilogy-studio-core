
import { Article, Paragraph } from './docTypes' 


export const modelReference = new Article(
  'Modeling', // Article Title
  [
    // --- Introduction to Models ---
    new Paragraph(
      'What is a Model?', // Section Title
      'Models are the heart of Trilogy\'s semantic layer. They provide a structured, logical representation of your data, abstracting away the complexities of the underlying physical storage (databases, files, APIs). A model is essentially a collection of Trilogy editors that have been designated as "sources". These sources define the concepts, properties, and data retrieval logic for your domain.',
    ),
    new Paragraph(
        'Purpose and Benefits', // title
        // content - now using HTML syntax
        `Models enable several key benefits:
      <ul>
        <li><strong>Abstraction:</strong> Define data logically using concepts (like 'customer' or 'order') independent of physical table names or structures.</li>
        <li><strong>Reusability:</strong> Define concepts and logic once in a model source and import them into any number of queries, reports, or other models.</li>
        <li><strong>Maintainability:</strong> If your database schema changes (e.g., table or column rename), you only need to update the corresponding datasource mapping in the model. Queries relying on the logical concepts remain unchanged.</li>
        <li><strong>Consistency:</strong> Ensures everyone querying the data uses the same definitions, metrics, and relationships.</li>
        <li><strong>Governance:</strong> Provides a centralized place to manage data definitions, access rules (via datasources), and metadata (types, traits).</li>
      </ul>`, 
        null, // type (assuming 'null' is for standard content)
        null  // data (assuming no specific data object is needed here)
      ),

    // --- Core Components of a Model ---
    new Paragraph(
      'Core Components',
      'Models are primarily built from three interconnected components: Concepts, Properties, and Datasources. These are defined within Trilogy editors marked as model sources.',
      'section', // Using 'section' type for structure

    ),
    new Paragraph(
      'Concepts', // Subsection Title
      `Concepts represent the core entities or logical groupings in your data model (e.g., \`customer\`, \`product\`, \`order\`). Each concept typically has a unique key that identifies individual instances (like \`customer.id\`). Concepts form the nouns of your data language. They are defined implicitly through properties and datasources associated with them.`,
      'subsection', // Using 'subsection' type

    ),
    new Paragraph(
      'Properties', // Subsection Title
      `Properties are the attributes or characteristics associated with a concept (e.g., \`customer.name\`, \`order.order_date\`, \`product.price\`). They define the specific pieces of information available.
      Properties have defined data types (like \`string\`, \`number\`, \`datetime\`) and can be further annotated with metadata traits (like \`::usd\` or \`::us_state_short\`).
      New properties can be added to existing concepts using the \`property\` keyword:`,
      'subsection', // Using 'subsection' type

    ),
    new Paragraph( // Code Example for Properties
      'Properties Example', // Title for the code block (can be descriptive)
`property order.customer.nation.region.id.headquarters string;
// This adds a 'headquarters' property of type string
// under the order -> customer -> nation -> region -> id concept path.`,
      'code', // type = 'code'

    ),
    new Paragraph(
      'Types and Traits', // Subsection Title
      `Trilogy has a core type system (e.g., \`string\`, \`number\`, \`list<T>\`, \`struct<...>\`) for data integrity and operations.
      Additionally, a metadata-based trait system allows for richer semantic meaning. Traits are appended using \`::\`.
      Example: \`auto states <- ['NY', 'CA', 'TX']::list<string::us_state_short>;\` defines a list where each element is a string representing a US state abbreviation. Traits can influence validation, default visualizations (like maps for geo traits), or downstream system behavior.`,
       'subsection',
       null
    ),
    new Paragraph( // Code Example for Types and Traits
      'Types and Traits Example',
`import std.geography; // Import traits like us_state_short

// Define a list of strings with a specific trait
auto states <- ['NY', 'CA', 'TX']::list<string::us_state_short>;

// Define a price with a currency trait
auto item_price <- 19.99::number::usd;`,
      'code',
      null
    ),
    new Paragraph(
      'Datasources', // Subsection Title
      `Datasources are the bridge between the logical model (concepts, properties) and the physical data storage. They define *how* and *where* to fetch the data for specific properties.
      A datasource maps logical properties to physical columns or calculations and specifies the source (database table, API endpoint, inline query, file).
      Crucially, they define the \`grain\` - the level of detail or the set of keys that uniquely identify a row returned by the datasource.`,
      'subsection',
      null
    ),
    new Paragraph( // Code Example for Datasource (DB)
      'Datasource Example (Database)',
`import lineitem; // Assume lineitem provides base concepts like order.id etc.

// Add a new property first (as shown before)
property order.customer.nation.region.id.headquarters string;

// Define a datasource to populate the new property
datasource region_headquarters (
    region_id: order.customer.nation.region.id, // Map logical concept key to source column
    headquarters: order.customer.nation.region.headquarters, // Map logical property to source column
)
grain (order.customer.nation.region.id) // Define the unique key for this data
query ''' // SQL query to fetch the physical data
select
    r_regionkey as region_id, -- Aliased to match mapping
    case r_name
        when 'AFRICA' then 'HQ_AF'
        when 'AMERICA' then 'HQ_AM'
        when 'ASIA' then 'HQ_AS'
        when 'EUROPE' then 'HQ_EU'
        when 'MIDDLE EAST' then 'HQ_ME'
        else 'HQ_Unknown'
    end as headquarters -- Aliased to match mapping
from regions -- Assume 'regions' is a physical table/view in the connection
''';`,
      'code',
      null
    ),
     new Paragraph(
        'Datasource (Inline Example Description)', // Description for the inline example
        `Datasources can also use inline data definitions, useful for constants, mappings, or small datasets directly within the model definition.`,
        null, // Use null type for the description part
        null
    ),
    new Paragraph( // Code Example for Datasource (Inline)
        'Datasource Example (Inline Query)',
`datasource region_headquarters_inline (
    region_id: order.customer.nation.region.id,
    headquarters: order.customer.nation.region.headquarters,
)
grain (order.customer.nation.region.id)
query '''
-- Using an inline query (syntax might vary based on backend)
select 1 as region_id, 'HQ1' as headquarters
union all
select 2 as region_id, 'HQ2' as headquarters
union all
select 3 as region_id, 'HQ3' as headquarters
union all
select 4 as region_id, 'HQ4' as headquarters
''';`,
        'code', // type = 'code'
        null   // data = null
    ),

    // --- Using and Managing Models ---
    new Paragraph(
      'Using and Managing Models',
       'How to leverage and maintain your models.',
      'section', // Section Title
      null
    ),
    new Paragraph(
      'Imports', // Subsection Title
      `Models are composed using the \`import\` statement. You can import entire model source editors by their name (or alias if specified in the model config). This makes the concepts, properties, and datasources defined in that source available in the current editor.
      The standard library (\`std\`) is always available for import, providing common functions and traits.`,
      'subsection',
      null
    ),
    new Paragraph( // Code Example for Imports
      'Imports Example',
`// Import concepts/properties defined in the 'lineitem' editor source
import lineitem;

// Import geography traits from the standard library
import std.geography;

// Import concepts from 'customer_details' editor source, aliasing it to 'cust'
import customer_details as cust;

// Now you can use concepts like:
// lineitem.order.id
// std.geography.us_state_short
// cust.customer.address`,
      'code',
      null
    ),
     new Paragraph(
        'Constants', // Subsection Title
        'The simplest form of a concept is a constant, defined using `const`. Constants do not require a datasource as their value is fixed directly in the definition. They are useful for defining fixed values, parameters, or variables within scripts or queries.',
        'subsection',
        null
    ),
    new Paragraph( // Code Example for Constants
        'Constants Example',
`const pi <- 3.14;
const company_founding_year <- 2023;

select pi * 2 as circumference_ratio;`,
        'code',
        null
    ),
    new Paragraph(
      'Creating Model Sources', // Subsection Title
      'Any Trilogy editor can be designated as a source file for a model. This is typically done through the Trilogy UI or configuration. Once an editor is part of a model, its definitions become importable.',
      'subsection',
      null
    ),
     new Paragraph( // Tip paragraph
      'Tip: Generating Models',
      'You can quickly create a basic model source from a database table. When browsing tables in a connection, use the "Create model from table" action. This generates an editor with properties mapped to columns and a basic datasource.',
      'tip', // Use 'tip' type
      null
    ),
    new Paragraph(
      'Model Parsing and Validation', // Subsection Title
      `Models are parsed and validated to ensure correctness and build the metadata necessary for queries and tooling. This typically happens automatically when a query referencing the model is run. You can also trigger parsing manually (e.g., via a 'Parse Model' button in the UI). Parsing checks syntax, type consistency, and resolves imports. Errors found during parsing will be reported, often linking back to the specific editor and line number causing the issue.`,
      'subsection',
      null
    ),
     new Paragraph(
      'Standard Library', // Subsection Title
      'Trilogy includes a standard library, typically available under the `std` namespace (e.g., `import std;` or `import std.math;`). This library provides common functions, operators, and useful metadata traits (like geo-location, currency, etc.).',
       'subsection',
       null
    ),
     new Paragraph( // Tip paragraph
      'Tip: Standard Library',
      'Review the documentation for the standard library (`std`) to discover always-available functions and traits you can use in your models and queries.',
      'tip', // Use 'tip' type
      null
     ),
     new Paragraph(
        'Conclusion',
        'Models are fundamental to leveraging Trilogy effectively, providing a robust semantic layer for consistent, maintainable, and reusable data definitions and logic.',
        'conclusion', // Use 'conclusion' type
        null
     )
  ],
  'Modeling'
);