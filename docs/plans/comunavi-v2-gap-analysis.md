# Comunavi v2 Gap Analysis: Skool Feature Parity

**Date**: 2026-03-29
**Status**: Proposed
**Author**: Software Architect (saas-platform team lead)

---

## 1. Feature Gap Matrix

| # | Skool Feature | Sub-feature | Comunavi Status | Notes |
|---|---------------|-------------|:---:|-------|
| **1** | **Community Forum** | | | |
| 1.1 | Category-based posts | ❌ Missing | `contents` is flat (no categories, no threaded discussion) |
| 1.2 | Rich media (links, YouTube, polls) | ❌ Missing | `body` is plain TEXT, no structured rich content |
| 1.3 | Comments on posts | ❌ Missing | No comments table |
| 1.4 | Likes / reactions | ❌ Missing | No reactions system |
| 1.5 | @mentions | ❌ Missing | No mention parsing or notification |
| 1.6 | Emoji / GIFs in posts | ❌ Missing | Frontend concern, but no media attachment model |
| **2** | **Classroom / Courses** | | | |
| 2.1 | Multi-module course structure | ❌ Missing | `contents` has no parent/child or ordering hierarchy |
| 2.2 | Video lessons with transcripts | 🔶 Partial | `content_type: video` exists but no transcript field, no video hosting |
| 2.3 | Lesson-level discussion threads | ❌ Missing | No comments/threads on content |
| 2.4 | Completion tracking (progress) | ❌ Missing | No user progress table |
| 2.5 | Drip / level-unlock | ❌ Missing | Listed in v2 backlog (v2-006), not implemented |
| 2.6 | Course certificates | ❌ Missing | |
| **3** | **Calendar / Events** | | | |
| 3.1 | Event scheduling | ❌ Missing | No events table |
| 3.2 | Timezone auto-conversion | ❌ Missing | |
| 3.3 | Video calls (Skool Call) | ❌ Missing | Would require external integration |
| 3.4 | Email reminders (24h) | ❌ Missing | No email automation, Resend is optional |
| 3.5 | RSVP tracking | ❌ Missing | |
| **4** | **Chat / DM** | | | |
| 4.1 | Direct messaging | ❌ Missing | No messaging tables |
| 4.2 | AutoDM (welcome messages) | ❌ Missing | |
| 4.3 | Admin enable/disable chat | ❌ Missing | |
| **5** | **Gamification** | | | |
| 5.1 | Points system (like = point) | ❌ Missing | No points/likes |
| 5.2 | Levels (9 tiers, custom names) | ❌ Missing | |
| 5.3 | Leaderboard | ❌ Missing | |
| 5.4 | Course unlock at level | ❌ Missing | Related to access rules but no level concept |
| **6** | **Affiliate Program** | | | |
| 6.1 | Referral links | ❌ Missing | Listed in v2 backlog (v2-010) |
| 6.2 | Commission rate (10-50%) | ❌ Missing | |
| 6.3 | Cookie attribution (14-day) | ❌ Missing | |
| 6.4 | Recurring commissions | ❌ Missing | |
| 6.5 | Payout management | ❌ Missing | |
| **7** | **Member Management** | | | |
| 7.1 | Invite link | 🔶 Partial | `accept-invite` route exists but no token/expiry (v2-001) |
| 7.2 | CSV import | ❌ Missing | |
| 7.3 | Zapier / webhook integration | ❌ Missing | |
| 7.4 | Email invite | ❌ Missing | Resend optional, no invite email flow |
| 7.5 | Membership questions (application) | ❌ Missing | No application/screening model |
| 7.6 | Online status | ❌ Missing | Requires presence system |
| 7.7 | Member profiles | 🔶 Partial | `users` has `display_name`, `avatar_url` but no bio, social links, etc. |
| 7.8 | Membership UPDATE/DELETE | ❌ Missing | v2-002 backlog |
| **8** | **Analytics** | | | |
| 8.1 | Total / active members | 🔶 Partial | Queryable from `memberships` but no dedicated analytics |
| 8.2 | Daily activity metrics | ❌ Missing | `audit_logs` captures events but no aggregation |
| 8.3 | Engagement metrics | ❌ Missing | No post views, likes, or interaction tracking |
| 8.4 | Analytics dashboard | ❌ Missing | No analytics UI |
| **9** | **Integrations** | | | |
| 9.1 | Zapier | ❌ Missing | No outgoing webhooks |
| 9.2 | Webhooks (outgoing) | ❌ Missing | |
| 9.3 | Meta Pixel | ❌ Missing | Frontend tracking concern |
| **10** | **Auth / Core** | | | |
| 10.1 | Signup / Login | ✅ Has | Supabase Auth |
| 10.2 | Multi-tenant | ✅ Has | 1 user = 1 tenant (v1 constraint) |
| 10.3 | RBAC | ✅ Has | owner/admin/editor/member |
| 10.4 | Content CRUD | ✅ Has | Full CRUD with visibility modes |
| 10.5 | Access rules | ✅ Has | plan/purchase/tag (OR eval) |
| 10.6 | Subscription billing | ✅ Has | Stripe integration |
| 10.7 | One-time purchases | ✅ Has | Stripe integration |
| 10.8 | Tags system | ✅ Has | Tags + user-tag assignments |
| 10.9 | Audit logs | ✅ Has | Immutable, service_role only |
| 10.10 | RLS policies | ✅ Has | Defense-in-depth |

