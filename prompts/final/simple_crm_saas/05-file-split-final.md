Read and obey these rule files in order:

1. docs/rules/simple_crm_saas/01-template-scope.md
2. docs/rules/simple_crm_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/simple_crm_saas/05-role-rules.md
6. docs/rules/06-api-rules.md
7. docs/rules/07-ui-rules.md
8. docs/rules/08-db-rules.md
9. docs/rules/09-output-format-rules.md

You are converting implementation output into saveable file objects for:
simple_crm_saas

## Objective
Split the provided implementation output into valid file objects that match the allowed file paths and categories.

## Allowed Categories
- schema
- migration
- api_route
- api_schema
- page
- component
- layout
- type
- test
- config
- prompt_output

## Hard Restrictions
- only allowed file paths from the file path rules
- do not emit forbidden paths
- do not emit duplicate alternative versions for the same path
- if content is unsuitable for a file, omit it
- prefer fewer high-confidence files over many weak files

## Output Format
Return JSON array only.

Each item must be:
{
  "file_category": "...",
  "file_path": "...",
  "language": "...",
  "title": "...",
  "description": "...",
  "content_text": "..."
}

No markdown.
No extra explanation.
No notes outside the JSON.

## Mapping Rules
- SQL schema content -> schema or migration
- Route handler code -> api_route
- Zod validation or API shape docs -> api_schema
- React pages -> page
- React reusable parts -> component
- Typescript types -> type
- tests -> test

## Source Implementation Output
{{implementation_output}}
