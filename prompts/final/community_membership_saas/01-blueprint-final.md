Read and obey these rule files in order:

1. docs/rules/community_membership_saas/01-template-scope.md
2. docs/rules/community_membership_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/community_membership_saas/05-role-rules.md
6. docs/rules/06-api-rules.md
7. docs/rules/07-ui-rules.md
8. docs/rules/08-db-rules.md
9. docs/rules/09-output-format-rules.md

You are generating a blueprint for the fixed template:
community_membership_saas

You must not generalize the template.
You must not add new business domains.
You must not add extra modules outside the fixed scope.

## Objective
Convert the project input into a strict implementation-ready blueprint JSON for the community_membership_saas template.

## Existing Fixed Core
The following already exist and must be assumed, not redesigned:
- authentication
- multi-tenant structure
- role based access control
- audit log core
- admin navigation shell

## Allowed Domain Scope
Only these domain objects are allowed:
- membership_plans
- subscriptions
- contents
- content_access_rules
- purchases
- tags
- user_tags
- audit_logs

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
    "category": "community_membership_saas"
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
    "model": "hybrid",
    "products": [],
    "notes": "Stripe subscription + one-time purchase"
  },
  "affiliate": {
    "enabled": false,
    "notes": "affiliate not included in community_membership_saas v1"
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
- editor
- member

These four roles must appear in the "roles" array and "permissions" array.
Do NOT output any other role names.
Do NOT use "operator" — that belongs to internal_admin_ops_saas, not this template.
Do NOT use "staff", "viewer", "moderator", or any other role name.

If you are uncertain, use "member" for the lowest-privilege role.
The word "operator" appearing anywhere in the output makes it invalid.

## Screen Restrictions
Only allowed screen families:
- dashboard
- contents list/new/edit
- members list
- plans list/new
- tags list
- settings

Do not output any other screen families.

## Entity Restrictions
Do not add:
- operation_requests
- approvals
- categories (use tags instead)
- services
- reservations
- customers
- deals
- tasks
- courses
- lessons
- chat
- feed

## Naming Rules
Use these exact entity names when needed:
- membership_plan
- subscription
- content
- content_access_rule
- purchase
- tag
- user_tag

Use these exact screen names when needed:
- dashboard
- contents_list
- contents_new
- contents_edit
- members_list
- plans_list
- plans_new
- tags_list
- settings

## Access Model Rules
- contents have visibility_mode: "public" | "members_only" | "rules_based"
- content_access_rules define rule_type: "plan_based" | "purchase_based" | "tag_based"
- evaluation is OR (any single matching rule grants access)
- enforcement: API layer (guards.ts + access.ts) is primary, RLS is defense-in-depth

## Billing Rules
- subscription: Stripe Checkout → webhook → subscriptions table sync
- one-time purchase: Stripe Checkout → webhook → purchases table insert
- webhook events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted

## Output Quality Rules
- Keep assumptions explicit
- Keep future_scope conservative
- Keep mvp_scope focused on current template
- Prefer practical implementation over idealized architecture

## Project Input
{{project_input}}