### Summary Counts

| Status | Count |
|--------|-------|
| ✅ Has | 10 |
| 🔶 Partial | 4 |
| ❌ Missing | 30 |

---

## 2. Priority Ranking (Impact on Competitiveness)

Ranked by: "If comunavi had only 5 features beyond v1, which ones would make it a credible Skool alternative?"

| Rank | Feature Area | Rationale |
|------|-------------|-----------|
| **P1** | Community Forum (posts + comments + likes) | This IS Skool's core. Without threaded discussion, comunavi is just a CMS with a paywall. |
| **P2** | Classroom / Courses (modules + progress) | Second pillar of Skool. Course completion tracking is the #1 reason people pay monthly. |
| **P3** | Gamification (points + levels + leaderboard) | The engagement flywheel that makes Skool sticky. Low DB complexity, high retention impact. |
| **P4** | Member Management improvements | Invite tokens, profiles, membership questions. Table-stakes for any community tool. |
| **P5** | Calendar / Events | Communities need events. Simpler to build than chat, higher perceived value. |
| **P6** | Analytics Dashboard | Owners need to see if their community is healthy. Aggregation over existing data. |
| **P7** | Webhooks / Integrations | Enables Zapier and custom workflows. Multiplier for everything else. |
| **P8** | Chat / DM | High complexity (real-time), can be deferred. Skool's chat is basic anyway. |
| **P9** | Affiliate Program | Revenue driver but complex (attribution, payouts). Can start simple. |

---

## 3. Implementation Plan by Feature

### 3.1 Community Forum (P1)

**Bounded Context**: `forum`
**Complexity**: L

#### New DB Tables

```
categories
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  name TEXT NOT NULL
  slug TEXT NOT NULL
  description TEXT
  sort_order INTEGER DEFAULT 0
  emoji TEXT                          -- category icon
  created_at TIMESTAMPTZ
  UNIQUE(tenant_id, slug)

posts
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  category_id UUID FK(categories) NOT NULL
  author_id UUID FK(users) NOT NULL
  title TEXT NOT NULL
  body JSONB NOT NULL                 -- rich text (TipTap/ProseMirror JSON)
  is_pinned BOOLEAN DEFAULT false
  is_locked BOOLEAN DEFAULT false     -- no new comments
  like_count INTEGER DEFAULT 0        -- denormalized counter
  comment_count INTEGER DEFAULT 0     -- denormalized counter
  published_at TIMESTAMPTZ
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

comments
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  post_id UUID FK(posts) NOT NULL
  parent_id UUID FK(comments)         -- threaded replies (1 level deep)
  author_id UUID FK(users) NOT NULL
  body JSONB NOT NULL
  like_count INTEGER DEFAULT 0
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

reactions
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  user_id UUID FK(users) NOT NULL
  target_type TEXT NOT NULL           -- 'post' | 'comment'
  target_id UUID NOT NULL
  reaction_type TEXT DEFAULT 'like'   -- extensible: 'like', 'heart', etc.
  created_at TIMESTAMPTZ
  UNIQUE(tenant_id, user_id, target_type, target_id, reaction_type)
```

#### New Columns on Existing Tables
- `users`: add `bio TEXT`, `social_links JSONB` (for member profiles)

#### New API Routes
- `GET/POST /api/admin/tenants/[tenantId]/categories`
- `GET/POST /api/admin/tenants/[tenantId]/posts`
- `GET /api/admin/tenants/[tenantId]/posts/[postId]`
- `PUT/DELETE /api/admin/tenants/[tenantId]/posts/[postId]`
- `GET/POST /api/admin/tenants/[tenantId]/posts/[postId]/comments`
- `PUT/DELETE /api/admin/tenants/[tenantId]/comments/[commentId]`
- `POST/DELETE /api/admin/tenants/[tenantId]/reactions` (toggle)
- `GET /api/public/tenants/[tenantSlug]/posts` (public feed)
- `GET /api/public/tenants/[tenantSlug]/posts/[postId]`

