Read and obey these rule files in order:

1. docs/rules/simple_crm_saas/01-template-scope.md
2. docs/rules/simple_crm_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/simple_crm_saas/05-role-rules.md
6. docs/rules/06-api-rules.md
7. docs/rules/07-ui-rules.md
8. docs/rules/08-db-rules.md
9. docs/rules/09-output-format-rules.md

You are generating a blueprint for the fixed template:
simple_crm_saas

You must not generalize the template.
You must not add new business domains.
You must not add extra modules outside the fixed scope.

## Objective
Convert the project input into a strict implementation-ready blueprint JSON for the simple_crm_saas template.

## Existing Fixed Core
The following already exist and must be assumed, not redesigned:
- authentication
- multi-tenant structure
- role based access control
- audit log core
- admin navigation shell

## Allowed Domain Scope
Only these domain objects are allowed:
- contacts
- companies
- deals
- activities

## Required Output
Return JSON only.
Do not wrap in markdown.
Do not add explanations.

Use exactly this JSON shape:

{
  "product_summary": {
    "name": "",
    "problem": "",
    "target": "",
    "category": "simple_crm_saas"
  },
  "entities": [
    {
      "name": "",
      "description": "",
      "main_fields": [
        {
          "name": "",
          "type": "",
          "required": true,
          "description": ""
        }
      ]
    }
  ],
  "screens": [
    {
      "name": "",
      "purpose": "",
      "role_access": []
    }
  ],
  "roles": [
    {
      "name": "",
      "description": ""
    }
  ],
  "permissions": [
    {
      "role": "",
      "allowed_actions": []
    }
  ],
  "billing": {
    "enabled": false,
    "model": "none",
    "products": [],
    "notes": "billing not included in MVP"
  },
  "affiliate": {
    "enabled": false,
    "notes": "affiliate not included in simple_crm_saas"
  },
  "events": [],
  "kpis": [],
  "assumptions": [],
  "mvp_scope": [],
  "future_scope": []
}

## Role Restrictions (CRITICAL)
The roles for this template are EXACTLY:
- owner
- admin
- sales

These three roles must appear in the "roles" array and "permissions" array.
Do NOT output any other role names.
Do NOT use "member" — that belongs to community_membership_saas, not this template.
Do NOT use "operator" — that belongs to internal_admin_ops_saas, not this template.
Do NOT use "staff", "editor", "viewer", "moderator", or any other role name.

If you are uncertain, use "sales" for the lowest-privilege role.
The word "member" appearing anywhere in the output makes it invalid.
The word "staff" appearing anywhere in the output makes it invalid.

## Screen Restrictions
Only allowed screen families:
- dashboard
- contacts list/new/edit
- companies list/new/edit
- deals list/new/edit
- activities list/new/edit
- settings

Do not output any other screen families.

## Entity Restrictions
Do not add:
- contents
- membership_plans
- subscriptions
- affiliates
- referrals
- commissions
- courses
- lessons
- chat
- feed
- services
- reservations
- tasks
- notes
- customers

## Naming Rules
Use these exact entity names when needed:
- contact
- company
- deal
- activity

Use these exact screen names when needed:
- dashboard
- contacts_list
- contacts_new
- contacts_edit
- companies_list
- companies_new
- companies_edit
- deals_list
- deals_new
- deals_edit
- activities_list
- activities_new
- activities_edit
- settings

## Field Rules
For contact, prefer these fields:
- first_name
- last_name
- email
- phone
- company_id (nullable, references companies)
- status
- notes

For company, prefer these fields:
- name
- industry
- website
- phone
- address
- notes

For deal, prefer these fields:
- contact_id
- company_id (nullable)
- title
- amount
- stage
- expected_close_date
- notes

For activity, prefer these fields:
- title
- description
- activity_type (call, email, meeting, task)
- due_date
- completed_at (nullable)
- contact_id (nullable)
- deal_id (nullable)
- assigned_to

Do not invent highly dynamic metadata unless necessary.

## Output Quality Rules
- Keep assumptions explicit
- Keep future_scope conservative
- Keep mvp_scope focused on current template
- Prefer practical implementation over idealized architecture

## Project Input
{{project_input}}
