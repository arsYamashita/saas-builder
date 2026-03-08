# Output Format Rules

## For File Generation
When AI is asked to generate code files, it must return JSON array only.

Format:
[
  {
    "file_category": "page",
    "file_path": "app/(generated)/content/page.tsx",
    "language": "tsx",
    "title": "Content list page",
    "description": "Admin content list page",
    "content_text": "full code here"
  }
]

## For Single File Generation
Return only the file content.
Do not add explanations above or below unless explicitly requested.

## For Architecture Output
Use these headings only:
1. Purpose
2. Inputs
3. Outputs
4. Rules
5. Edge Cases

## Forbidden Output
- markdown tables
- decorative emojis
- pseudo code when real code was requested
- mixing multiple alternative styles in one file