#### New Types
```typescript
type PostBodyFormat = "prosemirror" | "markdown";
type ReactionTargetType = "post" | "comment";

type Category = { id, tenant_id, name, slug, description, sort_order, emoji, created_at };
type Post = { id, tenant_id, category_id, author_id, title, body, is_pinned, is_locked,
              like_count, comment_count, published_at, created_at, updated_at };
type Comment = { id, tenant_id, post_id, parent_id, author_id, body, like_count,
                 created_at, updated_at };
type Reaction = { id, tenant_id, user_id, target_type, target_id, reaction_type, created_at };
```

#### New UI Pages
- `/community` -- post feed with category sidebar
- `/community/[postId]` -- post detail with comments
- `/community/new` -- create post (rich editor)
- `/settings/categories` -- manage categories (admin)

#### Key Design Decisions
- **Rich text as JSONB (ProseMirror format)**: Allows embedding YouTube, polls, and attachments as structured nodes. Easier to migrate than raw HTML. Trade-off: requires a rich text editor library (TipTap recommended).
- **Denormalized counters on posts/comments**: Avoids COUNT queries on every feed load. Trade-off: must maintain via triggers or application logic.
- **Polymorphic reactions table**: One table for likes on both posts and comments. Trade-off: no FK on target_id, must enforce at application layer.

---

### 3.2 Classroom / Courses (P2)

**Bounded Context**: `classroom`
**Complexity**: XL

#### New DB Tables

```
courses
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  title TEXT NOT NULL
  slug TEXT NOT NULL
  description TEXT
  cover_image_url TEXT
  status content_status DEFAULT 'draft'  -- reuse enum
  visibility_mode visibility_mode DEFAULT 'members_only'
  sort_order INTEGER DEFAULT 0
  created_by UUID FK(users)
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  UNIQUE(tenant_id, slug)

course_modules
  id UUID PK
  course_id UUID FK(courses) NOT NULL
  tenant_id UUID FK(tenants) NOT NULL
  title TEXT NOT NULL
  description TEXT
  sort_order INTEGER DEFAULT 0
  created_at TIMESTAMPTZ

course_lessons
  id UUID PK
  module_id UUID FK(course_modules) NOT NULL
  tenant_id UUID FK(tenants) NOT NULL
  title TEXT NOT NULL
  slug TEXT NOT NULL
  body JSONB                            -- lesson content (same ProseMirror format)
  video_url TEXT
  video_duration_seconds INTEGER
  transcript TEXT
  sort_order INTEGER DEFAULT 0
  is_preview BOOLEAN DEFAULT false      -- free preview lesson
  drip_days INTEGER                     -- NULL = immediate, N = unlock N days after join
  unlock_level INTEGER                  -- NULL = no level requirement
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

course_access_rules
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  course_id UUID FK(courses) NOT NULL
  rule_type access_rule_type NOT NULL   -- reuse existing enum
  plan_id UUID FK(membership_plans)
  tag_id UUID FK(tags)
  created_at TIMESTAMPTZ
  -- same constraints as content_access_rules

user_lesson_progress
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  user_id UUID FK(users) NOT NULL
  lesson_id UUID FK(course_lessons) NOT NULL
  completed BOOLEAN DEFAULT false
  completed_at TIMESTAMPTZ
  last_position_seconds INTEGER         -- video resume point
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  UNIQUE(tenant_id, user_id, lesson_id)
```

#### New API Routes
- `GET/POST /api/admin/tenants/[tenantId]/courses`
- `GET/PUT/DELETE /api/admin/tenants/[tenantId]/courses/[courseId]`
- `GET/POST /api/admin/tenants/[tenantId]/courses/[courseId]/modules`
- `PUT/DELETE /api/admin/tenants/[tenantId]/modules/[moduleId]`
- `GET/POST /api/admin/tenants/[tenantId]/modules/[moduleId]/lessons`
- `PUT/DELETE /api/admin/tenants/[tenantId]/lessons/[lessonId]`
- `GET/POST /api/me/progress/[lessonId]` (mark complete / update position)
- `GET /api/me/courses/[courseId]/progress` (course completion %)
- `GET /api/public/tenants/[tenantSlug]/courses`
- `GET /api/public/tenants/[tenantSlug]/courses/[courseSlug]`

#### New UI Pages
- `/courses` -- course listing
- `/courses/[courseSlug]` -- course overview (modules + lessons sidebar)
- `/courses/[courseSlug]/lessons/[lessonSlug]` -- lesson player (video + transcript + discussion)
- `/admin/courses/new` -- course builder
- `/admin/courses/[courseId]/edit` -- course editor (drag-drop modules/lessons)

