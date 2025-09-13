## Basic Markdown-like spec


Used for templating SQL query results into a script.

Basic access is by field name - ex {field_a}.

If no index is provided, then it is assumed to be first row.

If an index is provided, off the root data object, then it is in that row {data[1].field_a}

Loops on array fields are supported, and loops on the base data object is supported.

