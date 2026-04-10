# CLAN / Aria Integration Design

## Current saas-builder Capabilities

Based on code review of the actual codebase:

### Authentication and Authorization
- **Supabase Auth** with cookie-based session management (`lib/auth/session.ts`)
- **Middleware-level auth guard** (`middleware.ts`) — checks `sb-*-auth-token` cookie, redirects unauthenticated users for pages, returns 401 for API routes
- **CSRF protection** on state-changing API requests (Origin header validation)
- **Multi-tenant RBAC** — five fixed roles (`owner`, `admin`, `affiliate_manager`, `staff`, `member`) with numeric priority-based role checking (`lib/rbac/roles.ts`)
- **Tenant-scoped access control** — `requireCurrentUser()`, `requireTenantUser()`, `requireProjectAccess()`, `requireRunAccess()` in `lib/auth/current-user.ts`
- **Row Level Security** on all 21 tables via `user_belongs_to_tenant()` SQL function (`0012_enable_rls.sql`)

### Billing (Stripe)
- **Stripe SDK v16** with lazy-initialized singleton client (`lib/billing/stripe.ts`)
- **Webhook handler** (`app/api/stripe/webhook/route.ts`) processing `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- **Subscription upsert** with `stripe_subscription_id` conflict resolution
- **Affiliate commission calculation** triggered on first subscription activation (fixed or percentage)
- **Billing access check** (`lib/billing/access.ts`) — queries latest subscription status
- **Checkout and portal session** API routes (`app/api/billing/checkout/`, `app/api/billing/portal/`)

### Data Model (Supabase/PostgreSQL, 12 migrations)
- **Core**: `tenants`, `users`, `tenant_users` (multi-tenant membership)
- **Builder**: `projects`, `blueprints`, `generated_modules`, `generated_files`, `implementation_runs`, `generation_runs`, `quality_runs`, `baseline_promotions`
- **Billing**: `billing_products`, `billing_prices`, `subscriptions`
- **Affiliate**: `affiliates`, `referrals`, `commissions`
- **Content**: `contents`, `membership_plans`
- **Operations**: `audit_logs`, `notifications`

### Environment Validation
- **Zod schema** (`lib/env.ts`) validating all server-side env vars at startup
- Covers Supabase, Stripe, optional Gemini/Claude API keys, optional Upstash Redis

### Rate Limiting
- **Upstash Redis** in production with in-memory fallback for dev (`lib/rate-limit.ts`)
- Sliding window limiters for login (5/60s) and signup (3/60s)

### AI Code Generation Pipeline
- Gemini + Claude providers for blueprint generation and code implementation
- Template-based generation (`membership_content_affiliate` as first template)
- Quality scoring and regression testing with Playwright E2E

### Other
- Audit logging (`lib/audit/write-audit-log.ts`)
- Zod validation schemas per domain (`lib/validation/`)
- PDF document analysis (`pdf-parse`)

## aria-for-salon-app Architecture

### Monorepo Structure (Turborepo)
```
aria-for-salon/
  apps/
    admin/      — Next.js admin dashboard
    mobile/     — Flutter mobile app
    web/        — Next.js public-facing site
  packages/
    shared/     — Zod schemas, types, Firestore paths
    admin-ui/   — Shared admin UI components
  functions/    — 56 Cloud Functions (Node 20)
```

### Authentication
- **Firebase Auth** with email/password sign-in
- Client-side `AuthContext` (`apps/admin/src/lib/auth-context.tsx`) using `onAuthStateChanged`
- Multi-tenant support: users can belong to multiple tenants, with a tenant switcher in the sidebar
- Tenant resolution via Firestore `collectionGroup` query on membership records

### Billing (Stripe)
- **Stripe SDK v17** in Cloud Functions
- **Stripe Connect** architecture — each tenant has their own connected Stripe account (`stripeAccountId`)
- Webhook handler (`functions/src/stripe-webhook.ts`) with tenant resolution via metadata or reverse lookup
- Handles: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid/payment_failed`, `charge.refunded`
- Separate functions for checkout session creation, portal session, plan management, course purchases, refunds
- Platform billing (`platform-billing.ts`) and usage metering (`usage-metering.ts`)

### Content and Features
- Courses with lessons, live events (Mux video, Zoom/YouTube embed), announcements
- Member management with tags, CSV import, DM messaging
- Email system (SendGrid): templates, scheduled broadcasts, bulk email, reminders
- Referral system, analytics, content analytics, retention tracking
- App configuration (colors, logo, tab bar, feature flags, home layout)
- Audio series, landing pages, legal pages

### Shared Package (`packages/shared`)
- Zod schemas for all domain entities: courses, lessons, live events, announcements, members, plans, memberships, reports, DM, app config, feature flags
- Firestore path constants (`paths.ts`)
- TypeScript type definitions (`types.ts`)