#### Key Design Decisions
- **Separate `courses` from `contents`**: Courses are hierarchical (course -> module -> lesson). Contents remain flat for blog/article use. Trade-off: some access rule logic is duplicated, but the domain models are fundamentally different.
- **Drip via `drip_days` on lesson**: Simple integer-based unlock. Check: `membership.joined_at + drip_days <= now()`. Trade-off: no time-of-day precision, but matches Skool's behavior.
- **`course_access_rules` mirrors `content_access_rules`**: Same pattern, different parent entity. Could be unified with a polymorphic approach but cleaner to keep separate for query simplicity.

---

### 3.3 Gamification (P3)

**Bounded Context**: `gamification`
**Complexity**: M

#### New DB Tables

```
member_points
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  user_id UUID FK(users) NOT NULL
  total_points INTEGER DEFAULT 0       -- denormalized sum
  level INTEGER DEFAULT 0              -- computed from total_points
  updated_at TIMESTAMPTZ
  UNIQUE(tenant_id, user_id)

point_events
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  user_id UUID FK(users) NOT NULL
  event_type TEXT NOT NULL             -- 'like_received', 'post_created', 'comment_created', 'lesson_completed'
  points INTEGER NOT NULL              -- positive or negative
  source_type TEXT                     -- 'post', 'comment', 'lesson'
  source_id UUID
  created_at TIMESTAMPTZ

level_configs
  tenant_id UUID FK(tenants) NOT NULL
  level INTEGER NOT NULL               -- 0-9
  name TEXT NOT NULL                   -- custom level name
  min_points INTEGER NOT NULL          -- threshold
  rewards JSONB                        -- e.g. {"unlock_course_ids": ["..."]}
  PRIMARY KEY(tenant_id, level)
```

#### New Columns on Existing Tables
- None (points are in their own tables)

#### New API Routes
- `GET /api/admin/tenants/[tenantId]/leaderboard`
- `GET/PUT /api/admin/tenants/[tenantId]/level-configs`
- `GET /api/me/points`
- `GET /api/public/tenants/[tenantSlug]/leaderboard`

#### New Types
```typescript
type PointEventType = "like_received" | "post_created" | "comment_created" | "lesson_completed";

type MemberPoints = { id, tenant_id, user_id, total_points, level, updated_at };
type PointEvent = { id, tenant_id, user_id, event_type, points, source_type, source_id, created_at };
type LevelConfig = { tenant_id, level, name, min_points, rewards };
```

#### New UI Pages
- `/leaderboard` -- community leaderboard (rank, user, points, level)
- `/settings/levels` -- configure level names and thresholds (admin)

#### Key Design Decisions
- **Event-sourced points**: `point_events` is the source of truth; `member_points.total_points` is a materialized aggregate. Trade-off: slightly more storage but enables "why did I get these points?" queries and makes corrections possible.
- **Default Skool-compatible level thresholds**: Ship with 10 levels (0-9) and Skool's exact point thresholds as defaults. Community owners can customize names but the curve is pre-configured.
- **Trigger-based point updates**: When a reaction is inserted/deleted, a DB trigger creates a `point_event` and updates `member_points`. Trade-off: tighter DB coupling but ensures consistency without application-layer orchestration.

---

### 3.4 Member Management Improvements (P4)

**Bounded Context**: `membership` (extends existing)
**Complexity**: M

#### New DB Tables

```
invites
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  token TEXT UNIQUE NOT NULL           -- short random token
  invited_email TEXT                    -- NULL = open invite link
  invited_role app_role DEFAULT 'member'
  created_by UUID FK(users) NOT NULL
  expires_at TIMESTAMPTZ NOT NULL
  accepted_at TIMESTAMPTZ
  accepted_by UUID FK(users)
  max_uses INTEGER                     -- NULL = unlimited
  use_count INTEGER DEFAULT 0
  created_at TIMESTAMPTZ

membership_questions
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  question_text TEXT NOT NULL
  is_required BOOLEAN DEFAULT true
  sort_order INTEGER DEFAULT 0
  created_at TIMESTAMPTZ

membership_applications
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  user_id UUID FK(users) NOT NULL
  status TEXT DEFAULT 'pending'        -- 'pending', 'approved', 'rejected'
  answers JSONB NOT NULL               -- [{question_id, answer}]
  reviewed_by UUID FK(users)
  reviewed_at TIMESTAMPTZ
  created_at TIMESTAMPTZ
```

#### New Columns on Existing Tables
- `users`: add `bio TEXT`, `social_links JSONB`, `headline TEXT`
- `tenants`: add `join_mode TEXT DEFAULT 'open'` -- 'open' | 'invite_only' | 'application'

