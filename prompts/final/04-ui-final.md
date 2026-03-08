Read and obey these rule files in order:

1. docs/rules/01-template-scope.md
2. docs/rules/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/07-ui-rules.md
6. docs/rules/09-output-format-rules.md
7. docs/rules/11-lovable-template-contract.md

You are generating UI only for the fixed template:
membership_content_affiliate

## Objective
Generate saveable UI file objects for the approved admin-first pages and components.

## Allowed Pages
- app/(generated)/dashboard/page.tsx
- app/(generated)/content/page.tsx
- app/(generated)/content/new/page.tsx
- app/(generated)/content/[contentId]/edit/page.tsx
- app/(generated)/plans/page.tsx
- app/(generated)/plans/new/page.tsx
- app/(generated)/plans/[planId]/edit/page.tsx
- app/(generated)/billing/page.tsx
- app/(generated)/affiliate/page.tsx

## Allowed Components
- components/domain/content-form.tsx
- components/domain/membership-plan-form.tsx
- components/admin/admin-nav.tsx
- components/admin/logout-button.tsx

## UI Style
- modern
- minimal
- professional
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

## Form Rules
- one form per entity
- content form should map to content validation structure
- membership plan form should map to plan validation structure
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
