# File Path Rules — internal_admin_ops_saas

AI must only generate files in the following allowed paths.

## Allowed App Paths
- app/(generated)/dashboard/page.tsx
- app/(generated)/requests/page.tsx
- app/(generated)/requests/new/page.tsx
- app/(generated)/requests/[requestId]/edit/page.tsx
- app/(generated)/approvals/page.tsx
- app/(generated)/categories/page.tsx
- app/(generated)/categories/new/page.tsx

## Allowed API Paths
- app/api/domain/requests/route.ts
- app/api/domain/requests/[requestId]/route.ts
- app/api/domain/requests/[requestId]/approve/route.ts
- app/api/domain/requests/[requestId]/reject/route.ts
- app/api/domain/categories/route.ts
- app/api/domain/categories/[categoryId]/route.ts

## Allowed Component Paths
- components/domain/request-form.tsx
- components/domain/request-status-badge.tsx
- components/domain/approval-action.tsx
- components/domain/category-form.tsx
- components/admin/admin-nav.tsx
- components/admin/logout-button.tsx

## Allowed Type Paths
- types/domain.ts
- types/roles.ts
- types/auth.ts

## Allowed Validation Paths
- lib/validation/request.ts
- lib/validation/category.ts
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
