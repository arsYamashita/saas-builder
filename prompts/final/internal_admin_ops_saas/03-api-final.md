Read and obey these rule files in order:

1. docs/rules/internal_admin_ops_saas/01-template-scope.md
2. docs/rules/internal_admin_ops_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/internal_admin_ops_saas/05-role-rules.md
6. docs/rules/06-api-rules.md
7. docs/rules/08-db-rules.md
8. docs/rules/09-output-format-rules.md

You are generating API design for the fixed template:
internal_admin_ops_saas

## Objective
Generate implementation-ready API route design for the allowed domain endpoints.

## Fixed Runtime Assumptions
These modules already exist and must be referenced, not reinvented:
- @/lib/db/supabase/admin
- @/lib/auth/current-user
- @/lib/tenant/current-tenant
- @/lib/rbac/guards
- @/lib/audit/write-audit-log

## Allowed API Surface

### Operation Requests
- GET /api/domain/requests (admin: all, operator: own only)
- POST /api/domain/requests (operator+)
- GET /api/domain/requests/[requestId]
- PATCH /api/domain/requests/[requestId] (admin: any field, operator: own pending only)

### Approvals
- POST /api/domain/requests/[requestId]/approve (admin+)
- POST /api/domain/requests/[requestId]/reject (admin+)

### Categories
- GET /api/domain/categories (all authenticated)
- POST /api/domain/categories (admin+)
- PATCH /api/domain/categories/[categoryId] (admin+)

## Required Behavior Rules
- all mutating domain routes must require admin or stronger, except request creation (operator+)
- operators may only create and update their own pending requests
- all domain reads must be tenant-scoped
- all inputs must be validated with zod
- all responses must be JSON
- all successful mutations must write audit logs
- approve/reject must update operation_request.status and insert approval record atomically
- no server actions
- no graphql
- no RPC by default
- CRITICAL: use role names "owner", "admin", "operator" only — never use "member"

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