## Shared Module Candidates

### 1. Authentication

| Aspect | saas-builder | aria-for-salon-app |
|--------|-------------|-------------------|
| Provider | Supabase Auth | Firebase Auth |
| Session | Server-side cookie (`sb-*-auth-token`) | Client-side `onAuthStateChanged` |
| Multi-tenant | `tenant_users` table with RLS | Firestore `members` subcollection |
| Roles | 5 fixed roles with priority numbers | 3 roles (`owner`, `staff`, `member`) |
| RBAC | `requireTenantRole()` guard | Manual role checks in components |

**Integration approach**: Define an abstract `AuthProvider` interface with `getCurrentUser()`, `requireAuth()`, `getUserTenants()`, and `hasRole()` methods. Implement `SupabaseAuthAdapter` and `FirebaseAuthAdapter`. This is the highest-risk extraction because auth touches every layer of both apps — start with a read-only interface, not a full abstraction.

### 2. Payment (Stripe)

| Aspect | saas-builder | aria-for-salon-app |
|--------|-------------|-------------------|
| SDK version | v16 | v17 |
| Architecture | Direct (platform owns Stripe account) | Stripe Connect (per-tenant accounts) |
| Webhook events | 3 events | 7 events |
| Idempotency | Upsert on `stripe_subscription_id` | Tenant resolution + metadata check |
| Affiliate/Referral | Built into webhook handler | Separate `referral.ts` function |

**Common patterns that can be extracted**:
- Stripe client singleton with lazy initialization (both projects do this identically)
- Webhook signature verification and event routing
- Subscription status mapping and upsert logic
- Checkout session creation with metadata propagation

**What differs and should stay separate**:
- Stripe Connect tenant resolution (aria-specific)
- Affiliate commission calculation (saas-builder-specific, but could become a plugin)

### 3. Environment Validation

saas-builder's `lib/env.ts` is a clean, 29-line Zod-based env validator. It can be extracted as-is into a package that accepts a schema and returns validated config.

```typescript
// Proposed @ars/env-validator API
import { createEnvValidator } from '@ars/env-validator';
import { z } from 'zod';

export const env = createEnvValidator(z.object({
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  // ...project-specific vars
}));
```

aria-for-salon-app currently has no centralized env validation — Cloud Functions rely on `process.env` directly. This package would immediately benefit both projects.

### 4. Zod Validation Schemas

Both projects use Zod extensively:
- saas-builder: `lib/validation/` with schemas for auth, blueprints, content, membership plans, projects, documents, roles
- aria-for-salon-app: `packages/shared/src/schemas.ts` with 20+ schemas for courses, lessons, events, members, plans, app config

**Common schema patterns**: member/user schemas, plan schemas, content schemas, role enums. However, the domain models are different enough that sharing individual schemas is not practical. What can be shared is a schema builder utility and validation middleware.

### 5. Admin Dashboard Components

Both admin dashboards (Next.js) share common UI patterns:
- Data tables with pagination (members, content, billing)
- Form components with Zod validation (react-hook-form + @hookform/resolvers)
- Navigation sidebar with tenant context
- Dashboard layout with route groups (`(admin)`, `(builder)`, `(generated)`)
- Billing/subscription management pages
- Audit log viewer
- Member management with role assignment

aria-for-salon-app already has a `packages/admin-ui` package, but it currently contains only an `index.ts`. This is the natural home for extracted components.

## Architecture

```
                    @ars/env-validator
                    @ars/stripe-utils
                    @ars/auth (future)
                    @ars/admin-ui (future)
                           |
              +------------+------------+
              |                         |
    saas-builder                aria-for-salon-app
    (Next.js + Supabase)       (Turborepo monorepo)
              |                         |
    +-------------------+     +-------------------+
    | Supabase Auth     |     | Firebase Auth     |
    | PostgreSQL + RLS  |     | Firestore         |
    | Direct Stripe     |     | Stripe Connect    |
    | AI Generation     |     | Mux Video         |
    | Playwright E2E    |     | SendGrid Email    |
    +-------------------+     +-------------------+

    Package registry: GitHub Packages (@ars scope)
    or local npm workspaces during development
```

### Dependency Direction

Shared packages must have zero dependency on either project's infrastructure:
- No imports from `@supabase/*` or `firebase-admin` in shared packages
- Auth adapters live in each project, not in the shared package
- Stripe utils accept a `Stripe` instance, never create one

### Package Boundaries

```
@ars/env-validator
  Input:  Zod schema
  Output: Validated config object
  Deps:   zod (peer)

@ars/stripe-utils
  Input:  Stripe instance + event/request
  Output: Verified event, subscription data
  Deps:   stripe (peer)

@ars/auth (Phase 2)
  Input:  None (interface definitions only)
  Output: AuthProvider interface, role types
  Deps:   None (pure TypeScript interfaces)

@ars/admin-ui (Phase 3)
  Input:  Props
  Output: React components
  Deps:   react, tailwindcss (peer)
```

