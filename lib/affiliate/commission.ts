import { createAdminClient } from "@/lib/db/supabase/admin";

type CreateCommissionArgs = {
  tenantId: string;
  affiliateId: string;
  referralId?: string | null;
  subscriptionId?: string | null;
  amount: number;
  currency?: string;
};

/**
 * Creates a pending commission row for a converted referral.
 *
 * Idempotent against Stripe webhook redelivery: uses `upsert` with
 * `ignoreDuplicates` against the `commissions_subscription_affiliate_unique`
 * DB constraint on `(subscription_id, affiliate_id)` (see migration
 * 0013_commissions_idempotency.sql) instead of a bare INSERT. A redelivered
 * `customer.subscription.updated` event that reaches this function twice
 * for the same subscription/affiliate pair silently no-ops on the second
 * call rather than creating a second commission row (double payout).
 * See [[affiliate_commission_idempotency_missing]].
 *
 * The caller's own pre-check (SELECT existing commission before calling
 * this function — see app/api/stripe/webhook/route.ts) is only an
 * optimization to skip redundant referral-lookup work; it is NOT what
 * makes this safe under concurrent redelivery (check-then-insert has a
 * race window). Safety comes from the DB constraint + ON CONFLICT here.
 *
 * @returns the inserted commission row, or `null` if a row with the same
 *   `(subscription_id, affiliate_id)` already existed (duplicate, skipped).
 */
export async function createCommission({
  tenantId,
  affiliateId,
  referralId,
  subscriptionId,
  amount,
  currency = "jpy",
}: CreateCommissionArgs) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("commissions")
    .upsert(
      {
        tenant_id: tenantId,
        affiliate_id: affiliateId,
        referral_id: referralId ?? null,
        subscription_id: subscriptionId ?? null,
        amount,
        currency,
        status: "pending",
      },
      {
        onConflict: "subscription_id,affiliate_id",
        ignoreDuplicates: true,
      }
    )
    .select();

  if (error) {
    throw new Error(`Failed to create commission: ${error.message}`);
  }

  // With ignoreDuplicates, a skipped (already-existing) row comes back as
  // an empty array rather than an error — that is the expected outcome for
  // a Stripe webhook redelivery, not a failure.
  return data?.[0] ?? null;
}
