Read and obey these rule files in order:

1. docs/rules/simple_crm_saas/01-template-scope.md
2. docs/rules/simple_crm_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/simple_crm_saas/05-role-rules.md
6. docs/rules/06-api-rules.md
7. docs/rules/08-db-rules.md
8. docs/rules/09-output-format-rules.md

You are generating API design for the fixed template:
simple_crm_saas

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

### Customers
- GET /api/domain/customers
- POST /api/domain/customers
- GET /api/domain/customers/[customerId]
- PATCH /api/domain/customers/[customerId]

### Deals
- GET /api/domain/deals
- POST /api/domain/deals
- GET /api/domain/deals/[dealId]
- PATCH /api/domain/deals/[dealId]

### Tasks
- GET /api/domain/tasks
- POST /api/domain/tasks
- GET /api/domain/tasks/[taskId]
- PATCH /api/domain/tasks/[taskId]

## Required Behavior Rules
- all mutating domain routes must require admin or stronger
- staff may update task status and deal stage only
- all domain reads must be tenant-scoped
- all inputs must be validated with zod
- all responses must be JSON
- all successful mutations must write audit logs
- no server actions
- no graphql
- no RPC by default

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
