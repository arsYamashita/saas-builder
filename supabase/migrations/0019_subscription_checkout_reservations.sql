-- Atomic conflict-guard for recurring Stripe Checkout.
--
-- See [[stripe_recurring_subscription_missing_conflict_guard]] and the
-- 2026-08-30 Codex review of PR #60 (instruction 095): a plain
-- SELECT-then-create check in application code has a TOCTOU race — two
-- concurrent checkout requests from the same user can both pass the
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
-- Trade-off (documented, not silently accepted): the reservation's TTL
-- (default 30 minutes) is shorter than Stripe's default Checkout Session
-- expiry (24h), so a user who reserves a slot, abandons the Checkout page,
-- and returns after the TTL — but before the old session expires — could
-- still complete two payments. Closing that fully needs the webhook to
-- delete the reservation on `checkout.session.completed`/cancellation,
-- which is tracked as follow-up (not implemented in this round) rather
-- than expanded scope here. This migration still closes the concrete race
-- the review flagged (near-simultaneous concurrent requests).
create table if not exists subscription_checkout_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
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
--   2. rejects if an active/trialing/past_due subscription already exists,
--   3. inserts a new reservation row (the UNIQUE index above rejects a
--      concurrent second reservation for the same tenant+user).
-- Raises 'SUBSCRIPTION_CONFLICT' (as the exception message) in both
-- conflict cases so the caller can map either to HTTP 409 the same way.
create or replace function public.reserve_subscription_checkout_slot(
  p_tenant_id uuid,
  p_user_id uuid,
  p_ttl_seconds int default 1800
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation_id uuid;
begin
  delete from subscription_checkout_reservations
  where tenant_id = p_tenant_id
    and user_id = p_user_id
    and expires_at < now();

  if exists (
    select 1 from subscriptions
    where tenant_id = p_tenant_id
      and user_id = p_user_id
      and status in ('active', 'trialing', 'past_due')
  ) then
    raise exception 'SUBSCRIPTION_CONFLICT';
  end if;

  insert into subscription_checkout_reservations (tenant_id, user_id, expires_at)
  values (p_tenant_id, p_user_id, now() + make_interval(secs => p_ttl_seconds))
  returning id into v_reservation_id;

  return v_reservation_id;
exception
  when unique_violation then
    raise exception 'SUBSCRIPTION_CONFLICT';
end;
$$;

-- Releases a reservation early (e.g. Stripe Checkout Session creation
-- failed after the slot was reserved) so the user isn't blocked for the
-- full TTL on a request that never reached Stripe.
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
