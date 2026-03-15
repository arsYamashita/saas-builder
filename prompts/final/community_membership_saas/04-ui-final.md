Read and obey these rule files in order:

1. docs/rules/community_membership_saas/01-template-scope.md
2. docs/rules/community_membership_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/07-ui-rules.md
6. docs/rules/09-output-format-rules.md

You are generating UI only for the fixed template:
community_membership_saas

## Objective
Generate saveable UI file objects for the approved admin-first pages and components.

## Allowed Pages
- app/(generated)/dashboard/page.tsx
- app/(generated)/contents/page.tsx
- app/(generated)/contents/new/page.tsx
- app/(generated)/contents/[slug]/edit/page.tsx
- app/(generated)/members/page.tsx
- app/(generated)/plans/page.tsx
- app/(generated)/plans/new/page.tsx
- app/(generated)/tags/page.tsx
- app/(generated)/settings/page.tsx

## Allowed Components
- components/domain/content-form.tsx
- components/domain/content-card.tsx
- components/domain/plan-card.tsx
- components/domain/plan-form.tsx
- components/domain/member-table.tsx
- components/domain/tag-badge.tsx
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
- approval workflow UI
- operation request UI
- reservation / booking UI
- CRM / deal UI
- webhook logic
- auth redesign
- tenant redesign
- backend architecture
- new product modules
- marketing landing pages
- affiliate UI

## Form Rules
- one form per entity
- content form should map to content validation structure
- plan form should map to plan validation structure
- member table should show role, status, and management actions
- tag management should be inline or simple form
- no multi-step wizard
- no drag-and-drop
- no theme switcher
- no chat UI

## Access-Aware UI
- Public content pages must respect visibility_mode
- Member-only content should show lock indicator for non-members
- Subscription/purchase buttons should be conditional on access

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
