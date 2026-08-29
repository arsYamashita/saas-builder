/**
 * Compensating-transaction wrapper for creating a Stripe Product+Price
 * pair together with its `billing_products`/`billing_prices` DB rows.
 *
 * See [[stripe_plan_product_price_no_rollback_on_db_fail]]: creating a
 * Stripe Product and Price is an external, non-transactional side effect —
 * if the DB write that's supposed to record it fails afterwards, a naive
 * implementation leaves the Stripe objects permanently orphaned (visible
 * in the Stripe dashboard, no way to reconcile which ones are "real").
 *
 * This function is the ONLY supported way to create a billing
 * product+price pair in this codebase: it creates the Stripe objects,
 * then persists both DB rows, and on ANY failure after the Stripe objects
 * exist, it deactivates them (`active: false`) as best-effort compensation
 * before rethrowing. If the second DB insert (`billing_prices`) fails
 * after the first (`billing_products`) already committed, it also rolls
 * back that DB row so a half-written product-without-a-price row never
 * lingers.
 *
 * Compensation is best-effort (Stripe has no distributed transaction with
 * Postgres): each compensating call is wrapped so a compensation failure
 * never masks the original error, but callers should still treat
 * `BillingCatalogWriteError` as "check the Stripe dashboard for
 * product/price ids in this error's message" in an alert, not a fully
 * self-healing guarantee.
 */

export class BillingCatalogWriteError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "BillingCatalogWriteError";
    if (cause !== undefined) this.cause = cause;
  }
}

interface StripeProductLike {
  id: string;
}
interface StripePriceLike {
  id: string;
}

/** Minimal Stripe surface this function needs — kept decoupled from the
 * `stripe` package's own types so this module can be unit-tested with a
 * lightweight fake. */
export interface BillingCatalogStripeClient {
  products: {
    create(params: Record<string, unknown>): Promise<StripeProductLike>;
    update(id: string, params: Record<string, unknown>): Promise<unknown>;
  };
  prices: {
    create(params: Record<string, unknown>): Promise<StripePriceLike>;
    update(id: string, params: Record<string, unknown>): Promise<unknown>;
  };
}

type InsertResult = Promise<{
  data: { id: string } | null;
  error: { message: string } | null;
}>;

/** Minimal Supabase-admin-client surface this function needs. */
export interface BillingCatalogClient {
  from(table: "billing_products" | "billing_prices"): {
    insert(row: Record<string, unknown>): {
      select(columns: string): { single(): InsertResult };
    };
    delete(): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
    };
  };
}

export interface CreateBillingProductAndPriceParams {
  tenantId: string;
  productName: string;
  productType: string;
  /** Smallest-currency-unit integer amount (e.g. yen, no decimal). */
  amount: number;
  currency?: string;
  interval?: string;
  intervalCount?: number;
  trialDays?: number;
}

async function deactivateStripeObjects(
  stripe: BillingCatalogStripeClient,
  ids: { productId?: string; priceId?: string }
): Promise<void> {
  // Price must be deactivated before/independent of the product — order
  // doesn't matter to Stripe, but we run both and swallow individual
  // failures so one compensation failure doesn't block the other.
  if (ids.priceId) {
    await stripe.prices.update(ids.priceId, { active: false }).catch(() => {});
  }
  if (ids.productId) {
    await stripe.products.update(ids.productId, { active: false }).catch(() => {});
  }
}

/**
 * Creates a Stripe Product + Price, persists them as `billing_products` +
 * `billing_prices` rows, and compensates (deactivates the Stripe objects,
 * and rolls back any partially-written DB row) on any failure along the
 * way. Throws `BillingCatalogWriteError` on failure; returns the created
 * Stripe ids on success.
 */
export async function createBillingProductAndPrice(
  stripe: BillingCatalogStripeClient,
  supabase: BillingCatalogClient,
  params: CreateBillingProductAndPriceParams
): Promise<{ productId: string; priceId: string; dbProductRowId: string; dbPriceRowId: string }> {
  const currency = params.currency ?? "jpy";
  let stripeProduct: StripeProductLike | null = null;
  let stripePrice: StripePriceLike | null = null;
  let dbProductRowId: string | null = null;

  try {
    stripeProduct = await stripe.products.create({
      name: params.productName,
      metadata: { tenant_id: params.tenantId },
    });

    stripePrice = await stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: params.amount,
      currency,
      ...(params.interval
        ? {
            recurring: {
              interval: params.interval,
              interval_count: params.intervalCount ?? 1,
              ...(params.trialDays ? { trial_period_days: params.trialDays } : {}),
            },
          }
        : {}),
    });

    const { data: productRow, error: productError } = await supabase
      .from("billing_products")
      .insert({
        tenant_id: params.tenantId,
        stripe_product_id: stripeProduct.id,
        name: params.productName,
        product_type: params.productType,
      })
      .select("id")
      .single();

    if (productError || !productRow) {
      throw new Error(
        productError?.message ?? "billing_products insert returned no row"
      );
    }
    dbProductRowId = productRow.id;

    let priceRow: { id: string } | null;
    try {
      const { data, error: priceError } = await supabase
        .from("billing_prices")
        .insert({
          tenant_id: params.tenantId,
          product_id: productRow.id,
          stripe_price_id: stripePrice.id,
          amount: params.amount,
          currency,
          interval: params.interval ?? null,
          interval_count: params.intervalCount ?? null,
          trial_days: params.trialDays ?? null,
        })
        .select("id")
        .single();

      if (priceError || !data) {
        throw new Error(
          priceError?.message ?? "billing_prices insert returned no row"
        );
      }
      priceRow = data;
    } catch (priceInsertErr) {
      // Partial DB failure: billing_products committed but billing_prices
      // didn't. Roll back the orphaned product row rather than leaving a
      // product-with-no-price row behind.
      await supabase
        .from("billing_products")
        .delete()
        .eq("id", productRow.id)
        .catch(() => {});
      throw priceInsertErr;
    }

    return {
      productId: stripeProduct.id,
      priceId: stripePrice.id,
      dbProductRowId: productRow.id,
      dbPriceRowId: priceRow.id,
    };
  } catch (err) {
    await deactivateStripeObjects(stripe, {
      productId: stripeProduct?.id,
      priceId: stripePrice?.id,
    });

    const compensationNote = stripeProduct
      ? ` (compensated: deactivated stripe product=${stripeProduct.id}` +
        (stripePrice ? `, price=${stripePrice.id}` : "") +
        (dbProductRowId ? `, rolled back billing_products row=${dbProductRowId}` : "") +
        `)`
      : "";

    throw new BillingCatalogWriteError(
      `Failed to persist billing product/price for tenant=${params.tenantId} ` +
        `after creating them in Stripe${compensationNote}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }
}
