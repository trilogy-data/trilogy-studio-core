What the function actually matches

    Inline expressions / fallbacks: single braces — {...} matched by /\{([^}]+)\}/g and handled by evaluateFallback.

    Loops: double-brace each blocks only for the data array:

        {{#each data}} ... {{/each}} matched by /\{\{#each data\}\}([\s\S]*?)\{\{\/each\}\}/g

        {{#each data limit=N}} ... {{/each}} matched by /\{\{#each data limit=(\d+)\}\}([\s\S]*?)\{\{\/each\}\}/g

    Placeholders inside loops: {{...}} matched by /\{\{([^}]+)\}\}/g.

        Special token @index is supported inside loops.

Expression evaluation rules

    evaluateExpression(expression, queryResults, loading):

        If loading === true → returns undefined (so evaluateFallback uses loading-pill logic).

        If no queryResults or queryResults.data → returns undefined.

        Only these patterns are allowed (safePatterns):

            ^data\[\d+\]\.\w+$ → data[0].field

            ^data\.length$ → data.length

            ^\w+$ → simple field names (no dots/brackets)

        Behavior:

            data[0].field → returns that row's field (if present).

            data.length → returns number of rows.

            simple field → returns firstRow[field] (uses the first row).

        Unsafe patterns are blocked (warn in console) and return undefined.

Fallbacks (||)

    evaluateFallback recognizes main || fallback via /^(.+?)\s*\|\|\s*(.+?)$/.

        If loading === true it returns a loading pill sized based on the fallback text (if quoted, it strips quotes for sizing).

        Otherwise it:

            tries evaluateExpression(main), and if defined/non-empty returns it,

            else if fallback is a quoted literal returns the unquoted string,

            else tries evaluateExpression(fallback) and returns that if defined,

            otherwise returns the fallback string.

    If no || is present:

        If loading, returns a loading pill using the expression text for sizing.

        Else returns evaluateExpression(expression) stringified if defined, otherwise returns {expression} as-is.

Loop semantics

    Only data is supported — you cannot {{#each users}} (the function hardcodes data).

    For each row in queryResults.data:

        Replaces {{...}} inside the loop body.

        {{@index}} → String(index).

        Field names must pass /^[\w\s|'"]+$/:

            That allows letters, digits, underscore, spaces, single/double quotes and | (used for fallback).

            It does NOT allow dot notation (e.g. user.name) or bracket notation inside the loop placeholders — use simple field names only.

        Loop-level fallback {{field || 'N/A'}} is supported:

            If row[field] exists and non-empty → used.

            Else if fallback is quoted → unquoted literal used.

            Else fallback is treated as a field name and row[fallback] is used if present.

        limit=N variant:

            Parses N, does a safety check (isNaN or N < 0 or N > 1000 → warn and return original match).

            Uses queryResults.data.slice(0, N) to produce items.

Loading mode specifics

    When loading === true:

        Inline {expr || 'text'} → produces loading pills sized by 'text'.

        Loops:

            The plain {{#each data}} loop shows 3 loading items.

            The limit=N loop shows min(N, 3) loading items (cap of 3).

            Inside the loop the inner {{...}} placeholders are replaced by loading pills; @index becomes a small pill with '0'.

What gets escaped / sanitized and when

    Code fences (triple-backtick blocks) are extracted first, their contents are escaped via escapeHtml, and replaced with a safe code-block HTML snippet (with a generated id and data-content).

    Substituted text from {...} and {{...}} is injected raw into the markdown text (not escaped there).

        That raw string then goes through convertMarkdownToHtml (so markdown in data will be parsed) and finally the whole resulting HTML is sanitized by sanitizeHtml (DOMPurify) with your configured allowlist.

    Important gotcha: convertMarkdownToHtml creates a copy button with onclick="copyCodeBlock('id')" in the code block HTML. But sanitizeHtml forbids onclick (FORBID_ATTR includes 'onclick'), so DOMPurify will strip that attribute — meaning the inline onclick will be removed and the copy button won’t work. Recommendation: avoid inline onclick and instead attach event listeners after DOM insertion (use data-* attributes and addEventListener in the component).

    Sanitization allows style attribute (ALLOWED_ATTR includes style) — be aware that allowing style can create other risks (you may want to tighten that).

Examples

    Inline first-row field:

First name: {first_name}

    If queryResults.data[0].first_name === 'Alice' → First name: Alice.

    If missing and no fallback → renders {first_name}.

    Inline array access:

Top email: {data[0].email || 'no email'}

    Uses row 0 email or 'no email'.

    Data length:

Total rows: {data.length}

    Shows row count.

    Simple loop:

## Users
{{#each data}}
- {{@index}} — **{{name || 'N/A'}}** ({{email || '—'}})
{{/each}}

    Repeats for each row; name/email come from each row. If loading true → three loading lines with pills.

    Loop with limit:

{{#each data limit=2}}
- {{name}}
{{/each}}

    Shows first 2 rows (works only when queryResults.data exists). If limit invalid (>1000 or <0) it returns the original literal block and warns.

    Missing data fallback (no queryResults):

There are {data.length || 'no'} results.

    If queryResults missing -> returns 'no'.