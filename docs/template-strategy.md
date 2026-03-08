# Template Strategy

## Concept

Templates define the domain-specific part of a SaaS.
Common core (auth, tenant, RBAC, billing, affiliate, audit, notifications) is shared across all templates.

## First Template: membership_content_affiliate

Description: 会員サイト / コンテンツ販売 / 月額課金 / 紹介制度 を持つSaaSテンプレ

### Domain Tables
- contents
- membership_plans

### Domain Screens
- /content
- /content/new
- /content/[id]
- /plans
- /plans/new
- /members
- /members/[id]

## Future Templates (planned)
- online_school (オンラインスクール)
- saas_analytics (SaaS分析ダッシュボード)
- booking_system (予約管理)
- marketplace (マーケットプレイス)
