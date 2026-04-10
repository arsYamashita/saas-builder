# File Path Rules — community_membership_saas (v2)

AI must only generate files in the following allowed paths.

## Allowed App Paths

### v1
- app/(generated)/dashboard/page.tsx
- app/(generated)/contents/page.tsx
- app/(generated)/contents/new/page.tsx
- app/(generated)/contents/[slug]/edit/page.tsx
- app/(generated)/members/page.tsx
- app/(generated)/plans/page.tsx
- app/(generated)/plans/new/page.tsx
- app/(generated)/tags/page.tsx
- app/(generated)/settings/page.tsx

### v2 (forum)
- app/(generated)/community/page.tsx
- app/(generated)/community/[postId]/page.tsx
- app/(generated)/community/new/page.tsx
- app/(generated)/settings/categories/page.tsx

### v2 (classroom)
- app/(generated)/courses/page.tsx
- app/(generated)/courses/[courseSlug]/page.tsx
- app/(generated)/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx
- app/(generated)/admin/courses/new/page.tsx
- app/(generated)/admin/courses/[courseId]/edit/page.tsx

### v2 (gamification)
- app/(generated)/leaderboard/page.tsx
- app/(generated)/settings/levels/page.tsx

### v2 (member management)
- app/(generated)/members/[userId]/page.tsx
- app/(generated)/settings/invites/page.tsx
- app/(generated)/settings/join-mode/page.tsx
- app/(generated)/settings/questions/page.tsx
- app/(generated)/settings/profile/page.tsx
- app/(generated)/admin/applications/page.tsx

## Allowed API Paths

### v1
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

### v2 (forum)
- app/api/admin/tenants/[tenantId]/categories/route.ts
- app/api/admin/tenants/[tenantId]/posts/route.ts
- app/api/admin/tenants/[tenantId]/posts/[postId]/route.ts
- app/api/admin/tenants/[tenantId]/posts/[postId]/comments/route.ts
- app/api/admin/tenants/[tenantId]/comments/[commentId]/route.ts
- app/api/admin/tenants/[tenantId]/reactions/route.ts
- app/api/public/tenants/[tenantSlug]/posts/route.ts
- app/api/public/tenants/[tenantSlug]/posts/[postId]/route.ts

### v2 (classroom)
- app/api/admin/tenants/[tenantId]/courses/route.ts
- app/api/admin/tenants/[tenantId]/courses/[courseId]/route.ts
- app/api/admin/tenants/[tenantId]/courses/[courseId]/modules/route.ts
- app/api/admin/tenants/[tenantId]/modules/[moduleId]/route.ts
- app/api/admin/tenants/[tenantId]/modules/[moduleId]/lessons/route.ts
- app/api/admin/tenants/[tenantId]/lessons/[lessonId]/route.ts
- app/api/me/progress/[lessonId]/route.ts
- app/api/me/courses/[courseId]/progress/route.ts
- app/api/public/tenants/[tenantSlug]/courses/route.ts
- app/api/public/tenants/[tenantSlug]/courses/[courseSlug]/route.ts

### v2 (gamification)
- app/api/admin/tenants/[tenantId]/leaderboard/route.ts
- app/api/admin/tenants/[tenantId]/level-configs/route.ts
- app/api/me/points/route.ts
- app/api/public/tenants/[tenantSlug]/leaderboard/route.ts

### v2 (member management)
- app/api/admin/tenants/[tenantId]/invites/route.ts
- app/api/admin/tenants/[tenantId]/invites/[inviteId]/route.ts
- app/api/auth/accept-invite/[token]/route.ts
- app/api/admin/tenants/[tenantId]/membership-questions/route.ts
- app/api/admin/tenants/[tenantId]/applications/route.ts
- app/api/admin/tenants/[tenantId]/applications/[appId]/route.ts
- app/api/public/tenants/[tenantSlug]/apply/route.ts
- app/api/admin/tenants/[tenantId]/members/[memberId]/route.ts
- app/api/admin/tenants/[tenantId]/members/import/route.ts

## Allowed Component Paths

### v1
- components/domain/content-form.tsx
- components/domain/content-card.tsx
- components/domain/plan-card.tsx
- components/domain/plan-form.tsx
- components/domain/member-table.tsx
- components/domain/tag-badge.tsx
- components/admin/admin-nav.tsx
- components/admin/logout-button.tsx

### v2
- components/domain/post-card.tsx
- components/domain/post-form.tsx
- components/domain/comment-thread.tsx
- components/domain/reaction-button.tsx
- components/domain/category-sidebar.tsx
- components/domain/rich-text-editor.tsx
- components/domain/course-card.tsx
- components/domain/course-form.tsx
- components/domain/lesson-player.tsx
- components/domain/progress-bar.tsx
- components/domain/leaderboard-table.tsx
- components/domain/level-badge.tsx
- components/domain/member-profile-card.tsx
- components/domain/invite-form.tsx
- components/domain/application-form.tsx
- components/domain/application-review.tsx

## Allowed Type Paths
- types/domain.ts
- types/roles.ts
- types/auth.ts

## Allowed Lib Paths
- src/lib/guards.ts
- src/lib/access.ts
- src/lib/audit.ts
- src/lib/stripe.ts
- src/lib/gamification.ts

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
