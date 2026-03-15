# community_membership_saas Template Scope

## Purpose
This template is for:
- membership-based community content delivery
- online education platforms
- paid newsletters / fan clubs
- creator monetization sites

## Included Domain Objects
- membership_plans
- subscriptions
- contents
- content_access_rules
- purchases
- tags
- user_tags
- audit_logs

## Included Screens
- /dashboard
- /contents
- /contents/new
- /contents/[slug]/edit
- /members
- /plans
- /plans/new
- /tags
- /settings

## Included Core Modules
- auth
- tenant
- role based access control
- audit logs
- Stripe subscription + one-time purchase

## Explicitly Out of Scope
- reservation / booking
- deal / pipeline management
- customer CRM
- approval workflows
- operation request management
- affiliate tracking
- mobile app
- advanced analytics
- multi-language
- email automation
- file attachment storage (Cloudflare R2 is optional integration)
- drip content / scheduled release
- AND/NOT access rules
- invite token flow
