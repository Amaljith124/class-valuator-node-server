# Node Server Coding Style

This file defines the required JavaScript conventions for all code under node-server. Keep the existing layer boundaries and naming: routes handle HTTP, helpers implement workflow and external services, controllers contain parameterized SQL, models map database rows to API data, middleware handles cross-cutting request behavior, and config owns environment settings.

## Formatting

- Use four spaces for indentation. Do not use tabs.
- Put opening braces for functions, conditionals, and callbacks on the next line.
- Put one statement on each line.
- Keep imports/requires, object properties, argument lists, and Promise chains easy to scan. Wrap long lines.
- Use semicolons and double quotes, matching the current Node project.
- Write controller SQL as readable multiline template literals: put major clauses on separate lines, separate columns and assignments with a space after commas, and indent continuation lines consistently. Keep placeholders parameterized and pass values separately to `db.query()`.
- Name logs with a bracketed source/function/step label, for example `[process.create] insert evaluation process failed`.

## Naming

- Use the full module name for required helpers and managers. For example, name the import `evaluationManager` when requiring `evaluationManager`; do not shorten it to a generic alias such as `manager`.
- Convert database rows to camelCase through the matching model before resolving controller results. Use the model's single-row mapper for one row and list mapper for multiple rows, for example `resolve(processModel.fromRow(result.rows[0]))` or `resolve(processModel.fromRows(result.rows))`. Keep raw database column names inside SQL only.

## Controller SQL

- Write controller SQL as multiline template strings. Put clauses and selected columns on separate lines, with consistent tab indentation inside the SQL string.
- List every selected and returned column by its full name. Do not use `*` or qualified wildcards such as `p.*`; spell out the columns fetched by `SELECT` and `RETURNING`.
- Keep SQL identifiers, commas, operators, and parameter placeholders spaced consistently, and keep queries parameterized.

## Database SQL scripts

- Put each SQL statement on its own lines, with one column or constraint per line in table definitions and one index or insert clause per line where practical.
- Indent nested clauses and column lists with tabs. Separate statements with a blank line and keep commas and parentheses consistently spaced.
- Name every selected or returned column explicitly; do not use `*` or qualified wildcards.

## Mandatory JavaScript rules

### No try/catch

Handle asynchronous failures with Promise `.catch()` only. Do not use `try`, `catch`, or `finally` syntax.

### Every if has an else

Every `if` statement must have an `else` branch. When the branch intentionally does nothing, explain why in a short comment.

```js
if ( row.email )
{
    emails.push( row.email );
}
else
{
    // no email on this row — nothing to add
}
```

### Every then has its own catch

Do not chain dependent `.then().then()` steps. Nest the next operation inside the previous `.then()` and attach a uniquely logged `.catch()` to every Promise step.

```js
stepOne()
    .then( function ( a )
    {
        stepTwo( a )
            .then( function ( b )
            {
                resolve( b );
            } )
            .catch( function ( error )
            {
                console.error( "[module.fn] stepTwo failed", error );
                reject( error );
            } );
    } )
    .catch( function ( error )
    {
        console.error( "[module.fn] stepOne failed", error );
        reject( error );
    } );
```

### Promise-based module functions

Controller and helper functions that perform work return `new Promise( function ( resolve, reject ) { ... } )`. Resolve successful values and reject failures; do not use synchronous `throw` for ordinary validation or workflow errors. Every rejection path should be logged at the step that failed.

### Logging and security

- Every `.catch()` logs a unique message naming its module, function, failed step, and useful record IDs.
- Keep dependent steps in their `.then()` callback in reading order. Do not extract a step into a helper that is called from multiple workflow locations just to shorten a Promise chain.
- Never log credentials, authorization headers, internal tokens, signed URLs, raw media, or full transcript content.
- Use parameterized SQL (`$1`, `$2`, …).
- Validate required route fields before starting work and use `helpers/responseManager` for HTTP responses. Where the existing codebase provides `response.ResponseForFailure( req, res, "Fields Missing" )`, use it for missing fields; this Node server currently exposes `response.failure( res, error )` instead.
- Keep schema changes in manually run SQL under `database/scripts/`. `schemaCreation.sql` holds the full fresh-install structure and the record of the latest update script. Initial data belongs in the matching `*Creation.sql` data script. A schema or data change for a running project also needs a numbered `updateScripts/NNNN.sql` file that records itself in the schema's update history.
- Keep SQL scripts manual. Never add automatic schema execution to server startup.

## Review checklist

Before submitting Node JavaScript, check that:

- indentation and line breaks are consistent;
- controller SQL has readable clause and column spacing, with parameter values passed separately;
- required helper imports use the full module name rather than a generic alias;
- database rows are mapped to camelCase by their model before controller Promises resolve;
- controller SQL is multiline, readable, parameterized, and uses explicit column lists without wildcards;
- database SQL scripts use consistent multiline statements, tab indentation, and explicit column lists;
- there is no try/catch syntax;
- every if has an else;
- every then has its own catch with a unique source/step log;
- dependent Promise work is nested, never chained;
- controller SQL is parameterized and helper/controller/model responsibilities remain clear;
- no secret or sensitive recording content is logged.