#### New API Routes
- `GET/POST /api/admin/tenants/[tenantId]/invites`
- `DELETE /api/admin/tenants/[tenantId]/invites/[inviteId]`
- `POST /api/auth/accept-invite/[token]` (rework existing)
- `GET/POST /api/admin/tenants/[tenantId]/membership-questions`
- `GET /api/admin/tenants/[tenantId]/applications`
- `PUT /api/admin/tenants/[tenantId]/applications/[appId]` (approve/reject)
- `POST /api/public/tenants/[tenantSlug]/apply`
- `PUT /api/admin/tenants/[tenantId]/members/[memberId]` (role change)
- `DELETE /api/admin/tenants/[tenantId]/members/[memberId]` (remove)
- `POST /api/admin/tenants/[tenantId]/members/import` (CSV)

#### New UI Pages
- `/settings/invites` -- manage invite links
- `/settings/join-mode` -- configure open/invite/application mode
- `/settings/questions` -- membership screening questions
- `/admin/applications` -- review pending applications
- `/members/[userId]` -- public member profile
- `/settings/profile` -- edit own profile (bio, links, headline)

---

### 3.5 Calendar / Events (P5)

**Bounded Context**: `events`
**Complexity**: L

#### New DB Tables

```
events
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  title TEXT NOT NULL
  description TEXT
  location TEXT                         -- physical or URL
  event_type TEXT DEFAULT 'online'      -- 'online' | 'in_person' | 'hybrid'
  video_call_url TEXT                   -- Zoom/Meet/custom link
  starts_at TIMESTAMPTZ NOT NULL        -- always stored UTC
  ends_at TIMESTAMPTZ NOT NULL
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo'  -- display timezone
  is_recurring BOOLEAN DEFAULT false
  recurrence_rule TEXT                  -- iCal RRULE format
  max_attendees INTEGER
  visibility_mode visibility_mode DEFAULT 'members_only'
  created_by UUID FK(users) NOT NULL
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

event_rsvps
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  event_id UUID FK(events) NOT NULL
  user_id UUID FK(users) NOT NULL
  status TEXT DEFAULT 'going'          -- 'going' | 'maybe' | 'not_going'
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  UNIQUE(tenant_id, event_id, user_id)
```

#### New API Routes
- `GET/POST /api/admin/tenants/[tenantId]/events`
- `GET/PUT/DELETE /api/admin/tenants/[tenantId]/events/[eventId]`
- `POST /api/admin/tenants/[tenantId]/events/[eventId]/rsvp`
- `GET /api/public/tenants/[tenantSlug]/events`
- `GET /api/public/tenants/[tenantSlug]/events/[eventId]`

#### New UI Pages
- `/events` -- calendar view (month/week) + upcoming list
- `/events/[eventId]` -- event detail with RSVP
- `/events/new` -- create event (admin)

#### Key Design Decisions
- **No built-in video call**: Skool has "Skool Call" but building a video platform is not justified. Link to Zoom/Meet instead. Trade-off: less integrated, but avoids massive infrastructure cost.
- **Store UTC, display with timezone**: `starts_at` is TIMESTAMPTZ. The `timezone` field is for display only. Frontend converts using Intl API.
- **Email reminders via job queue**: Requires a cron/job system (Supabase Edge Functions or pg_cron). Creates a dependency on scheduled execution.

---

### 3.6 Analytics Dashboard (P6)

**Bounded Context**: `analytics`
**Complexity**: M

#### New DB Tables

```
daily_metrics
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  metric_date DATE NOT NULL
  total_members INTEGER DEFAULT 0
  active_members INTEGER DEFAULT 0     -- members who posted/commented/liked that day
  new_members INTEGER DEFAULT 0
  posts_created INTEGER DEFAULT 0
  comments_created INTEGER DEFAULT 0
  likes_given INTEGER DEFAULT 0
  lessons_completed INTEGER DEFAULT 0
  revenue_amount INTEGER DEFAULT 0     -- in smallest currency unit
  created_at TIMESTAMPTZ
  UNIQUE(tenant_id, metric_date)
```

#### New API Routes
- `GET /api/admin/tenants/[tenantId]/analytics` (query params: range, granularity)
- `GET /api/admin/tenants/[tenantId]/analytics/members` (member growth)
- `GET /api/admin/tenants/[tenantId]/analytics/engagement` (posts, comments, likes)
- `GET /api/admin/tenants/[tenantId]/analytics/revenue` (MRR, churn)

#### New UI Pages
- `/dashboard` -- rework existing dashboard to show charts (members, activity, revenue)
- `/analytics` -- detailed analytics with date range picker

#### Key Design Decisions
- **Pre-aggregated daily_metrics table**: Avoids expensive COUNT queries across large tables. A nightly cron job (pg_cron or Edge Function) computes and upserts. Trade-off: data is up to 24h stale for historical metrics. Today's metrics can be computed live from recent data.
- **No external analytics service in v2**: Keep it simple with SQL aggregation. Trade-off: limited to what we can compute in Postgres. Sufficient for Skool-level analytics.

