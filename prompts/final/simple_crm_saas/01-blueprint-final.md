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
- customers
- deals
- tasks
- notes (optional)

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

## Role Restrictions
Only allowed roles:
- owner
- admin
- staff

Do not output any other roles.

## Screen Restrictions
Only allowed screen families:
- dashboard
- customers list/new/edit
- deals list/new/edit
- tasks list/new/edit

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

## Naming Rules
Use these exact entity names when needed:
- customer
- deal
- task
- note

Use these exact screen names when needed:
- dashboard
- customers_list
- customers_new
- customers_edit
- deals_list
- deals_new
- deals_edit
- tasks_list
- tasks_new
- tasks_edit

## Field Rules
For customer, prefer these fields:
- name
- email
- phone
- company
- status
- notes

For deal, prefer these fields:
- customer_id
- title
- amount
- stage
- expected_close_date
- notes

For task, prefer these fields:
- title
- description
- assigned_to
- due_date
- status
- deal_id (nullable)
- customer_id (nullable)

Do not invent highly dynamic metadata unless necessary.

## Output Quality Rules
- Keep assumptions explicit
- Keep future_scope conservative
- Keep mvp_scope focused on current template
- Prefer practical implementation over idealized architecture

## Project Input
{{project_input}}
