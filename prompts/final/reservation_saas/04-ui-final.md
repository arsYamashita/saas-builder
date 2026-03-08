Read and obey these rule files in order:

1. docs/rules/reservation_saas/01-template-scope.md
2. docs/rules/reservation_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/07-ui-rules.md
6. docs/rules/09-output-format-rules.md

You are generating UI only for the fixed template:
reservation_saas

## Objective
Generate saveable UI file objects for the approved admin-first pages and components.

## Allowed Pages
- app/(generated)/dashboard/page.tsx
- app/(generated)/services/page.tsx
- app/(generated)/services/new/page.tsx
- app/(generated)/services/[serviceId]/edit/page.tsx
- app/(generated)/reservations/page.tsx
- app/(generated)/reservations/new/page.tsx
- app/(generated)/reservations/[reservationId]/edit/page.tsx
- app/(generated)/customers/page.tsx
- app/(generated)/customers/[customerId]/page.tsx
- app/(generated)/settings/page.tsx

## Allowed Components
- components/domain/service-form.tsx
- components/domain/reservation-form.tsx
- components/domain/customer-detail.tsx
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

## Form Rules
- one form per entity
- service form should map to service validation structure
- reservation form should map to reservation validation structure
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
