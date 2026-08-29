/**
 * Conflict guard for recurring Stripe subscriptions.
 *
 * See [[stripe_recurring_subscription_missing_conflict_guard]]: without a
 * pre-checkout check, a user can start a second Stripe Checkout Session
 * (and, once paid, a second recurring subscription) while they already
 * have an active/trialing/past-due subscription for the same tenant. The
 * `subscriptions.stripe_subscription_id` UNIQUE constraint only dedupes
 * *identical* Stripe subscription ids arriving twice (e.g. a webhook
 * retry) — it does nothing to stop two genuinely different Stripe
 * subscriptions from being created for the same user, which is the
 * business-level duplicate-billing problem this guard closes.
 *
 * This is intentionally decoupled from any specific Supabase client type
 * so it can be unit-tested with a minimal fake and reused from any route
 * (checkout, an admin "assign plan" action, etc.) without importing
 * `@supabase/supabase-js` into this package.
 */

/** Subscription statuses that count as "already has billing in effect". */
export const CONFLICTING_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
] as const;

/**
 * Thrown by `assertNoConflictingActiveSubscription` when the user already
 * has a conflicting subscription. Route handlers should map this to
 * HTTP 409 (Conflict) — never leak the underlying DB row.
 */
export class SubscriptionConflictError extends Error {
  readonly existingSubscriptionId: string;
  readonly existingStatus: string;

  constructor(params: {
    tenantId: string;
    userId: string;
    existingSubscriptionId: string;
    existingStatus: string;
  }) {
    super(
      `User ${params.userId} in tenant ${params.tenantId} already has a ` +
        `conflicting subscription (id=${params.existingSubscriptionId}, ` +
        `status=${params.existingStatus}); refusing to start a new Checkout ` +
        `Session. See [[stripe_recurring_subscription_missing_conflict_guard]].`
    );
    this.name = "SubscriptionConflictError";
    this.existingSubscriptionId = params.existingSubscriptionId;
    this.existingStatus = params.existingStatus;
  }
}

type MinimalSupabaseRow = { id: string; status: string };

/**
 * Minimal shape of the Supabase query-builder chain this function needs —
 * matches `supabase.from("subscriptions").select(...).eq(...).eq(...).in(...).maybeSingle()`.
 */
