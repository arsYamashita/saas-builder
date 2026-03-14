Read and obey these rule files in order:

1. docs/rules/internal_admin_ops_saas/01-template-scope.md
2. docs/rules/internal_admin_ops_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/internal_admin_ops_saas/05-role-rules.md
6. docs/rules/08-db-rules.md
7. docs/rules/09-output-format-rules.md

You are generating PostgreSQL schema output for the fixed template:
internal_admin_ops_saas

## Objective
Produce production-oriented SQL additions or schema definitions that fit the existing template without redesigning the core.

## Existing Tables Already Considered Present
Assume these tables already exist in the broader system:
- tenants
- users
- tenant_users
- audit_logs

You must not redesign those tables unless the prompt explicitly says they are missing.
Focus on domain-specific tables and safe additions.

## Allowed Domain Tables
- operation_requests
- approvals
- categories

## Hard Rules
- Use PostgreSQL syntax
- Use tenant_id on domain tables
- Include foreign keys where applicable
- Include indexes where helpful
- Include created_at and updated_at
- Do not rename existing tables
- Do not introduce unrelated tables
- If any CHECK constraint references roles, use EXACTLY: 'owner', 'admin', 'operator'
- Do NOT use 'member' as a role name — this template uses 'operator' for the lowest-privilege role

## If a table already exists conceptually
Prefer additive or compatible schema.
Do not break existing assumptions.

## Required Output Format
Return plain SQL only.
Do not wrap in markdown.
Do not include explanation before or after.

## Table Requirements

### categories
Must support:
- id
- tenant_id
- name
- slug
- color (nullable)
- sort_order
- created_at
- updated_at

### operation_requests
Must support:
- id
- tenant_id
- title
- description
- category_id (references categories)
- priority (low/medium/high/urgent)
- status (draft/pending/approved/rejected/completed)
- requested_by (references tenant_users)
- assigned_to (nullable, references tenant_users)
- due_date (nullable)
- notes (nullable)
- created_at
- updated_at

### approvals
Must support:
- id
- tenant_id
- request_id (references operation_requests)
- action (approved/rejected)
- decided_by (references tenant_users)
- comment (nullable)
- decided_at
- created_at

## Quality Requirements
- schema should be directly saveable as a migration candidate
- keep it minimal and implementation-friendly
- no speculative advanced features

## Blueprint JSON
{{blueprint_json}}
