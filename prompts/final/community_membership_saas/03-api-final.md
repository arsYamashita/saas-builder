Read and obey these rule files in order:

1. docs/rules/community_membership_saas/01-template-scope.md
2. docs/rules/community_membership_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/community_membership_saas/05-role-rules.md
6. docs/rules/06-api-rules.md
7. docs/rules/08-db-rules.md
8. docs/rules/09-output-format-rules.md

You are generating API design for the fixed template:
community_membership_saas

## Objective
Generate implementation-ready API route design for the allowed domain endpoints.

## Fixed Runtime Assumptions
These modules already exist and must be referenced, not reinvented:
- @/lib/db/supabase/admin
- @/lib/auth/current-user
- @/lib/tenant/current-tenant
- @/lib/rbac/guards
- @/lib/audit/write-audit-log
- @/src/lib/guards (template-specific guards)
- @/src/lib/access (content access evaluation)
- @/src/lib/audit (audit log writer)
- @/src/lib/stripe (Stripe helpers)

## Allowed API Surface

### Auth
- POST /api/auth/login
- POST /api/auth/signup
- POST /api/auth/accept-invite

### Profile
- GET /api/me (current user profile + memberships)

### Admin — Contents
- GET /api/admin/tenants/[tenantId]/contents (editor+)
- POST /api/admin/tenants/[tenantId]/contents (editor+)
- PATCH /api/admin/tenants/[tenantId]/contents/[contentId] (editor+)
- DELETE /api/admin/tenants/[tenantId]/contents/[contentId] (editor+)

### Admin — Members
- GET /api/admin/tenants/[tenantId]/members (admin+)
- POST /api/admin/tenants/[tenantId]/members (admin+, invite)
- PATCH /api/admin/tenants/[tenantId]/members/[userId] (admin+, role change)
- DELETE /api/admin/tenants/[tenantId]/members/[userId] (admin+)

### Admin — Plans
- GET /api/admin/tenants/[tenantId]/plans (admin+)
- POST /api/admin/tenants/[tenantId]/plans (admin+)
- PATCH /api/admin/tenants/[tenantId]/plans/[planId] (admin+)

### Admin — Tags
- GET /api/admin/tenants/[tenantId]/tags (admin+)
- POST /api/admin/tenants/[tenantId]/tags (admin+)

### Admin — User Tags
- POST /api/admin/tenants/[tenantId]/user-tags (admin+)
- DELETE /api/admin/tenants/[tenantId]/user-tags/[userTagId] (admin+)

### Admin — Audit Logs
- GET /api/admin/tenants/[tenantId]/audit-logs (admin+, read-only)

### Public
- GET /api/public/tenants/[tenantSlug]/contents (public + access-filtered)
- GET /api/public/tenants/[tenantSlug]/contents/[slug] (public + access check)
- GET /api/public/tenants/[tenantSlug]/plans (public plan listing)

### Stripe
- POST /api/stripe/checkout/subscription (member+, create subscription checkout)
- POST /api/stripe/checkout/purchase (member+, create one-time purchase checkout)
- POST /api/stripe/webhook (Stripe webhook handler, no auth)

## Required Behavior Rules
- admin routes require admin or stronger (except content routes which allow editor+)
- all domain reads must be tenant-scoped
- public content API must evaluate access rules via access.ts
- all inputs must be validated with zod
- all responses must be JSON
- all successful mutations must write audit logs
- Stripe webhook must verify signature before processing
- no server actions
- no graphql
- no RPC by default
- CRITICAL: use role names "owner", "admin", "editor", "member" only — never use "operator"

## Required Output Structure
Return exactly these sections in plain text:

1. Purpose
2. Inputs
3. Outputs
4. Rules
5. Edge Cases
6. Route List
7. Validation Files
8. Shared Imports
9. Recommended File Paths

Do not output code in this prompt.
Do not output markdown tables.

## Blueprint JSON
{{blueprint_json}}

## Schema SQL
{{schema_sql}}
