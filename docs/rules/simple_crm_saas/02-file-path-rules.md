# File Path Rules — simple_crm_saas

AI must only generate files in the following allowed paths.

## Allowed App Paths
- app/(generated)/dashboard/page.tsx
- app/(generated)/contacts/page.tsx
- app/(generated)/contacts/new/page.tsx
- app/(generated)/contacts/[contactId]/edit/page.tsx
- app/(generated)/companies/page.tsx
- app/(generated)/companies/new/page.tsx
- app/(generated)/companies/[companyId]/edit/page.tsx
- app/(generated)/deals/page.tsx
- app/(generated)/deals/new/page.tsx
- app/(generated)/deals/[dealId]/edit/page.tsx
- app/(generated)/activities/page.tsx
- app/(generated)/activities/new/page.tsx
- app/(generated)/activities/[activityId]/edit/page.tsx
- app/(generated)/settings/page.tsx

## Allowed API Paths
- app/api/domain/contacts/route.ts
- app/api/domain/contacts/[contactId]/route.ts
- app/api/domain/companies/route.ts
- app/api/domain/companies/[companyId]/route.ts
- app/api/domain/deals/route.ts
- app/api/domain/deals/[dealId]/route.ts
- app/api/domain/activities/route.ts
- app/api/domain/activities/[activityId]/route.ts

## Allowed Component Paths
- components/domain/contact-form.tsx
- components/domain/company-form.tsx
- components/domain/deal-form.tsx
- components/domain/activity-form.tsx
- components/admin/admin-nav.tsx
- components/admin/logout-button.tsx

## Allowed Type Paths
- types/domain.ts
- types/roles.ts
- types/auth.ts

## Allowed Validation Paths
- lib/validation/contact.ts
- lib/validation/company.ts
- lib/validation/deal.ts
- lib/validation/activity.ts
- lib/validation/auth.ts

## Allowed Core Paths
AI may reference but must not overwrite these unless explicitly requested:
- lib/auth/*
- lib/tenant/*
- lib/rbac/*
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
- lib/billing/*
- lib/affiliate/*
- lib/audit/*
unless explicitly requested.

## Path Safety
- no absolute paths
- no ../ traversal
- no hidden files except explicitly allowed scaffold files