---

### 3.7 Webhooks / Integrations (P7)

**Bounded Context**: `integrations`
**Complexity**: M

#### New DB Tables

```
webhook_endpoints
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  url TEXT NOT NULL
  secret TEXT NOT NULL                  -- HMAC signing secret
  events TEXT[] NOT NULL               -- array of event types to subscribe to
  is_active BOOLEAN DEFAULT true
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

webhook_deliveries
  id UUID PK
  webhook_endpoint_id UUID FK(webhook_endpoints) NOT NULL
  event_type TEXT NOT NULL
  payload JSONB NOT NULL
  response_status INTEGER
  response_body TEXT
  delivered_at TIMESTAMPTZ
  next_retry_at TIMESTAMPTZ
  attempt_count INTEGER DEFAULT 0
  status TEXT DEFAULT 'pending'        -- 'pending', 'delivered', 'failed'
  created_at TIMESTAMPTZ
```

#### New API Routes
- `GET/POST /api/admin/tenants/[tenantId]/webhooks`
- `PUT/DELETE /api/admin/tenants/[tenantId]/webhooks/[webhookId]`
- `GET /api/admin/tenants/[tenantId]/webhooks/[webhookId]/deliveries`

#### Outgoing Event Types
```
member.joined, member.left, member.role_changed
post.created, post.updated, post.deleted
comment.created
subscription.created, subscription.canceled
purchase.completed
event.created, event.rsvp
course.completed
```

#### New UI Pages
- `/settings/webhooks` -- manage webhook endpoints
- `/settings/webhooks/[webhookId]` -- delivery log

---

### 3.8 Chat / DM (P8)

**Bounded Context**: `messaging`
**Complexity**: XL

#### New DB Tables

```
conversations
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  type TEXT DEFAULT 'dm'               -- 'dm' | 'group' (future)
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

conversation_participants
  id UUID PK
  conversation_id UUID FK(conversations) NOT NULL
  user_id UUID FK(users) NOT NULL
  last_read_at TIMESTAMPTZ
  is_muted BOOLEAN DEFAULT false
  UNIQUE(conversation_id, user_id)

messages
  id UUID PK
  conversation_id UUID FK(conversations) NOT NULL
  sender_id UUID FK(users) NOT NULL
  body TEXT NOT NULL
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
```

#### New Columns on Existing Tables
- `tenants`: add `chat_enabled BOOLEAN DEFAULT true`

#### New API Routes
- `GET/POST /api/me/conversations`
- `GET /api/me/conversations/[conversationId]/messages`
- `POST /api/me/conversations/[conversationId]/messages`
- `PUT /api/me/conversations/[conversationId]/read` (mark read)

#### New UI Pages
- `/messages` -- conversation list
- `/messages/[conversationId]` -- chat thread

#### Key Design Decisions
- **Supabase Realtime for live messages**: Use Supabase's built-in Realtime subscriptions on the `messages` table. Trade-off: depends on Supabase Realtime stability and connection limits.
- **Defer to v3**: Chat is high-complexity and Skool's chat is basic. Forum + comments cover most interaction needs. Recommend building this last.

---

### 3.9 Affiliate Program (P9)

**Bounded Context**: `affiliates`
**Complexity**: XL

#### New DB Tables

```
affiliate_configs
  tenant_id UUID PK FK(tenants)
  is_enabled BOOLEAN DEFAULT false
  commission_rate_percent INTEGER DEFAULT 20  -- 10-50
  cookie_duration_days INTEGER DEFAULT 14
  payout_minimum_amount INTEGER DEFAULT 5000  -- minimum payout threshold
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

affiliate_links
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  user_id UUID FK(users) NOT NULL         -- the affiliate
  code TEXT UNIQUE NOT NULL               -- short referral code
  click_count INTEGER DEFAULT 0
  created_at TIMESTAMPTZ
  UNIQUE(tenant_id, user_id)

affiliate_referrals
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  affiliate_user_id UUID FK(users) NOT NULL
  referred_user_id UUID FK(users) NOT NULL
  referred_at TIMESTAMPTZ NOT NULL
  UNIQUE(tenant_id, referred_user_id)      -- one referrer per user

affiliate_commissions
  id UUID PK
  tenant_id UUID FK(tenants) NOT NULL
  affiliate_user_id UUID FK(users) NOT NULL
  referral_id UUID FK(affiliate_referrals) NOT NULL
  source_type TEXT NOT NULL               -- 'subscription' | 'purchase'
  source_id UUID NOT NULL
  amount INTEGER NOT NULL                 -- commission amount
  currency TEXT NOT NULL
  status TEXT DEFAULT 'pending'           -- 'pending', 'approved', 'paid', 'rejected'
  paid_at TIMESTAMPTZ
  created_at TIMESTAMPTZ
```