export interface SubscriptionConflictCheckClient {
  from(table: "subscriptions"): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        eq(
          column: string,
          value: string
        ): {
          in(
            column: string,
            values: readonly string[]
          ): {
            // `PromiseLike`, not `Promise`: Supabase's real query builder is
            // thenable but not a full Promise (no .catch/.finally), and
            // structurally matching it against a real SupabaseClient's
            // deeply-generic type also avoids a TS "type instantiation is
            // excessively deep" error at call sites that pass the real
            // client in directly.
            maybeSingle(): PromiseLike<{
              data: MinimalSupabaseRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
}

/**
 * Throws `SubscriptionConflictError` if the given user already has an
 * active/trialing/past_due subscription for the given tenant. Resolves
 * silently otherwise.
 *
 * ⚠️ This is a plain SELECT — it is NOT atomic against a race between two
 * concurrent callers (both can read "no conflict" before either writes
 * anything). `stripe_subscription_id` being UNIQUE on `subscriptions`
 * does NOT close that race either: it only prevents the SAME Stripe
 * subscription id from producing two rows, not two DIFFERENT Stripe
 * subscriptions being created for one user (Codex review finding on PR
 * #60, instruction 095 second round — the original version of this
 * comment claimed otherwise; that was wrong).
 *
 * For any flow that goes on to create a Stripe object (Checkout Session,
 * etc.) — i.e. anywhere this matters for real — use
 * `reserveSubscriptionCheckoutSlot` instead, which IS atomic (backed by a
 * DB unique constraint checked inside a single function call). Keep using
 * this plain check only for non-money-moving reads, e.g. showing a "you
 * already have a subscription" banner in a UI.
 */
export async function assertNoConflictingActiveSubscription(
  supabase: SubscriptionConflictCheckClient,
  params: { tenantId: string; userId: string }
): Promise<void> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("tenant_id", params.tenantId)
    .eq("user_id", params.userId)
    .in("status", CONFLICTING_SUBSCRIPTION_STATUSES)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to check for a conflicting subscription (tenant=${params.tenantId}, ` +
        `user=${params.userId}): ${error.message}`
    );
  }

  if (data) {
    throw new SubscriptionConflictError({
      tenantId: params.tenantId,
      userId: params.userId,
      existingSubscriptionId: data.id,
      existingStatus: data.status,
    });
  }
}

/** Default reservation TTL: 30 minutes — see the trade-off note in
 * `supabase/migrations/0019_subscription_checkout_reservations.sql`. */
export const DEFAULT_CHECKOUT_RESERVATION_TTL_SECONDS = 1800;

/** Minimal shape of the Supabase RPC surface these functions need. */
export interface SubscriptionReservationClient {
  rpc(
    fn: "reserve_subscription_checkout_slot",
    args: { p_tenant_id: string; p_user_id: string; p_ttl_seconds: number }
  ): PromiseLike<{ data: string | null; error: { message: string } | null }>;
  rpc(
    fn: "release_subscription_checkout_slot",
    args: { p_reservation_id: string }
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function isConflictError(error: { message: string } | null): boolean {
  return Boolean(error && error.message.includes("SUBSCRIPTION_CONFLICT"));
}

/**
 * Atomically reserves a checkout slot for (tenantId, userId) via the
 * `reserve_subscription_checkout_slot` Postgres function — a single RPC
 * call is a single implicit transaction, so the function's own
 * exists-check + insert-with-UNIQUE-constraint closes the TOCTOU race that
 * `assertNoConflictingActiveSubscription` alone cannot (see its doc
 * comment). Returns the reservation id on success; call
 * `releaseSubscriptionCheckoutSlot` with it if the checkout attempt fails
 * after reserving (so the user isn't blocked for the full TTL).
 *
 * Throws `SubscriptionConflictError` if the user already has a
 * conflicting subscription OR another reservation is still in flight for
 * the same tenant+user (both cases the DB function raises as
 * `SUBSCRIPTION_CONFLICT`; this function can't and doesn't need to tell
 * them apart from the caller's side — either way, the correct response is
 * HTTP 409, don't start a new Checkout Session).
 */
export async function reserveSubscriptionCheckoutSlot(
  supabase: SubscriptionReservationClient,
  params: {
    tenantId: string;
    userId: string;
    ttlSeconds?: number;
  }
): Promise<{ reservationId: string }> {
  const { data, error } = await supabase.rpc(
    "reserve_subscription_checkout_slot",
    {
      p_tenant_id: params.tenantId,
      p_user_id: params.userId,
      p_ttl_seconds: params.ttlSeconds ?? DEFAULT_CHECKOUT_RESERVATION_TTL_SECONDS,
    }
  );

  if (error) {
    if (isConflictError(error)) {
      throw new SubscriptionConflictError({
        tenantId: params.tenantId,
        userId: params.userId,
        existingSubscriptionId: "unknown", // the DB function doesn't return which row conflicted
        existingStatus: "unknown",
      });
    }
    throw new Error(
      `Failed to reserve a checkout slot (tenant=${params.tenantId}, ` +
        `user=${params.userId}): ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      `reserve_subscription_checkout_slot returned no reservation id ` +
        `(tenant=${params.tenantId}, user=${params.userId})`
    );
  }

  return { reservationId: data };
}

/**
 * Releases a reservation early. Best-effort: failures are swallowed
 * (logged by the caller if desired) since the reservation will also
 * self-expire via its TTL — a failed release just means the user waits
 * out the TTL instead of being able to retry immediately.
 */
export async function releaseSubscriptionCheckoutSlot(
  supabase: SubscriptionReservationClient,
  reservationId: string
): Promise<{ released: boolean; error?: string }> {
  const { error } = await supabase.rpc("release_subscription_checkout_slot", {
    p_reservation_id: reservationId,
  });

  if (error) {
    return { released: false, error: error.message };
  }
  return { released: true };
}
