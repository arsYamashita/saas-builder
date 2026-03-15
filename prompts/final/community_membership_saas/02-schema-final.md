Read and obey these rule files in order:

1. docs/rules/community_membership_saas/01-template-scope.md
2. docs/rules/community_membership_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/community_membership_saas/05-role-rules.md
6. docs/rules/08-db-rules.md
7. docs/rules/09-output-format-rules.md

You are generating PostgreSQL schema output for the fixed template:
community_membership_saas

## Objective
Produce production-oriented SQL additions or schema definitions that fit the existing template without redesigning the core.

## Existing Tables Already Considered Present
Assume these tables already exist in the broader system:
- tenants
- users
- memberships

You must not redesign those tables unless the prompt explicitly says they are missing.
Focus on domain-specific tables and safe additions.

## Allowed Domain Tables
- membership_plans
- subscriptions
- contents
- content_access_rules
- purchases
- tags
- user_tags
- audit_logs

## Hard Rules
- Use PostgreSQL syntax
- Use tenant_id on domain tables
- Include foreign keys where applicable
- Include indexes where helpful
- Include created_at and updated_at
- Do not rename existing tables
- Do not introduce unrelated tables
- If any CHECK constraint references roles, use EXACTLY: 'owner', 'admin', 'editor', 'member'
- Do NOT use 'operator' as a role name — this template uses 'member' for the lowest-privilege role

## If a table already exists conceptually
Prefer additive or compatible schema.
Do not break existing assumptions.

## Required Output Format
Return plain SQL only.
Do not wrap in markdown.
Do not include explanation before or after.

## Table Requirements

### membership_plans
Must support:
- id
- tenant_id
- name
- description (nullable)
- price_amount (integer, cents)
- currency (3-char ISO 4217)
- interval (monthly/yearly)
- stripe_price_id (nullable)
- features (jsonb, nullable)
- is_active (boolean, default true)
- sort_order (integer, default 0)
- created_at
- updated_at

### subscriptions
Must support:
- id
- tenant_id
- user_id (references users)
- plan_id (references membership_plans)
- stripe_subscription_id (nullable)
- status (active/past_due/canceled/incomplete)
- current_period_start
- current_period_end
- created_at
- updated_at

### contents
Must support:
- id
- tenant_id
- title
- slug (unique per tenant)
- body (text)
- content_type (article/video/audio/file)
- visibility (public/members_only/rules_based)
- published_at (nullable)
- created_by (references users)
- created_at
- updated_at

### content_access_rules
Must support:
- id
- content_id (references contents)
- rule_type (plan_based/purchase_based/tag_based)
- target_id (UUID, references plan/tag depending on type)
- created_at

### purchases
Must support:
- id
- tenant_id
- user_id (references users)
- content_id (references contents)
- stripe_payment_intent_id (nullable)
- amount (integer, cents)
- currency
- status (completed/refunded)
- created_at

### tags
Must support:
- id
- tenant_id
- name
- slug (unique per tenant)
- color (nullable, hex)
- created_at

### user_tags
Must support:
- id
- tenant_id
- user_id (references users)
- tag_id (references tags)
- assigned_by (references users)
- created_at

### audit_logs
Must support:
- id
- tenant_id
- actor_id (references users)
- action (text)
- resource_type (text)
- resource_id (UUID, nullable)
- metadata (jsonb, nullable)
- created_at

## Quality Requirements
- schema should be directly saveable as a migration candidate
- keep it minimal and implementation-friendly
- no speculative advanced features
- include RLS ENABLE on all domain tables

## Blueprint JSON
{{blueprint_json}}