#### New API Routes
- `GET/PUT /api/admin/tenants/[tenantId]/affiliate-config`
- `GET /api/admin/tenants/[tenantId]/affiliates` (list affiliates + earnings)
- `GET /api/admin/tenants/[tenantId]/commissions` (pending payouts)
- `PUT /api/admin/tenants/[tenantId]/commissions/[id]` (approve/reject)
- `GET /api/me/affiliate` (my referral link + earnings)
- `GET /api/public/ref/[code]` (redirect + set cookie)

#### New UI Pages
- `/settings/affiliate` -- configure affiliate program (admin)
- `/admin/affiliates` -- manage affiliates and payouts
- `/my/affiliate` -- member's own referral dashboard

#### Key Design Decisions
- **Cookie-based attribution**: Set a first-party cookie on `/ref/[code]` click. On signup, check cookie and create `affiliate_referral`. Trade-off: cookie can be cleared, but matches industry standard.
- **Stripe Connect payouts (future)**: v2 tracks commissions but manual payout. Automated Stripe Connect payouts are v3.

---

## 4. Phasing

### v2.0 -- Core Community (Skool Parity MVP)

**Goal**: Make comunavi a credible Skool alternative for community builders.
**Timeline estimate**: 6-8 weeks of focused development.

| Feature | Complexity | New Tables | Migration # |
|---------|-----------|------------|-------------|
| Community Forum (posts, comments, likes) | L | categories, posts, comments, reactions | 00003 |
| Classroom / Courses (modules, lessons, progress) | XL | courses, course_modules, course_lessons, course_access_rules, user_lesson_progress | 00004 |
| Gamification (points, levels, leaderboard) | M | member_points, point_events, level_configs | 00005 |
| Member Management v2 (invites, profiles, questions) | M | invites, membership_questions, membership_applications | 00006 |

**Total new tables**: 15
**Total new API routes**: ~35
**Total new UI pages**: ~15

**v2.0 Backlog items resolved**: v2-001 (invite tokens), v2-002 (membership CRUD), v2-006 (drip content)

### v2.1 -- Engagement and Operations

**Goal**: Make community owners self-sufficient with analytics and automation.
**Timeline estimate**: 3-4 weeks.

| Feature | Complexity | New Tables |
|---------|-----------|------------|
| Calendar / Events | L | events, event_rsvps |
| Analytics Dashboard | M | daily_metrics |
| Webhooks / Integrations | M | webhook_endpoints, webhook_deliveries |
| Email notifications (Resend) | M | notification_preferences (1 table) |

**Total new tables**: 5

### v3.0 -- Advanced / Differentiation

**Goal**: Features that go beyond Skool or require significant infrastructure.
**Timeline estimate**: 8+ weeks, can be built incrementally.

| Feature | Complexity | Notes |
|---------|-----------|-------|
| Chat / DM | XL | Requires Supabase Realtime, presence system |
| Affiliate Program | XL | Cookie attribution, commission tracking, payouts |
| Multi-tenant membership (1 user = N tenants) | L | Schema refactor for v2-009 |
| AND/NOT access rules | M | v2-005 backlog |
| Meta Pixel / tracking integration | S | Frontend-only, but needs admin UI |
| Course certificates (PDF generation) | M | Edge Function + PDF lib |
| AutoDM / welcome automation | M | Depends on Chat |
| Advanced recurring events (iCal RRULE) | M | Complex recurrence logic |
| Stripe Connect automated payouts | XL | Regulatory compliance concerns |

---

## 5. Architectural Decision Records

### ADR-001: Rich Text Format for Posts and Lessons

**Status**: Proposed

**Context**: Posts and lessons need rich content (YouTube embeds, polls, formatted text, images). Skool supports inline media. We need a storage format that supports this while remaining editable.

**Decision**: Store rich text as JSONB in ProseMirror (TipTap) document format rather than raw HTML or Markdown.

**Consequences**:
- Easier: Structured content enables safe rendering, node-level embeds (video, poll, mention), server-side extraction of @mentions.
- Harder: Requires TipTap editor on frontend (bundle size ~80KB gzipped). Cannot be edited as plain text. Migration from Markdown contents in v1 requires a one-time conversion.

---

### ADR-002: Separate `courses` from `contents`

**Status**: Proposed

**Context**: v1 has a flat `contents` table for articles/video/audio. Courses are hierarchical (course -> module -> lesson). Should we extend `contents` with parent_id for nesting or create a parallel hierarchy?

