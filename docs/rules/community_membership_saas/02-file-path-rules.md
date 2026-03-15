# File Path Rules — community_membership_saas

AI must only generate files in the following allowed paths.

## Allowed App Paths
- app/(generated)/dashboard/page.tsx
- app/(generated)/contents/page.tsx
- app/(generated)/contents/new/page.tsx
- app/(generated)/contents/[slug]/edit/page.tsx
- app/(generated)/members/page.tsx
- app/(generated)/plans/page.tsx
- app/(generated)/plans/new/page.tsx
- app/(generated)/tags/page.tsx
- app/(generated)/settings/page.tsx

## Allowed API Paths
- app/api/auth/login/route.ts
- app/api/auth/signup/route.ts
- app/api/auth/accept-invite/route.ts
- app/api/me/route.ts
- app/api/admin/tenants/[tenantId]/contents/route.ts
- app/api/admin/tenants/[tenantId]/members/route.ts
- app/api/admin/tenants/[tenantId]/plans/route.ts
- app/api/admin/tenants/[tenantId]/tags/route.ts
- app/api/admin/tenants/[tenantId]/user-tags/route.ts
- app/api/admin/tenants/[tenantId]/audit-logs/route.ts
- app/api/public/tenants/[tenantSlug]/contents/route.ts
- app/api/public/tenants/[tenantSlug]/contents/[slug]/route.ts
- app/api/public/tenants/[tenantSlug]/plans/route.ts
- app/api/stripe/checkout/subscription/route.ts
- app/api/stripe/checkout/purchase/route.ts
- app/api/stripe/webhook/route.ts

## Allowed Component Paths
- components/domain/content-form.tsx
- components/domain/content-card.tsx
- components/domain/plan-card.tsx
- components/domain/plan-form.tsx
- components/domain/member-table.tsx
- components/domain/tag-badge.tsx
- components/admin/admin-nav.tsx
- components/admin/logout-button.tsx

## Allowed Type Paths
- types/domain.ts
- types/roles.ts
- types/auth.ts

## Allowed Lib Paths
- src/lib/guards.ts
- src/lib/access.ts
- src/lib/audit.ts
- src/lib/stripe.ts

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
unless explicitly requested.

## Path Safety
- no absolute paths
- no ../ traversal
- no hidden files except explicitly allowed scaffold files
