# community_membership_saas Template Scope (v2)

## Purpose
This template is for:
- membership-based community content delivery
- online education platforms with courses and progress tracking
- paid newsletters / fan clubs
- creator monetization sites
- Skool-style community + course + gamification platforms
- forum-driven communities with engagement mechanics

## Included Domain Objects

### v1 (core)
- membership_plans
- subscriptions
- contents
- content_access_rules
- purchases
- tags
- user_tags
- audit_logs

### v2 (forum)
- categories
- posts
- comments
- reactions

### v2 (classroom)
- courses
- course_modules
- course_lessons
- course_access_rules
- user_lesson_progress

### v2 (gamification)
- member_points
- point_events
- level_configs

### v2 (member management)
- invites
- membership_questions
- membership_applications

## Included Screens

### v1
- /dashboard
- /contents
- /contents/new
- /contents/[slug]/edit
- /members
- /plans
- /plans/new
- /tags
- /settings

### v2
- /community (post feed with category sidebar)
- /community/[postId] (post detail with comments)
- /community/new (create post with rich editor)
- /courses (course listing)
- /courses/[courseSlug] (course overview)
- /courses/[courseSlug]/lessons/[lessonSlug] (lesson player)
- /leaderboard (community leaderboard)
- /members/[userId] (member profile)
- /settings/categories (manage categories)
- /settings/levels (configure gamification levels)
- /settings/invites (manage invite links)
- /settings/join-mode (open / invite_only / application)
- /settings/questions (membership screening questions)
- /admin/applications (review pending applications)
- /admin/courses/new (course builder)
- /admin/courses/[courseId]/edit (course editor)
- /settings/profile (edit own bio, links, headline)

## Included Core Modules
- auth
- tenant
- role based access control (owner, admin, editor, member)
- audit logs
- Stripe subscription + one-time purchase
- community forum (posts, comments, likes)
- classroom (courses, modules, lessons, progress)
- gamification (points, levels, leaderboard)
- invite token flow
- membership application / screening
- drip content (join-date-based lesson unlock)
- level-based content unlock

## Explicitly Out of Scope
- reservation / booking
- deal / pipeline management
- customer CRM
- approval workflows (beyond membership application)
- operation request management
- affiliate tracking (v3 backlog)
- mobile app
- advanced analytics dashboard (v3 backlog)
- multi-language
- email automation (Resend is optional integration)
- file attachment storage (Cloudflare R2 is optional integration)
- AND/NOT access rules (v3 backlog)
- Chat / DM (v3 backlog)
- Calendar / Events (v3 backlog)
- Webhooks / Zapier integration (v3 backlog)
- built-in video hosting (use YouTube/Vimeo/Bunny.net)
- built-in video calls (link to Zoom/Meet)