**Decision**: Create separate `courses`, `course_modules`, `course_lessons` tables. Keep `contents` for flat/blog content.

**Consequences**:
- Easier: Each domain model is clean and purpose-built. Course-specific fields (drip_days, unlock_level, video_duration, transcript) live where they belong. Queries are straightforward.
- Harder: Access rule logic is duplicated (content_access_rules vs course_access_rules). Two content management UIs. If a lesson wants to reference a content item, needs cross-linking.

---

### ADR-003: Event-Sourced Points with Materialized Aggregate

**Status**: Proposed

**Context**: Gamification points need to be tracked (1 like = 1 point). Options: (A) increment a counter directly, (B) store individual point events and materialize the sum.

**Decision**: Option B. `point_events` is append-only event log. `member_points.total_points` is a materialized aggregate maintained by DB triggers.

**Consequences**:
- Easier: Full audit trail of how points were earned. Can recompute totals if point values change. Enables "activity feed" showing recent point gains. Can handle point deductions (unlike removed).
- Harder: More storage. Requires triggers or application-level sync to keep `member_points` up to date. Slight eventual consistency risk if trigger fails.

---

### ADR-004: Webhook Delivery with Retry

**Status**: Proposed

**Context**: Outgoing webhooks need reliable delivery. Skool supports Zapier, which expects webhook reliability.

**Decision**: Use a `webhook_deliveries` table as a queue. A periodic job (pg_cron every 1 minute or Supabase Edge Function cron) processes pending/failed deliveries with exponential backoff (3 retries max).

**Consequences**:
- Easier: Simple implementation using existing Supabase infrastructure. Delivery log provides debugging for community owners.
- Harder: pg_cron has 1-minute minimum granularity (acceptable for webhooks). Failed deliveries accumulate if endpoint is permanently down -- need TTL cleanup.

---

## 6. Migration Strategy

### Database Migration Sequence

```
00003_forum.sql          -- categories, posts, comments, reactions + indexes + RLS
00004_classroom.sql      -- courses, modules, lessons, progress + access rules + indexes + RLS
00005_gamification.sql   -- member_points, point_events, level_configs + triggers + RLS
00006_member_mgmt.sql    -- invites, membership_questions, applications + user profile columns + RLS
00007_events.sql         -- events, event_rsvps + indexes + RLS     (v2.1)
00008_analytics.sql      -- daily_metrics + materialization function  (v2.1)
00009_webhooks.sql       -- webhook_endpoints, deliveries            (v2.1)
00010_messaging.sql      -- conversations, participants, messages    (v3.0)
00011_affiliates.sql     -- affiliate_configs, links, referrals, commissions (v3.0)
```

### Backward Compatibility

All new migrations are additive. No existing tables are altered destructively. New columns on `users` and `tenants` have defaults and are nullable. Existing v1 installations can run migrations incrementally.

---

## 7. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Rich text editor complexity (TipTap) | Medium | High | Start with minimal extensions (bold, italic, link, YouTube, image). Add polls/mentions as separate phase. |
| Course builder UX scope creep | High | High | Ship with simple form-based lesson creation first. Drag-drop reordering is phase 2 of course builder. |
| Gamification gaming/abuse | Medium | Medium | Rate-limit point events. Admin can reset points. Consider spam detection for posts/comments. |
| Real-time chat scaling | High | High | Defer to v3. Supabase Realtime has connection limits per project. Monitor. |
| Webhook delivery reliability | Low | Medium | Exponential backoff + dead-letter logging. Alert admin on repeated failures. |
| Migration size (15 new tables in v2.0) | Medium | Medium | Split into 4 focused migrations. Each migration is independently testable. |

---

## 8. What This Plan Intentionally Omits

These are conscious exclusions, not oversights:

1. **Mobile app** -- Skool has no mobile app either (web-only). Responsive web is sufficient.
2. **Built-in video hosting** -- Use external providers (YouTube, Vimeo, Bunny.net). Video hosting is a separate infrastructure problem.
3. **Built-in video calls** -- Link to Zoom/Meet/Google Meet. Building a video conferencing system is out of scope.
4. **Multi-language i18n** -- English and Japanese support is sufficient for target market. Full i18n is a v4 concern.
5. **Stripe Connect automated payouts** -- Track commissions in v3 but payouts are manual. Automated payouts have regulatory implications.
6. **Custom email templates** -- Use Resend with basic transactional templates. Full email marketing is a different product.

---

## Next Steps

1. Review this plan and approve/modify the phasing.
2. Create GitHub issues for each v2.0 feature (4 issues).
3. Start with Forum (P1) since Classroom depends on the same rich text infrastructure.
4. Implement each feature as a separate migration + API + types + UI PR.
5. Update `manifest.json` entities list and `01-template-scope.md` after each feature lands.
