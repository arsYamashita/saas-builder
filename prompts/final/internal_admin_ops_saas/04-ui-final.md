Read and obey these rule files in order:

1. docs/rules/internal_admin_ops_saas/01-template-scope.md
2. docs/rules/internal_admin_ops_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/07-ui-rules.md
6. docs/rules/09-output-format-rules.md

You are generating UI only for the fixed template:
internal_admin_ops_saas

## Objective
Generate saveable UI file objects for the approved admin-first pages and components.

## Allowed Pages
- app/(generated)/dashboard/page.tsx
- app/(generated)/requests/page.tsx
- app/(generated)/requests/new/page.tsx
- app/(generated)/requests/[requestId]/edit/page.tsx
- app/(generated)/approvals/page.tsx
- app/(generated)/categories/page.tsx
- app/(generated)/categories/new/page.tsx

## Allowed Components
- components/domain/request-form.tsx
- components/domain/request-status-badge.tsx
- components/domain/approval-action.tsx
- components/domain/category-form.tsx
- components/admin/admin-nav.tsx
- components/admin/logout-button.tsx

## UI Style
- professional
- clean
- minimal
- readable
- admin-first
- no flashy decoration

## Critical Restrictions
Do not generate:
- billing business logic
- webhook logic
- auth redesign
- tenant redesign
- backend architecture
- new product modules
- marketing landing pages
- affiliate UI
- reservation UI
- CRM UI

## Form Rules
- one form per entity
- request form should map to request validation structure
- category form should map to category validation structure
- approval action should be a simple approve/reject button pair with optional comment
- no multi-step wizard
- no drag-and-drop
- no theme switcher
- no chat UI

## Output Format
Return JSON array only.
Each item must be:

{
  "file_category": "page or component or layout",
  "file_path": "...",
  "language": "tsx",
  "title": "...",
  "description": "...",
  "content_text": "full file content"
}

Do not wrap in markdown.
Do not add commentary.

## Blueprint JSON
{{blueprint_json}}

## Brand Tone
{{brand_tone}}
