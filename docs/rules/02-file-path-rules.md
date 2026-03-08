# File Path Rules

AI must only generate files in the following allowed paths.

## Allowed App Paths
- app/(generated)/dashboard/page.tsx
- app/(generated)/content/page.tsx
- app/(generated)/content/new/page.tsx
- app/(generated)/content/[contentId]/edit/page.tsx
- app/(generated)/plans/page.tsx
- app/(generated)/plans/new/page.tsx
- app/(generated)/plans/[planId]/edit/page.tsx
- app/(generated)/billing/page.tsx
- app/(generated)/affiliate/page.tsx

## Allowed API Paths
- app/api/domain/content/route.ts
- app/api/domain/content/[contentId]/route.ts
- app/api/domain/membership-plans/route.ts
- app/api/domain/membership-plans/[planId]/route.ts
- app/api/billing/checkout/route.ts
- app/api/billing/portal/route.ts
- app/api/billing/subscriptions/route.ts
- app/api/stripe/webhook/route.ts

## Allowed Component Paths
- components/domain/content-form.tsx
- components/domain/membership-plan-form.tsx
- components/admin/admin-nav.tsx
- components/admin/logout-button.tsx

## Allowed Type Paths
- types/domain.ts
- types/billing.ts
- types/affiliate.ts
- types/roles.ts
- types/auth.ts

## Allowed Validation Paths
- lib/validation/content.ts
- lib/validation/membership-plan.ts
- lib/validation/auth.ts

## Allowed Core Paths
AI may reference but must not overwrite these unless explicitly requested:
- lib/auth/*
- lib/tenant/*
- lib/rbac/*
- lib/billing/*
- lib/affiliate/*
- lib/audit/*
- lib/db/*
- middleware.ts

## Forbidden Paths
AI must never generate:
- .env*
- package.json
- tsconfig.json
- next.config.ts
- middleware.ts
- lib/auth/*
- lib/tenant/*
- lib/rbac/*
- lib/billing/stripe.ts
- lib/audit/*
unless explicitly requested.

## Path Safety
- no absolute paths
- no ../ traversal
- no hidden files except explicitly allowed scaffold files
