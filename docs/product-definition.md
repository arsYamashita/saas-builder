# Product Definition

## What This Is

AI SaaS Builder — not an AI App Builder.

The core principle: fix SaaS common features, generate only the domain-specific parts.

## Pipeline

```
User inputs SaaS requirements in natural language
↓
Gemini organizes requirements and creates Blueprint
↓
Claude generates DB/API/permissions/implementation structure
↓
Lovable generates UI scaffold
↓
Claude integrates UI and implementation
↓
Playwright generates minimal E2E tests
↓
Preview for confirmation
```

## Implementation Rules

1. Gemini handles design only. Never implementation.
2. Claude handles implementation only. Don't let it over-plan product strategy.
3. Lovable handles UI only. Never touches auth, billing, or permission core.
4. Playwright handles minimal E2E only.
5. Auth / Tenant / RBAC / Stripe / Affiliate are never regenerated per project.

## Tech Stack

- Frontend: Next.js, Tailwind, shadcn/ui
- Backend: Supabase (PostgreSQL / Auth / Storage), Stripe
- AI Pipeline: Gemini (requirements/blueprint), Claude (schema/API/implementation/integration), Lovable (UI scaffold), Playwright (E2E)

## First Template

`membership_content_affiliate` — 会員サイト / コンテンツ販売 / 月額課金 / 紹介制度

## Success Criteria (First Build)

- owner signup works
- tenant creation works
- member/admin roles are separated
- content CRUD works
- Stripe subscription is connected
- affiliate code can be created
- referral → commission is tracked
- admin dashboard is viewable
- Playwright basic tests pass
