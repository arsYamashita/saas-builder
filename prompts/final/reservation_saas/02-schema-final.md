Read and obey these rule files in order:

1. docs/rules/reservation_saas/01-template-scope.md
2. docs/rules/reservation_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/reservation_saas/05-role-rules.md
6. docs/rules/08-db-rules.md
7. docs/rules/09-output-format-rules.md

You are generating PostgreSQL schema output for the fixed template:
reservation_saas

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
- services
- reservations
- customers
- staff_members

## Hard Rules
- Use PostgreSQL syntax
- Use tenant_id on domain tables
- Include foreign keys where applicable
- Include indexes where helpful
- Include created_at and updated_at
- Do not rename existing tables
- Do not introduce unrelated tables

## If a table already exists conceptually
Prefer additive or compatible schema.
Do not break existing assumptions.

## Required Output Format
Return plain SQL only.
Do not wrap in markdown.
Do not include explanation before or after.

## Table Requirements

### services
Must support:
- id
- tenant_id
- name
- description
- duration_minutes
- price
- status
- category
- created_at
- updated_at

### reservations
Must support:
- id
- tenant_id
- service_id
- customer_id
- staff_id (nullable)
- reserved_at
- status
- notes
- created_at
- updated_at

### customers
Must support:
- id
- tenant_id
- name
- email
- phone
- notes
- created_at
- updated_at

### staff_members
Must support:
- id
- tenant_id
- user_id
- display_name
- role
- status
- created_at
- updated_at

## Quality Requirements
- schema should be directly saveable as a migration candidate
- keep it minimal and implementation-friendly
- no speculative advanced features

## Blueprint JSON
{{blueprint_json}}
