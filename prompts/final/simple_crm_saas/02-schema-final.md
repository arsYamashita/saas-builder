Read and obey these rule files in order:

1. docs/rules/simple_crm_saas/01-template-scope.md
2. docs/rules/simple_crm_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/simple_crm_saas/05-role-rules.md
6. docs/rules/08-db-rules.md
7. docs/rules/09-output-format-rules.md

You are generating PostgreSQL schema output for the fixed template:
simple_crm_saas

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
- contacts
- companies
- deals
- activities

## Hard Rules
- Use PostgreSQL syntax
- Use tenant_id on domain tables
- Include foreign keys where applicable
- Include indexes where helpful
- Include created_at and updated_at
- Do not rename existing tables
- Do not introduce unrelated tables
- If any CHECK constraint references roles, use EXACTLY: 'owner', 'admin', 'sales'
- Do NOT use 'member', 'operator', or 'staff' as role names — this template uses 'sales' for the lowest-privilege role

## If a table already exists conceptually
Prefer additive or compatible schema.
Do not break existing assumptions.

## Required Output Format
Return plain SQL only.
Do not wrap in markdown.
Do not include explanation before or after.

## Table Requirements

### companies
Must support:
- id
- tenant_id
- name
- industry
- website
- phone
- address
- notes
- created_at
- updated_at

### contacts
Must support:
- id
- tenant_id
- first_name
- last_name
- email
- phone
- company_id (nullable, references companies)
- status
- notes
- created_at
- updated_at

### deals
Must support:
- id
- tenant_id
- contact_id (references contacts)
- company_id (nullable, references companies)
- title
- amount
- stage
- expected_close_date
- notes
- created_at
- updated_at

### activities
Must support:
- id
- tenant_id
- title
- description
- activity_type (call, email, meeting, task)
- due_date (nullable)
- completed_at (nullable)
- contact_id (nullable, references contacts)
- deal_id (nullable, references deals)
- assigned_to (nullable, references tenant_users)
- created_at
- updated_at

## Quality Requirements
- schema should be directly saveable as a migration candidate
- keep it minimal and implementation-friendly
- no speculative advanced features

## Blueprint JSON
{{blueprint_json}}