## Integration Roadmap

### Phase 1: Extract shared packages (2 weeks)

**@ars/env-validator** (3 days)
- Extract `lib/env.ts` pattern into a generic `createEnvValidator(schema)` function
- Add features: `.partial()` mode for optional vars, grouped validation errors, CI-friendly output
- Integrate into saas-builder first, then add to aria Cloud Functions
- Test: unit tests for schema validation, missing var errors, type inference

**@ars/stripe-utils** (5 days)
- Extract: webhook signature verification, event routing, subscription upsert mapping
- API design: `verifyWebhook(req, secret)`, `routeEvent(event, handlers)`, `mapSubscription(stripeSubscription)`
- Handle both direct Stripe and Stripe Connect patterns (connected account ID passthrough)
- Test: unit tests with Stripe test fixtures

**Infrastructure** (2 days)
- Set up GitHub Packages publishing under `@ars` scope
- Add CI workflow for shared packages (lint, test, publish on tag)

### Phase 2: Auth abstraction (3 weeks)

**@ars/auth** (2 weeks)
- Define `AuthProvider` interface: `getCurrentUser()`, `requireAuth()`, `getUserTenants()`, `checkRole()`
- Define `AuthUser` type: `{ id, email, displayName, tenantId?, role? }`
- Implement `SupabaseAuthAdapter` in saas-builder
- Implement `FirebaseAuthAdapter` in aria-for-salon-app
- Middleware helpers for Next.js route protection

**Migration** (1 week)
- Replace direct Supabase/Firebase auth calls with adapter in both projects
- Verify all existing auth tests pass
- Keep old code paths behind feature flag until stable

### Phase 3: Admin template components (4 weeks)

**@ars/admin-ui** (3 weeks)
- Extract from aria's existing `packages/admin-ui` skeleton
- Components: `DataTable`, `FormField`, `SidebarNav`, `PageHeader`, `StatCard`, `EmptyState`
- Based on shadcn/ui primitives (both projects already use Radix + Tailwind)
- Storybook for component documentation

**Integration** (1 week)
- Replace duplicated components in both admin dashboards
- Ensure Tailwind theme tokens are configurable per project

## Decision Records

### ADR-001: GitHub Packages over npm for shared packages

**Status**: Proposed

**Context**: Shared packages need a registry. Options are npm (public), GitHub Packages (private), or local workspaces only.

**Decision**: Use GitHub Packages with `@ars` scope. Both projects are in the `arsYamashita` GitHub account.

**Consequences**: Private by default, free for private repos, integrated with existing CI. Requires `.npmrc` configuration in each consuming project. Cannot easily share with external contributors.

### ADR-002: Peer dependencies for infrastructure libraries

**Status**: Proposed

**Context**: Shared packages could bundle `stripe`, `zod`, etc., or declare them as peer dependencies.

**Decision**: All infrastructure libraries (`stripe`, `zod`, `react`) are peer dependencies. Shared packages never install their own copy.

**Consequences**: Prevents version conflicts and bundle bloat. Consuming projects must install compatible versions. TypeScript `peerDependenciesMeta` needed for optional deps.

### ADR-003: Interface-only auth package before adapter implementations

**Status**: Proposed

**Context**: Auth abstraction is high-risk because it touches every authenticated route. We could build the full abstraction up front, or start with just interfaces.

**Decision**: Phase 2 starts with a types-only `@ars/auth` package (interfaces, no runtime code). Adapters are implemented in each project's own codebase first. Only after both adapters stabilize do we consider moving them into the shared package.

**Consequences**: Lower risk — if the interface is wrong, only type definitions change. Slower initial progress — no shared runtime code for auth in Phase 2. Both projects can adopt at their own pace.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Over-abstraction: shared packages become complex to satisfy both projects | High | High | Start with the smallest useful extraction (env-validator). If a shared API requires more than 2 config options to handle both projects, keep it separate. |
| Version drift: projects pin different versions of shared packages | Medium | Medium | Dependabot or Renovate on both repos. Shared packages follow semver strictly. |
| Auth abstraction leaks infrastructure details | Medium | High | Interface-only package first (ADR-003). No Supabase or Firebase types in the shared auth interface. |
| Stripe SDK version mismatch (v16 vs v17) | Low | Low | @ars/stripe-utils accepts a `Stripe` instance as parameter. Each project brings its own SDK version. |
| Maintenance overhead exceeds benefit for a solo developer | Medium | Medium | Phase 1 only. Evaluate whether Phase 2 and 3 are worth it after Phase 1 ships. |
