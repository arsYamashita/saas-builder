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
 * Call this BEFORE creating a new Stripe Checkout Session — it is a
 * best-effort, pre-flight business check (not itself an atomicity
 * guarantee against a race between two concurrent checkout requests; that
 * class of problem is a DB-level unique-constraint/lock concern, already
 * covered here by `stripe_subscription_id` being UNIQUE on the
 * `subscriptions` table so a genuine race still can't produce two rows for
 * the same Stripe subscription).
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
