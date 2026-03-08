Read and obey these rule files in order:

1. docs/rules/reservation_saas/01-template-scope.md
2. docs/rules/reservation_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/reservation_saas/05-role-rules.md
6. docs/rules/06-api-rules.md
7. docs/rules/07-ui-rules.md
8. docs/rules/08-db-rules.md
9. docs/rules/09-output-format-rules.md

You are generating a blueprint for the fixed template:
reservation_saas

You must not generalize the template.
You must not add new business domains.
You must not add extra modules outside the fixed scope.

## Objective
Convert the project input into a strict implementation-ready blueprint JSON for the reservation_saas template.

## Existing Fixed Core
The following already exist and must be assumed, not redesigned:
- authentication
- multi-tenant structure
- role based access control
- audit log core
- admin navigation shell

## Allowed Domain Scope
Only these domain objects are allowed:
- services
- reservations
- customers
- staff_members

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
    "category": "reservation_saas"
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
    "notes": "affiliate not included in reservation_saas"
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
- services list/new/edit
- reservations list/new/edit
- customers list/detail
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

## Naming Rules
Use these exact entity names when needed:
- service
- reservation
- customer
- staff_member

Use these exact screen names when needed:
- dashboard
- services_list
- services_new
- services_edit
- reservations_list
- reservations_new
- reservations_edit
- customers_list
- customers_detail
- settings

## Field Rules
For service, prefer these fields:
- name
- description
- duration_minutes
- price
- status
- category

For reservation, prefer these fields:
- service_id
- customer_id
- staff_id
- reserved_at
- status
- notes

For customer, prefer these fields:
- name
- email
- phone
- notes

Do not invent highly dynamic metadata unless necessary.

## Output Quality Rules
- Keep assumptions explicit
- Keep future_scope conservative
- Keep mvp_scope focused on current template
- Prefer practical implementation over idealized architecture

## Project Input
{{project_input}}
