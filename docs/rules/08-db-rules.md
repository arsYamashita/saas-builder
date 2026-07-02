# DB Rules

## Existing Tables Are Source of Truth
AI must use existing tables:
- contents
- membership_plans
- subscriptions
- affiliates
- referrals
- commissions
- tenant_users
- tenants
- users

## Forbidden Changes
Do not rename tables.
Do not rename columns.
Do not add unrelated tables.

## Tenant Boundary
All domain tables must be queried with tenant_id where applicable.

## Content Rules
Use:
- title
- body
- content_type
- visibility
- published
- published_at
- created_by

## Membership Plan Rules
Use:
- name
- description
- price_id
- status

## Subscription Rules
Do not create new billing tables unless explicitly requested.
Use existing subscriptions table.

## Audit Rule
Every mutation should create audit log entry.

## Row Level Security (mandatory)
Every table created by a migration MUST:
1. `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
2. Have at least one tenant-isolation policy scoping rows to the caller's
   tenant (or, for a client-facing app, per-role policies covering every
   command the client performs directly).

A table with RLS left disabled (the Postgres/Supabase default) is a
cross-tenant data leak by default, not a hardening opportunity for later —
RLS is opt-in. See [[supabase_rls_missing]] and
[[supabase_rls_enable_migration_missing]].

Do not ship a placeholder policy such as `USING (true)` /
`WITH CHECK (true)` "to unblock the client for now" — this passes an "RLS
enabled" audit check while granting every authenticated user access to
every row. See [[supabase_rls_policy_too_permissive]] and
[[supabase_rls_multitenant_incomplete]].

If the table stores files in Supabase Storage rather than Postgres rows,
the bucket needs its own `storage.objects` policy — table RLS does not
cover it. See [[supabase_storage_bucket_policy_missing]].

Use `docs/db/rls-migration-template.sql` as the copy-paste starting point
(covers both the service-role/defense-in-depth pattern and the
client-facing/primary-enforcement pattern, plus the storage bucket case).

## Idempotency Constraints (mandatory for externally-triggered inserts)
Any table populated by a webhook (Stripe, etc.), cron job, or other
at-least-once-delivery event source MUST have a DB-level UNIQUE constraint
on the natural idempotency key (e.g. `stripe_subscription_id`,
`stripe_payment_intent_id`, or `(tenant_id, external_event_id)`), and the
corresponding insert MUST use `ON CONFLICT` upsert/do-nothing — never a
bare INSERT. A duplicate delivery without this constraint creates a
second row (double-charged affiliate commission, duplicate points award,
duplicate subscription, double-sent digest) with no error raised. See
[[affiliate_commission_idempotency_missing]],
[[stripe_recurring_subscription_missing_conflict_guard]],
[[gamification_points_idempotency_missing]],
[[cron_owner_digest_no_idempotency]], [[quiz_maxattempts_race_condition]].
