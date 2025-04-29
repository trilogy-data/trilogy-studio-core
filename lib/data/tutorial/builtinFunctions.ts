import { Article, Paragraph, DocData } from './docTypes.ts'

// Helper type for DocData function property for brevity
type FuncData = { function: DocData['function'] }

export const builtinFunctions = new Article('Functions', [
  new Paragraph(
    'Trilogy Built-in Functions',
    'Trilogy provides a comprehensive set of built-in functions that closely map to standard SQL functions. These functions enable data transformation, aggregation, and manipulation within your queries. They are categorized into aggregate, date/time, string, numeric, collection, and utility functions.',
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

  // AGGREGATE FUNCTIONS
  new Paragraph(
    'Aggregate Functions',
    'Aggregate functions perform calculations across a set of input rows and return a single summary value for each group.',
  ),

  new Paragraph(
    'SUM',
    'Computes the sum of non-null numeric values within each group. Returns NULL if the group is empty or contains only NULL values.',
    'function',
    {
      function: {
        inputTypes: ['INTEGER', 'FLOAT', 'NUMBER', 'NUMERIC'],
        outputType: 'Same as input (or promoted numeric type)',
        outputPurpose: 'METRIC',
        example: 'SELECT SUM(order_total) AS total_revenue BY customer_id;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'COUNT',
    'Counts the number of non-null input rows within each group. Takes a single argument of any type.',
    'function',
    {
      function: {
        inputTypes: ['Any'],
        outputType: 'INTEGER',
        outputPurpose: 'METRIC',
        example: 'SELECT COUNT(order_id) AS num_orders BY product_category;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'COUNT_DISTINCT',
    'Counts the number of distinct non-null input values within each group. Takes a single argument of any type.',
    'function',
    {
      function: {
        inputTypes: ['Any'],
        outputType: 'INTEGER',
        outputPurpose: 'METRIC',
        example: 'SELECT COUNT_DISTINCT(customer_id) AS unique_customers BY month;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'MAX',
    'Returns the maximum non-null value across all input rows within each group. Comparison follows standard data type rules.',
    'function',
    {
      function: {
        inputTypes: [
          'INTEGER',
          'FLOAT',
          'NUMBER',
          'DATE',
          'DATETIME',
          'TIMESTAMP',
          'BOOL',
          'STRING',
        ], // Added STRING based on common SQL
        outputType: 'Same as input type',
        outputPurpose: 'METRIC',
        example: 'SELECT MAX(order_date) AS latest_order_date BY customer_id;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'MIN',
    'Returns the minimum non-null value across all input rows within each group. Comparison follows standard data type rules.',
    'function',
    {
      function: {
        inputTypes: ['INTEGER', 'FLOAT', 'NUMBER', 'DATE', 'DATETIME', 'TIMESTAMP', 'STRING'], // Added STRING based on common SQL, removed BOOL
        outputType: 'Same as input type',
        outputPurpose: 'METRIC',
        example: 'SELECT MIN(order_date) AS first_order_date BY customer_id;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'AVG',
    'Computes the average (arithmetic mean) of non-null numeric values within each group. Returns NULL if the group is empty or contains only NULL values. The result is typically a FLOAT or NUMBER.',
    'function',
    {
      function: {
        inputTypes: ['INTEGER', 'FLOAT', 'NUMBER', 'NUMERIC'],
        outputType: 'FLOAT or NUMBER', // AVG often results in non-integer types
        outputPurpose: 'METRIC',
        example: 'SELECT AVG(product_price) AS avg_price BY category;',
      },
    } as FuncData,
  ),

  // DATE/TIME FUNCTIONS
  new Paragraph(
    'Date/Time Functions',
    'Functions for manipulating and extracting information from date and time values.',
  ),

  new Paragraph(
    'CURRENT_DATE',
    'Returns the current date when the query begins execution. This value remains constant throughout the query.',
    'function',
    {
      function: {
        inputTypes: [],
        outputType: 'DATE',
        outputPurpose: 'CONSTANT',
        example: 'SELECT order_id WHERE order_date = CURRENT_DATE();',
      },
    } as FuncData,
  ),

  new Paragraph(
    'CURRENT_DATETIME',
    'Returns the current date and time (timestamp) when the query begins execution. This value remains constant throughout the query.',
    'function',
    {
      function: {
        inputTypes: [],
        // Assuming Python `DataType.DATE` was a typo and should be DATETIME/TIMESTAMP
        outputType: 'DATETIME',
        outputPurpose: 'CONSTANT',
        example: 'SELECT event_id, CURRENT_DATETIME() AS processing_time;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'DATE',
    'Extracts the date part from a timestamp, datetime, or string, or casts a value to the DATE type. If the input is already a DATE, it is returned unchanged.',
    'function',
    {
      function: {
        inputTypes: ['DATE', 'TIMESTAMP', 'DATETIME', 'STRING'],
        outputType: 'DATE',
        outputPurpose: 'PROPERTY',
        example: 'SELECT DATE(user_signup_timestamp) AS signup_date;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'DATETIME',
    'Casts the input value (date, timestamp, or string) to the DATETIME type.',
    'function',
    {
      function: {
        inputTypes: ['DATE', 'TIMESTAMP', 'DATETIME', 'STRING'],
        outputType: 'DATETIME',
        outputPurpose: 'PROPERTY',
        example: 'SELECT DATETIME(event_date) AS event_datetime;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'TIMESTAMP',
    'Casts the input value (date, datetime, or string) to the TIMESTAMP type.',
    'function',
    {
      function: {
        inputTypes: ['DATE', 'TIMESTAMP', 'DATETIME', 'STRING'],
        outputType: 'TIMESTAMP',
        outputPurpose: 'PROPERTY',
        example: 'SELECT TIMESTAMP(log_entry_string) AS log_timestamp;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'DATE_TRUNCATE',
    "Truncates a date/time value to the specified precision ('year', 'month', 'day', etc.). Returns a value of the same type as the input (or DATE if truncating to day or higher from a timestamp/datetime).",
    'function',
    {
      function: {
        inputTypes: ['DATE/TIMESTAMP/DATETIME/STRING', 'DATE_PART'],
        outputType: 'Same as input type (usually DATE or DATETIME/TIMESTAMP)', // Reflects get_date_trunc_output logic
        outputPurpose: 'PROPERTY',
        example: 'SELECT DATE_TRUNCATE(created_at, month) AS creation_month;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'DATE_PART',
    "Extracts a specific subfield (e.g., 'year', 'month', 'day', 'hour', 'dow' for day of week) from a date/time value as an integer.",
    'function',
    {
      function: {
        inputTypes: ['DATE/TIMESTAMP/DATETIME/STRING', 'DATE_PART'],
        outputType: 'INTEGER (with potential trait)', // Reflects get_date_part_output
        outputPurpose: 'PROPERTY',
        example: 'SELECT DATE_PART(order_timestamp, hour) AS hour_of_order;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'DATE_ADD',
    'Adds a specified integer interval to a date/time value. The unit of the interval is specified by the date part argument (e.g., day, month, year).',
    'function',
    {
      function: {
        inputTypes: ['DATE/TIMESTAMP/DATETIME/STRING', 'DATE_PART', 'INTEGER'],
        // Output type might depend on input, Python says DATE, could be DATETIME/TIMESTAMP too
        outputType: 'Same as first input type (usually DATE or DATETIME/TIMESTAMP)',
        outputPurpose: 'PROPERTY',
        example: 'SELECT DATE_ADD(start_date, day, 14) AS end_date;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'DATE_SUB',
    'Subtracts a specified integer interval from a date/time value. The unit of the interval is specified by the date part argument.',
    'function',
    {
      function: {
        inputTypes: ['DATE/TIMESTAMP/DATETIME/STRING', 'DATE_PART', 'INTEGER'],
        // Output type might depend on input, Python says DATE, could be DATETIME/TIMESTAMP too
        outputType: 'Same as first input type (usually DATE or DATETIME/TIMESTAMP)',
        outputPurpose: 'PROPERTY',
        example: 'SELECT DATE_SUB(event_timestamp, hour, 3) AS reminder_time;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'DATE_DIFF',
    'Calculates the integer difference between two date/time values, expressed in the units specified by the date part argument.',
    'function',
    {
      function: {
        inputTypes: [
          'DATE/TIMESTAMP/DATETIME/STRING',
          'DATE/TIMESTAMP/DATETIME/STRING',
          'DATE_PART',
        ],
        outputType: 'INTEGER',
        outputPurpose: 'PROPERTY',
        example: 'SELECT DATE_DIFF(end_date, start_date, day) AS duration_days;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'UNIX_TO_TIMESTAMP',
    'Converts an integer Unix epoch timestamp (seconds since 1970-01-01 00:00:00 UTC) to a TIMESTAMP value.',
    'function',
    {
      function: {
        inputTypes: ['INTEGER'],
        outputType: 'TIMESTAMP',
        outputPurpose: 'PROPERTY',
        example: 'SELECT UNIX_TO_TIMESTAMP(log_time_seconds) AS event_time;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'SECOND',
    'Extracts the second component (0-59) from a date/time value as an integer.',
    'function',
    {
      function: {
        inputTypes: ['DATE', 'TIMESTAMP', 'DATETIME', 'STRING'],
        outputType: 'INTEGER with "second" trait',
        outputPurpose: 'PROPERTY',
        example: 'SELECT SECOND(event_time) AS event_second;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'MINUTE',
    'Extracts the minute component (0-59) from a date/time value as an integer.',
    'function',
    {
      function: {
        inputTypes: ['DATE', 'TIMESTAMP', 'DATETIME', 'STRING'],
        outputType: 'INTEGER with "minute" trait',
        outputPurpose: 'PROPERTY',
        example: 'SELECT MINUTE(event_time) AS event_minute;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'HOUR',
    'Extracts the hour component (0-23) from a date/time value as an integer.',
    'function',
    {
      function: {
        inputTypes: ['DATE', 'TIMESTAMP', 'DATETIME', 'STRING'],
        outputType: 'INTEGER with "hour" trait',
        outputPurpose: 'PROPERTY',
        example: 'SELECT HOUR(event_time) AS event_hour;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'DAY',
    'Extracts the day of the month component (1-31) from a date/time value as an integer.',
    'function',
    {
      function: {
        inputTypes: ['DATE', 'TIMESTAMP', 'DATETIME', 'STRING'],
        outputType: 'INTEGER with "day" trait',
        outputPurpose: 'PROPERTY',
        example: 'SELECT DAY(event_date) AS event_day_of_month;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'WEEK',
    'Extracts the ISO week number (1-53) from a date/time value as an integer.',
    'function',
    {
      function: {
        inputTypes: ['DATE', 'TIMESTAMP', 'DATETIME', 'STRING'],
        outputType: 'INTEGER with "week" trait',
        outputPurpose: 'PROPERTY',
        example: 'SELECT WEEK(order_date) AS order_week_iso;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'MONTH',
    'Extracts the month component (1-12) from a date/time value as an integer.',
    'function',
    {
      function: {
        inputTypes: ['DATE', 'TIMESTAMP', 'DATETIME', 'STRING'],
        outputType: 'INTEGER with "month" trait',
        outputPurpose: 'PROPERTY',
        example: 'SELECT MONTH(signup_date) AS signup_month;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'QUARTER',
    'Extracts the quarter component (1-4) from a date/time value as an integer.',
    'function',
    {
      function: {
        inputTypes: ['DATE', 'TIMESTAMP', 'DATETIME', 'STRING'],
        outputType: 'INTEGER with "quarter" trait',
        outputPurpose: 'PROPERTY',
        example: 'SELECT QUARTER(fiscal_date) AS fiscal_quarter;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'YEAR',
    'Extracts the year component from a date/time value as an integer.',
    'function',
    {
      function: {
        inputTypes: ['DATE', 'TIMESTAMP', 'DATETIME', 'STRING'],
        outputType: 'INTEGER with "year" trait',
        outputPurpose: 'PROPERTY',
        example: 'SELECT YEAR(birth_date) AS birth_year;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'DAY_OF_WEEK',
    'Extracts the day of the week as an integer (e.g., Sunday=0 or 1, Monday=1 or 2, depending on locale/implementation - typically Sunday=0).',
    'function',
    {
      function: {
        inputTypes: ['DATE', 'TIMESTAMP', 'DATETIME', 'STRING'],
        outputType: 'INTEGER with "day_of_week" trait',
        outputPurpose: 'PROPERTY',
        example: 'SELECT DAY_OF_WEEK(transaction_date) AS transaction_dow;',
      },
    } as FuncData,
  ),

  // STRING FUNCTIONS
  new Paragraph('String Functions', 'Functions for manipulating text strings.'),

  new Paragraph(
    'SPLIT',
    'Splits the first string argument into an array of strings, using the second string argument as the delimiter.',
    'function',
    {
      function: {
        inputTypes: ['STRING', 'STRING'],
        outputType: 'LIST<STRING>', // Using LIST as per Python
        outputPurpose: 'PROPERTY',
        example: 'SELECT SPLIT(product_tags, ";") AS tag_list;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'UPPER',
    'Converts the input string to all uppercase letters according to locale rules.',
    'function',
    {
      function: {
        inputTypes: ['STRING'],
        outputType: 'STRING',
        outputPurpose: 'PROPERTY',
        example: 'SELECT UPPER(country_code) AS normalized_country;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'LOWER',
    'Converts the input string to all lowercase letters according to locale rules.',
    'function',
    {
      function: {
        inputTypes: ['STRING'],
        outputType: 'STRING',
        outputPurpose: 'PROPERTY',
        example: 'SELECT LOWER(email_address) AS normalized_email;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'CONTAINS',
    'Returns true if the first string contains the second string as a substring, false otherwise. Case-sensitive.',
    'function',
    {
      function: {
        inputTypes: ['STRING', 'STRING'],
        outputType: 'BOOL',
        outputPurpose: 'PROPERTY',
        example: 'SELECT description WHERE CONTAINS(description, "urgent");',
      },
    } as FuncData,
  ),

  new Paragraph(
    'STRPOS',
    'Returns the starting position (1-based index) of the first occurrence of the second string within the first string. Returns 0 if the substring is not found. Case-sensitive.',
    'function',
    {
      function: {
        inputTypes: ['STRING', 'STRING'],
        outputType: 'INTEGER',
        outputPurpose: 'PROPERTY',
        example: 'SELECT STRPOS(url, "?") AS query_start_pos;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'SUBSTRING',
    'Extracts a substring from the first argument, starting at the 1-based index specified by the second argument, for a length specified by the third argument.',
    'function',
    {
      function: {
        inputTypes: ['STRING', 'INTEGER', 'INTEGER'],
        outputType: 'STRING',
        outputPurpose: 'PROPERTY',
        example:
          'SELECT SUBSTRING(phone_number, 2, 3) AS area_code; # Assuming format like +1XXX...',
      },
    } as FuncData,
  ),

  new Paragraph(
    'CONCAT',
    'Concatenates two or more string arguments together. NULL arguments are typically ignored or result in NULL depending on implementation.',
    'function',
    {
      function: {
        inputTypes: ['STRING', '...'], // Variable string args
        outputType: 'STRING',
        outputPurpose: 'PROPERTY',
        example: 'SELECT CONCAT(first_name, " ", last_name) AS full_name;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'LENGTH',
    'Returns the length of a string (number of characters), the number of elements in an array/list, or the number of key-value pairs in a map.',
    'function',
    {
      function: {
        inputTypes: ['STRING', 'ARRAY', 'MAP', 'LIST'], // Added LIST
        outputType: 'INTEGER',
        outputPurpose: 'PROPERTY',
        example: 'SELECT LENGTH(comment) AS comment_length;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'LIKE',
    "Performs case-sensitive SQL LIKE pattern matching. Use '%' for any sequence of zero or more characters and '_' for any single character.",
    'function',
    {
      function: {
        inputTypes: ['STRING', 'STRING'],
        outputType: 'BOOL',
        outputPurpose: 'PROPERTY',
        example: 'SELECT product_name WHERE LIKE(product_name, "Model %");',
      },
    } as FuncData,
  ),

  new Paragraph(
    'ILIKE',
    "Performs case-insensitive SQL LIKE pattern matching (similar to Postgres ILIKE). Use '%' and '_' wildcards as with LIKE.",
    'function',
    {
      function: {
        inputTypes: ['STRING', 'STRING'],
        outputType: 'BOOL',
        outputPurpose: 'PROPERTY',
        example: 'SELECT email WHERE ILIKE(email, "%@example.com");',
      },
    } as FuncData,
  ),

  // NUMERIC FUNCTIONS
  new Paragraph(
    'Numeric Functions',
    'Functions for performing mathematical operations on numbers.',
  ),

  new Paragraph('ABS', 'Computes the absolute value of a numeric argument.', 'function', {
    function: {
      inputTypes: ['INTEGER', 'FLOAT', 'NUMBER'],
      outputType: 'Same as input type',
      outputPurpose: 'PROPERTY',
      example: 'SELECT ABS(price_change) AS abs_price_change;',
    },
  } as FuncData),

  new Paragraph(
    'ROUND',
    'Rounds the first numeric argument to the number of decimal places specified by the second integer argument. If the second argument is omitted or zero, rounds to the nearest integer.',
    'function',
    {
      function: {
        inputTypes: ['INTEGER/FLOAT/NUMBER/NUMERIC', 'INTEGER'],
        outputType: 'Same as first input type',
        outputPurpose: 'PROPERTY',
        example: 'SELECT ROUND(average_rating, 1) AS rounded_rating;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'SQRT',
    'Calculates the square root of a non-negative numeric argument. The result is typically a FLOAT or NUMBER.',
    'function',
    {
      function: {
        inputTypes: ['INTEGER', 'FLOAT', 'NUMBER', 'NUMERIC'],
        outputType: 'FLOAT or NUMBER', // Usually returns float/double
        outputPurpose: 'PROPERTY',
        example: 'SELECT SQRT(variance) AS standard_deviation;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'RANDOM',
    'Returns a random floating-point value between 0.0 (inclusive) and 1.0 (exclusive) at the grain of the provided concept. If no concept is provided, all rows have the same value.',
    'function',
    {
      function: {
        inputTypes: ['ANY'],
        outputType: 'FLOAT',
        outputPurpose: 'PROPERTY', // Often property, but can behave like constant per-row if not memoized
        example: 'SELECT order_id, RANDOM(order_id) AS random_sort_key ORDER BY random_sort_key;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'ADD',
    'Performs arithmetic addition on two or more numeric arguments.',
    'function',
    {
      function: {
        inputTypes: ['INTEGER/FLOAT/NUMBER/NUMERIC', '...'],
        outputType: 'Appropriate numeric type based on inputs',
        outputPurpose: 'PROPERTY',
        example: 'SELECT ADD(subtotal, tax, shipping_fee) AS grand_total;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'SUBTRACT',
    'Performs arithmetic subtraction. If two arguments, subtracts the second from the first. If more, behavior might vary (e.g., subtract all subsequent from first).',
    'function',
    {
      function: {
        inputTypes: ['INTEGER/FLOAT/NUMBER/NUMERIC', '...'],
        outputType: 'Appropriate numeric type based on inputs',
        outputPurpose: 'PROPERTY',
        example: 'SELECT SUBTRACT(total_revenue, total_cost) AS profit;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'MULTIPLY',
    'Performs arithmetic multiplication on two or more numeric arguments.',
    'function',
    {
      function: {
        inputTypes: ['INTEGER/FLOAT/NUMBER/NUMERIC', '...'],
        outputType: 'Appropriate numeric type based on inputs',
        outputPurpose: 'PROPERTY',
        example: 'SELECT MULTIPLY(quantity, unit_price) AS line_item_total;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'DIVIDE',
    'Performs arithmetic division. If two arguments, divides the first by the second. Division by zero typically results in an error or NULL/Infinity. Result type is often FLOAT or NUMBER.',
    'function',
    {
      function: {
        inputTypes: ['INTEGER/FLOAT/NUMBER/NUMERIC', '...'],
        outputType: 'FLOAT or NUMBER (usually)',
        outputPurpose: 'PROPERTY',
        example: 'SELECT DIVIDE(total_sales, number_of_units) AS price_per_unit;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'MOD',
    'Computes the modulo (remainder) of the first numeric argument divided by the second integer argument.',
    'function',
    {
      function: {
        inputTypes: ['INTEGER/FLOAT/NUMBER/NUMERIC', 'INTEGER'],
        outputType: 'INTEGER', // Remainder is typically integer
        outputPurpose: 'PROPERTY',
        example: 'SELECT user_id WHERE MOD(user_id, 2) = 0; # Even user IDs',
      },
    } as FuncData,
  ),

  // UTILITY FUNCTIONS
  new Paragraph(
    'Utility Functions',
    'General-purpose functions for data manipulation, control flow, and type handling.',
  ),

  new Paragraph(
    'ALIAS',
    'Assigns a new name (alias) to an expression or concept without changing its value, type, or purpose. Useful for clarity or renaming in SELECT clauses.',
    'function',
    {
      function: {
        inputTypes: ['Any'],
        outputType: 'Same as input',
        outputPurpose: 'Same as input',
        example: 'SELECT user.profile.first_name ALIAS fname;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'PARENTHETICAL',
    'Used for explicit grouping of expressions, primarily to control the order of operations. Does not change the value, type, or purpose of the enclosed expression.',
    'function',
    {
      function: {
        inputTypes: ['Any'],
        outputType: 'Same as input',
        outputPurpose: 'Same as input',
        example: 'SELECT (price + tax) * quantity AS total;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'COALESCE',
    'Returns the first non-null value from its list of arguments. All arguments must be of compatible types. Returns NULL if all arguments are NULL.',
    'function',
    {
      function: {
        inputTypes: ['Any (compatible types)', '...'],
        outputType: 'Same as input types (common compatible type)',
        outputPurpose: 'PROPERTY',
        example: 'SELECT COALESCE(nickname, first_name, "Valued Customer") AS display_name;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'CAST',
    'Explicitly converts an expression to a target data type specified as the second argument (using a DataType enum value or potentially a string literal).',
    'function',
    {
      function: {
        inputTypes: ['Any', 'DataType'],
        outputType: 'Specified by second argument (DataType)',
        outputPurpose: 'PROPERTY',
        example: 'SELECT CAST(order_id_string AS INTEGER) AS order_id_num;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'IS_NULL',
    'Returns true if the input argument is NULL, false otherwise.',
    'function',
    {
      function: {
        inputTypes: ['Any'],
        outputType: 'BOOL',
        outputPurpose: 'PROPERTY',
        example: 'SELECT order_id WHERE IS_NULL(shipping_address);',
      },
    } as FuncData,
  ),

  new Paragraph(
    'BOOL',
    'Attempts to convert the input argument to a boolean value. Behavior depends on the input type (e.g., 0 -> false, non-zero -> true; empty string -> false, non-empty -> true).',
    'function',
    {
      function: {
        inputTypes: ['Any'], // Usually numeric, string, potentially others
        outputType: 'BOOL',
        outputPurpose: 'PROPERTY',
        example: 'SELECT product_id, BOOL(is_active_flag) AS is_active;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'CASE',
    'Evaluates a series of conditions and returns a result based on the first condition that evaluates to true. Syntax: `CASE WHEN condition1 THEN result1 [WHEN condition2 THEN result2 ...] [ELSE default_result] END`. All result expressions must have compatible types.',
    'function',
    {
      function: {
        inputTypes: ['BOOL', 'Any', '...'], // Alternating condition/result pairs, optional ELSE
        outputType: 'Common compatible type of result expressions',
        outputPurpose: 'PROPERTY',
        example:
          'SELECT CASE WHEN score > 90 THEN "A" WHEN score > 80 THEN "B" ELSE "C" END AS grade;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'CONSTANT',
    'Represents a literal value provided as an argument. The type and purpose are determined by the literal itself.',
    'function',
    {
      function: {
        inputTypes: ['Literal (String, Number, Bool, etc.)'],
        outputType: 'Type of the literal',
        outputPurpose: 'CONSTANT',
        example: 'SELECT "Default Category" AS category, product_id;', // String literal implicitly uses CONSTANT
      },
    } as FuncData,
  ),

  new Paragraph(
    'CUSTOM',
    'Represents a user-defined or engine-specific function not built into the core Trilogy language. Input types, output type, and behavior depend on the specific custom function implementation.',
    'function',
    {
      function: {
        inputTypes: ['Depends on custom function'],
        outputType: 'Depends on custom function',
        outputPurpose: 'Usually PROPERTY or METRIC',
        example: 'SELECT my_custom_scoring_function(user_data) AS score;',
      },
    } as FuncData,
  ),

  // COLLECTION FUNCTIONS
  new Paragraph(
    'Collection Functions',
    'Functions for working with complex data types like arrays/lists, maps, and structs.',
  ),

  new Paragraph(
    'UNNEST',
    'Expands an array or list into a set of rows, where each row contains one element from the array/list. This typically changes the grain of the query, hence the KEY purpose.',
    'function',
    {
      function: {
        inputTypes: ['ARRAY', 'LIST'],
        outputType: 'Element type of the input collection',
        outputPurpose: 'KEY',
        example: 'SELECT order_id, UNNEST(product_ids) AS product_id;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'INDEX_ACCESS',
    'Retrieves an element from an array or list using its zero-based integer index. Accessing an index outside the bounds may result in NULL or an error.',
    'function',
    {
      function: {
        inputTypes: ['ARRAY/LIST', 'INTEGER'],
        outputType: 'Element type of the input collection',
        outputPurpose: 'PROPERTY',
        example: 'SELECT INDEX_ACCESS(sensor_readings, 0) AS first_reading;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'MAP_ACCESS',
    "Retrieves the value associated with a specified key from a map. The key type must match the map's key type (usually STRING or INTEGER). Returns NULL if the key is not found.",
    'function',
    {
      function: {
        inputTypes: ['MAP', 'INTEGER/STRING'], // Key type
        outputType: 'Value type of the map',
        outputPurpose: 'PROPERTY',
        example: 'SELECT MAP_ACCESS(user_properties, "preferred_language") AS language;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'ATTR_ACCESS',
    'Retrieves the value of a named field (attribute) from a struct. The second argument is the attribute name (string). Accessing a non-existent attribute may result in NULL or an error.',
    'function',
    {
      function: {
        inputTypes: ['STRUCT', 'STRING'], // Struct and attribute name
        outputType: 'Type of the accessed attribute',
        outputPurpose: 'PROPERTY',
        example: 'SELECT ATTR_ACCESS(address_struct, "zip_code") AS zip;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'STRUCT',
    'Constructs a struct (similar to a record or object) dynamically from pairs of arguments: field name (string literal) followed by the field value.',
    'function',
    {
      function: {
        inputTypes: ['STRING (name)', 'Any (value)', '...'], // Alternating name/value pairs
        outputType: 'STRUCT with specified fields and types',
        outputPurpose: 'PROPERTY',
        example: 'SELECT STRUCT("id", user_id, "email", user_email) AS user_info;',
      },
    } as FuncData,
  ),

  new Paragraph(
    'ARRAY',
    'Constructs an array containing the provided arguments. All arguments should ideally be of a compatible type; behavior/support depends on target DB. The output type depends on the input argument types.',
    'function',
    {
      function: {
        inputTypes: ['Any (compatible types)', '...'],
        // Python says ListType(STRING), but usually it's based on args
        outputType: 'ARRAY of common compatible type of arguments',
        outputPurpose: 'PROPERTY',
        example: 'SELECT ARRAY(primary_color, secondary_color) AS palette;',
      },
    } as FuncData,
  ),

  // SET/RELATIONAL FUNCTIONS (Could be its own category)
  new Paragraph('Set/Relational Functions', 'Functions operating on sets or relations.'),

  new Paragraph(
    'UNION',
    'Combines the results of two or more compatible inputs (concepts or queries) into a single result set. Behaves like UNION ALL (does not remove duplicates). The inputs must have compatible data types.',
    'function',
    {
      function: {
        inputTypes: ['Any (compatible concepts/queries)', '...'],
        outputType: 'Depends on inputs (structure of the combined set)',
        outputPurpose: 'KEY', // Usually produces a new set/relation
        example: 'SELECT * FROM UNION(active_customers, recently_lapsed_customers);',
      },
    } as FuncData,
  ),

  new Paragraph(
    'GROUP',
    'Explicitly specifies the grouping keys for an expression, often used with aggregate functions when a different grain is needed than the main query `BY` clause. The first argument is the expression to aggregate/group, subsequent arguments are the keys. Syntax is distinct in that is is group key by <over clause>, similar to a group by.',
    'function',
    {
      function: {
        inputTypes: ['Any (expression)', 'Any (key)', '...'],
        outputType: "Same as first argument's type",
        // Purpose might depend on the first argument (Metric if aggregate, Property/Key otherwise)
        outputPurpose: 'Depends on first argument',
        example:
          'SELECT SUM(revenue) AS total_revenue, GROUP SUM(revenue) BY product_category AS revenue_by_category, customer_id;',
      },
    } as FuncData,
  ),
])
