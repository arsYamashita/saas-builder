Read and obey these rule files in order:

1. docs/rules/internal_admin_ops_saas/01-template-scope.md
2. docs/rules/internal_admin_ops_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/internal_admin_ops_saas/05-role-rules.md
6. docs/rules/06-api-rules.md
7. docs/rules/07-ui-rules.md
8. docs/rules/08-db-rules.md
9. docs/rules/09-output-format-rules.md

You are generating a blueprint for the fixed template:
internal_admin_ops_saas

You must not generalize the template.
You must not add new business domains.
You must not add extra modules outside the fixed scope.

## Objective
Convert the project input into a strict implementation-ready blueprint JSON for the internal_admin_ops_saas template.

## Existing Fixed Core
The following already exist and must be assumed, not redesigned:
- authentication
- multi-tenant structure
- role based access control
- audit log core
- admin navigation shell

## Allowed Domain Scope
Only these domain objects are allowed:
- operation_requests
- approvals
- categories

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
    "category": "internal_admin_ops_saas"
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
    "notes": "affiliate not included in internal_admin_ops_saas"
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
- operator

These three roles must appear in the "roles" array and "permissions" array.
Do NOT output any other role names.
Do NOT use "member" — that belongs to community_membership_saas, not this template.
Do NOT use "staff", "editor", "viewer", "moderator", or any other role name.

If you are uncertain, use "operator" for the lowest-privilege role.
The word "member" appearing anywhere in the output makes it invalid.

## Screen Restrictions
Only allowed screen families:
- dashboard
- requests list/new/edit
- approvals list
- categories list/new

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
- customers
- deals
- tasks

## Naming Rules
Use these exact entity names when needed:
- operation_request
- approval
- category

Use these exact screen names when needed:
- dashboard
- requests_list
- requests_new
- requests_edit
- approvals_list
- categories_list
- categories_new

## Field Rules
For operation_request, prefer these fields:
- title
- description
- category_id
- priority (low/medium/high/urgent)
- status (draft/pending/approved/rejected/completed)
- requested_by
- assigned_to (nullable)
- due_date (nullable)
- notes

For approval, prefer these fields:
- request_id
- action (approved/rejected)
- decided_by
- comment (nullable)
- decided_at

For category, prefer these fields:
- name
- slug
- color (nullable)
- sort_order

Do not invent highly dynamic metadata unless necessary.

## Output Quality Rules
- Keep assumptions explicit
- Keep future_scope conservative
- Keep mvp_scope focused on current template
- Prefer practical implementation over idealized architecture

## Project Input
{{project_input}}
