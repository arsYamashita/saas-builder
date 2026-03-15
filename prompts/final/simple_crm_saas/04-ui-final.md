Read and obey these rule files in order:

1. docs/rules/simple_crm_saas/01-template-scope.md
2. docs/rules/simple_crm_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/07-ui-rules.md
6. docs/rules/09-output-format-rules.md

You are generating UI only for the fixed template:
simple_crm_saas

## Objective
Generate saveable UI file objects for the approved admin-first pages and components.

## Allowed Pages
- app/(generated)/dashboard/page.tsx
- app/(generated)/contacts/page.tsx
- app/(generated)/contacts/new/page.tsx
- app/(generated)/contacts/[contactId]/edit/page.tsx
- app/(generated)/companies/page.tsx
- app/(generated)/companies/new/page.tsx
- app/(generated)/companies/[companyId]/edit/page.tsx
- app/(generated)/deals/page.tsx
- app/(generated)/deals/new/page.tsx
- app/(generated)/deals/[dealId]/edit/page.tsx
- app/(generated)/activities/page.tsx
- app/(generated)/activities/new/page.tsx
- app/(generated)/activities/[activityId]/edit/page.tsx
- app/(generated)/settings/page.tsx

## Allowed Components
- components/domain/contact-form.tsx
- components/domain/company-form.tsx
- components/domain/deal-form.tsx
- components/domain/activity-form.tsx
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
- affiliate UI
- reservation UI

## Form Rules
- one form per entity
- contact form should map to contact validation structure
- company form should map to company validation structure
- deal form should map to deal validation structure
- activity form should map to activity validation structure
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
