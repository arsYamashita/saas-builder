Read and obey these rule files in order:

1. docs/rules/01-template-scope.md
2. docs/rules/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/05-role-rules.md
6. docs/rules/06-api-rules.md
7. docs/rules/07-ui-rules.md
8. docs/rules/08-db-rules.md
9. docs/rules/09-output-format-rules.md
10. docs/rules/10-claude-template-contract.md

You are generating a blueprint for the fixed template:
membership_content_affiliate

You must not generalize the template.
You must not add new business domains.
You must not add extra modules outside the fixed scope.

## Objective
Convert the project input into a strict implementation-ready blueprint JSON for the membership_content_affiliate template.

## Existing Fixed Core
The following already exist and must be assumed, not redesigned:
- authentication
- multi-tenant structure
- role based access control
- stripe billing core
- affiliate core
- audit log core
- admin navigation shell

## Allowed Domain Scope
Only these domain objects are allowed:
- contents
- membership_plans
- subscriptions
- affiliates
- referrals
- commissions

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
    "category": "membership_content_affiliate"
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
    "enabled": true,
    "model": "subscription",
    "products": [],
    "notes": ""
  },
  "affiliate": {
    "enabled": true,
    "commission_type": "percentage",
    "commission_value": 20,
    "notes": ""
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
- member

Do not output any other roles.

## Screen Restrictions
Only allowed screen families:
- dashboard
- contents list/new/edit
- plans list/new/edit
- billing
- affiliate

Do not output any other screen families.

## Entity Restrictions
Do not add:
- courses
- lessons
- bookings
- chat
- feed
- media_pipeline
- workflow
- automations

## Naming Rules
Use these exact entity names when needed:
- content
- membership_plan
- subscription
- affiliate
- referral
- commission

Use these exact screen names when needed:
- dashboard
- contents_list
- contents_new
- contents_edit
- plans_list
- plans_new
- plans_edit
- billing
- affiliate

## Field Rules
For content, prefer these fields:
- title
- body
- content_type
- visibility
- published
- published_at

For membership_plan, prefer these fields:
- name
- description
- price_id
- status

Do not invent highly dynamic metadata unless necessary.

## Output Quality Rules
- Keep assumptions explicit
- Keep future_scope conservative
- Keep mvp_scope focused on current template
- Prefer practical implementation over idealized architecture

## Project Input
{{project_input}}
