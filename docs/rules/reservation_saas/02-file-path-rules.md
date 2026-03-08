# File Path Rules — reservation_saas

AI must only generate files in the following allowed paths.

## Allowed App Paths
- app/(generated)/dashboard/page.tsx
- app/(generated)/services/page.tsx
- app/(generated)/services/new/page.tsx
- app/(generated)/services/[serviceId]/edit/page.tsx
- app/(generated)/reservations/page.tsx
- app/(generated)/reservations/new/page.tsx
- app/(generated)/reservations/[reservationId]/edit/page.tsx
- app/(generated)/customers/page.tsx
- app/(generated)/customers/[customerId]/page.tsx
- app/(generated)/settings/page.tsx

## Allowed API Paths
- app/api/domain/services/route.ts
- app/api/domain/services/[serviceId]/route.ts
- app/api/domain/reservations/route.ts
- app/api/domain/reservations/[reservationId]/route.ts
- app/api/domain/customers/route.ts
- app/api/domain/customers/[customerId]/route.ts

## Allowed Component Paths
- components/domain/service-form.tsx
- components/domain/reservation-form.tsx
- components/domain/customer-detail.tsx
- components/admin/admin-nav.tsx
- components/admin/logout-button.tsx

## Allowed Type Paths
- types/domain.ts
- types/roles.ts
- types/auth.ts

## Allowed Validation Paths
- lib/validation/service.ts
- lib/validation/reservation.ts
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
