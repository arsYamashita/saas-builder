-- Atomic conflict-guard for recurring Stripe Checkout.
--
-- See [[stripe_recurring_subscription_missing_conflict_guard]] and the
-- 2026-08-30 Codex review of PR #60 (instruction 095, two review rounds):
-- a plain SELECT-then-create check in application code has a TOCTOU race
-- — two concurrent checkout requests from the same user can both pass the
-- SELECT before either creates anything, and both go on to create a
-- separate Stripe Checkout Session (and, once paid, a separate
-- subscription). `subscriptions.stripe_subscription_id` being UNIQUE only
-- prevents the SAME Stripe subscription id from producing two rows — it
-- does nothing for two genuinely different Stripe subscriptions.
--
-- This closes that race with a short-lived DB row + UNIQUE constraint,
-- inserted and checked atomically inside a single Postgres function call
-- (one function call = one implicit transaction from PostgREST's `rpc`),
-- so two concurrent calls serialize on the unique index rather than both
-- reading "no conflict".
--
-- Round-2 review finding (fixed here): a NAIVE version of this guard also
-- blocked a legitimate RETRY of the same checkout attempt (e.g. the first
-- response was lost to a network blip after Stripe already created the
-- Checkout Session) with 409, defeating the whole point of
-- `createCheckoutSession`'s own idempotency key — the retry should reach
-- Stripe and get the SAME session back, not be rejected before it gets
-- there. `reserve_subscription_checkout_slot` now takes the caller's
-- `attempt_id` and, when a reservation already exists for
-- (tenant_id, user_id) with a MATCHING attempt_id, hands back that same
-- reservation instead of raising a conflict — a genuinely different
-- concurrent attempt (different or absent attempt_id) still conflicts.
--
-- Residual trade-off (documented, not silently accepted): the reservation
-- TTL (default 30 minutes) is shorter than Stripe's default Checkout
-- Session expiry (24h). The webhook route now proactively releases the
-- reservation as soon as `checkout.session.completed` is processed (see
-- app/api/stripe/webhook/route.ts), which shrinks the exposure window
-- from "up to 24h" down to "however long the user takes to pay" in the
-- normal case. It is NOT fully closed: a user who reserves a slot,
-- abandons the Checkout page without paying, and returns after the TTL —
-- but before the original (never-completed) session expires — could still
-- end up completing two payments if they complete both the old and new
-- session. Closing that completely would require storing the Checkout
-- Session id on the reservation and expiring the OLD session
-- (`stripe.checkout.sessions.expire`) before creating a new one, which is
-- tracked as follow-up rather than expanded in this round.
create table if not exists subscription_checkout_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  attempt_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_subscription_checkout_reservations_tenant_user
  on subscription_checkout_reservations(tenant_id, user_id);

alter table subscription_checkout_reservations enable row level security;
drop policy if exists subscription_checkout_reservations_select_tenant on subscription_checkout_reservations;
create policy subscription_checkout_reservations_select_tenant
  on subscription_checkout_reservations for select
  using (tenant_id in (select public.current_user_tenant_ids()));

-- Reserves a checkout slot for (tenant_id, user_id), atomically:
--   1. sweeps this user's own expired reservation (if any — a fresh retry
--      after TTL should not be blocked by its own stale row),
--   2. if a live (non-expired) reservation already exists:
--      - same non-null attempt_id  -> hand back the SAME reservation id
--        (this is a retry of an in-flight attempt; let it reach Stripe's
--        own idempotency-key replay instead of rejecting it here),
--      - otherwise                 -> raise 'SUBSCRIPTION_CONFLICT'
--        (a genuinely different/concurrent attempt),
--   3. rejects if an active/trialing/past_due subscription already exists,
--   4. inserts a new reservation row (the UNIQUE index above rejects a
--      concurrent second reservation for the same tenant+user, caught
--      below as unique_violation).
-- `for update` on the existence check serializes concurrent callers on
-- that row/gap so two simultaneous first-time reservations for the same
-- tenant+user still can't both observe "no reservation yet".
create or replace function public.reserve_subscription_checkout_slot(
  p_tenant_id uuid,
  p_user_id uuid,
  p_attempt_id text default null,
  p_ttl_seconds int default 1800
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation_id uuid;
  v_existing_id uuid;
  v_existing_attempt_id text;
begin
  delete from subscription_checkout_reservations
  where tenant_id = p_tenant_id
    and user_id = p_user_id
    and expires_at < now();

  select id, attempt_id
    into v_existing_id, v_existing_attempt_id
  from subscription_checkout_reservations
  where tenant_id = p_tenant_id
    and user_id = p_user_id
  for update;

  if v_existing_id is not null then
    if p_attempt_id is not null and v_existing_attempt_id = p_attempt_id then
      return v_existing_id;
    end if;
    raise exception 'SUBSCRIPTION_CONFLICT';
  end if;

  if exists (
    select 1 from subscriptions
    where tenant_id = p_tenant_id
      and user_id = p_user_id
      and status in ('active', 'trialing', 'past_due')
  ) then
    raise exception 'SUBSCRIPTION_CONFLICT';
  end if;

  insert into subscription_checkout_reservations (tenant_id, user_id, attempt_id, expires_at)
  values (p_tenant_id, p_user_id, p_attempt_id, now() + make_interval(secs => p_ttl_seconds))
  returning id into v_reservation_id;

  return v_reservation_id;
exception
  when unique_violation then
    raise exception 'SUBSCRIPTION_CONFLICT';
end;
$$;

-- Releases a reservation early by id (e.g. Stripe Checkout Session
-- creation failed after the slot was reserved) so the user isn't blocked
-- for the full TTL on a request that never reached Stripe.
create or replace function public.release_subscription_checkout_slot(
  p_reservation_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from subscription_checkout_reservations where id = p_reservation_id;
$$;

-- Releases a reservation by (tenant_id, user_id) instead of by id — used
-- by the Stripe webhook handler on `checkout.session.completed`, which
-- knows the tenant/user from the subscription metadata but was never
-- given the reservation id (the checkout route and the webhook route run
-- as two separate, unrelated requests). Proactively releasing here is
-- what shrinks the residual exposure window described above.
create or replace function public.release_subscription_checkout_slot_for_user(
  p_tenant_id uuid,
  p_user_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from subscription_checkout_reservations
  where tenant_id = p_tenant_id and user_id = p_user_id;
$$;

-- Least privilege: revoke the implicit PUBLIC execute grant every new
-- function gets (and explicitly from authenticated/anon too), then grant
-- execute to service_role only — these RPCs trust their tenant_id/user_id
-- arguments, so only the trusted server (service-role admin client) may
-- call them. See 0016_create_tenant_with_owner_atomic.sql for the same
-- pattern and full rationale
-- ([[supabase_default_acl_function_revoke_public_insufficient]]).
revoke all on function public.reserve_subscription_checkout_slot(
  uuid, uuid, text, int
) from public;
revoke all on function public.release_subscription_checkout_slot(
  uuid
) from public;
revoke all on function public.release_subscription_checkout_slot_for_user(
  uuid, uuid
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.reserve_subscription_checkout_slot(
      uuid, uuid, text, int
    ) from authenticated;
    revoke all on function public.release_subscription_checkout_slot(
      uuid
    ) from authenticated;
    revoke all on function public.release_subscription_checkout_slot_for_user(
      uuid, uuid
    ) from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.reserve_subscription_checkout_slot(
      uuid, uuid, text, int
    ) from anon;
    revoke all on function public.release_subscription_checkout_slot(
      uuid
    ) from anon;
    revoke all on function public.release_subscription_checkout_slot_for_user(
      uuid, uuid
    ) from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.reserve_subscription_checkout_slot(
      uuid, uuid, text, int
    ) to service_role;
    grant execute on function public.release_subscription_checkout_slot(
      uuid
    ) to service_role;
    grant execute on function public.release_subscription_checkout_slot_for_user(
      uuid, uuid
    ) to service_role;
  end if;
end $$;
