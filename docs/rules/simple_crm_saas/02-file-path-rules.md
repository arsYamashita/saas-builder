# File Path Rules — simple_crm_saas

AI must only generate files in the following allowed paths.

## Allowed App Paths
- app/(generated)/dashboard/page.tsx
- app/(generated)/customers/page.tsx
- app/(generated)/customers/new/page.tsx
- app/(generated)/customers/[customerId]/edit/page.tsx
- app/(generated)/deals/page.tsx
- app/(generated)/deals/new/page.tsx
- app/(generated)/deals/[dealId]/edit/page.tsx
- app/(generated)/tasks/page.tsx
- app/(generated)/tasks/new/page.tsx
- app/(generated)/tasks/[taskId]/edit/page.tsx

## Allowed API Paths
- app/api/domain/customers/route.ts
- app/api/domain/customers/[customerId]/route.ts
- app/api/domain/deals/route.ts
- app/api/domain/deals/[dealId]/route.ts
- app/api/domain/tasks/route.ts
- app/api/domain/tasks/[taskId]/route.ts

## Allowed Component Paths
- components/domain/customer-form.tsx
- components/domain/deal-form.tsx
- components/domain/task-form.tsx
- components/admin/admin-nav.tsx
- components/admin/logout-button.tsx

## Allowed Type Paths
- types/domain.ts
- types/roles.ts
- types/auth.ts

## Allowed Validation Paths
- lib/validation/customer.ts
- lib/validation/deal.ts
- lib/validation/task.ts
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
