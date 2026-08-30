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

/**
 * Thrown instead of the generic `BillingCatalogWriteError` when a DB
 * insert fails with a unique_violation that looks like a Stripe
 * idempotency-key replay recording an object that's already there (see
 * `isUniqueViolationOn`'s doc comment) — deliberately NOT compensated
 * (Stripe objects are left alone, no DB rollback attempted), since the
 * object in question is a legitimate, already-recorded one, not an
 * orphan. The caller should treat this as "investigate, don't auto-heal":
 * log it and check whether the existing `billing_products`/
 * `billing_prices` row already matches what this call intended to create.
 */
export class BillingCatalogIdempotentReplayError extends BillingCatalogWriteError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "BillingCatalogIdempotentReplayError";
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
 * lightweight fake. `create()` takes Stripe's `requestOptions` second
 * argument (idempotency key) — `update()` doesn't need one: setting
 * `active: false` twice has the same effect either way, so a retried
 * compensation call is naturally idempotent without one. */
export interface BillingCatalogStripeClient {
  products: {
    create(
      params: Record<string, unknown>,
      requestOptions?: { idempotencyKey?: string }
    ): Promise<StripeProductLike>;
    update(id: string, params: Record<string, unknown>): Promise<unknown>;
  };
  prices: {
    create(
      params: Record<string, unknown>,
      requestOptions?: { idempotencyKey?: string }
    ): Promise<StripePriceLike>;
    update(id: string, params: Record<string, unknown>): Promise<unknown>;
  };
}

/** `code` carries the Postgres error code (e.g. `"23505"` for
 * unique_violation) when the caller's client surfaces it — used to detect
 * "this insert failed because a Stripe idempotency-key replay handed back
 * an object that's already recorded" (see the `isUniqueViolationOn` note
 * below), as distinct from a genuine, unrelated DB failure. */
type InsertError = { message: string; code?: string };

type InsertResult = Promise<{
  data: { id: string } | null;
  error: InsertError | null;
}>;

/** Minimal Supabase-admin-client surface this function needs. */
export interface BillingCatalogClient {
  from(table: "billing_products" | "billing_prices"): {
    insert(row: Record<string, unknown>): {
      select(columns: string): { single(): InsertResult };
    };
    delete(): {
      eq(column: string, value: string): Promise<{ error: InsertError | null }>;
    };
  };
}

const POSTGRES_UNIQUE_VIOLATION = "23505";

/**
 * True when `error` is a Postgres unique_violation whose message/constraint
 * name mentions `column`. Used to recognize "this insert failed because
 * the row already exists" — the expected shape of a Stripe idempotency-key
 * REPLAY (see `idempotencyKey` doc comment below): a retried call after a
 * lost response gets the SAME Stripe product/price id back from Stripe,
 * then hits this DB's UNIQUE constraint on `stripe_product_id`/
 * `stripe_price_id` on the (successful) re-insert attempt. That is NOT a
 * "creation failed" case — the object is legitimately active and already
 * recorded — so it must be handled differently from a genuine failure
 * (never auto-deactivate it; see the call sites below). Codex review
 * round 2 finding on PR #60: a bare `throw` here previously fell into the
 * generic compensation path and deactivated a perfectly good, in-use
 * Stripe object on every retry after the first successful attempt.
 */
function isUniqueViolationOn(error: InsertError | null, column: string): boolean {
  return Boolean(
    error &&
      error.code === POSTGRES_UNIQUE_VIOLATION &&
      error.message.includes(column)
  );
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
  /**
   * REQUIRED, stable per-attempt idempotency key (e.g. from
   * `buildIdempotencyKey`) — without it, a client-side retry or network
   * timeout on this call can create a second Stripe Product+Price pair
   * even though the first attempt actually succeeded server-side. This
   * function derives two distinct Stripe idempotency keys from it
   * (`${idempotencyKey}:product` / `${idempotencyKey}:price`) — reusing
   * the exact same key for both calls would make Stripe treat the price
   * creation as a replay of the product creation and return the wrong
   * object. See [[stripe_checkout_idempotency_key_missing]] (the same
   * class of bug, applied to plan/price creation instead of checkout).
   */
  idempotencyKey: string;
}

async function deactivateStripeObjects(
  stripe: BillingCatalogStripeClient,
  ids: { productId?: string; priceId?: string }
): Promise<void> {
  // Price must be deactivated before/independent of the product — order
  // doesn't matter to Stripe, but we run both and swallow individual
  // failures so one compensation failure doesn't block the other.
  if (ids.priceId) {
    await stripe.prices.update(ids.priceId, { active: false }).catch((err) => {
      console.error("[billing-catalog] failed to deactivate price:", err);
    });
  }
  if (ids.productId) {
    await stripe.products.update(ids.productId, { active: false }).catch((err) => {
      console.error("[billing-catalog] failed to deactivate product:", err);
    });
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
  if (!params.idempotencyKey || !params.idempotencyKey.trim()) {
    throw new Error(
      "createBillingProductAndPrice requires a non-empty idempotencyKey — " +
        "see buildIdempotencyKey."
    );
  }

  const currency = params.currency ?? "jpy";
  let stripeProduct: StripeProductLike | null = null;
  let stripePrice: StripePriceLike | null = null;
  let dbProductRowId: string | null = null;
  let dbRollbackFailed = false;

  try {
    stripeProduct = await stripe.products.create(
      {
        name: params.productName,
        metadata: { tenant_id: params.tenantId },
      },
      { idempotencyKey: `${params.idempotencyKey}:product` }
    );

    stripePrice = await stripe.prices.create(
      {
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
      },
      { idempotencyKey: `${params.idempotencyKey}:price` }
    );

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

    if (isUniqueViolationOn(productError, "stripe_product_id")) {
      throw new BillingCatalogIdempotentReplayError(
        `billing_products insert hit a UNIQUE violation on stripe_product_id=${stripeProduct.id} ` +
          `for tenant=${params.tenantId} — this looks like a Stripe idempotency-key replay of an ` +
          `already-recorded product (NOT deactivating it; investigate the existing billing_products ` +
          `row for stripe_product_id=${stripeProduct.id} instead of retrying blindly): ` +
          `${productError!.message}`,
        productError
      );
    }

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

      if (isUniqueViolationOn(priceError, "stripe_price_id")) {
        // Same idempotent-replay situation as the product check above,
        // but on the price. Do NOT roll back the billing_products row we
        // just inserted (it's a legitimate row for a legitimate product)
        // and do NOT deactivate either Stripe object — both are real,
        // already-recorded objects; only the DB write hit a replay.
        throw new BillingCatalogIdempotentReplayError(
          `billing_prices insert hit a UNIQUE violation on stripe_price_id=${stripePrice.id} ` +
            `for tenant=${params.tenantId} — this looks like a Stripe idempotency-key replay of an ` +
            `already-recorded price (NOT rolling back billing_products row=${productRow.id} or ` +
            `deactivating either Stripe object; investigate the existing billing_prices row for ` +
            `stripe_price_id=${stripePrice.id} instead): ${priceError!.message}`,
          priceError
        );
      }

      if (priceError || !data) {
        throw new Error(
          priceError?.message ?? "billing_prices insert returned no row"
        );
      }
      priceRow = data;
    } catch (priceInsertErr) {
      if (priceInsertErr instanceof BillingCatalogIdempotentReplayError) {
        throw priceInsertErr;
      }

      // Partial DB failure: billing_products committed but billing_prices
      // didn't. Roll back the orphaned product row rather than leaving a
      // product-with-no-price row behind.
      //
      // Supabase's delete resolves with `{ error }` on failure — it does
      // NOT normally reject the promise — so a bare `.catch(() => {})`
      // silently ignores a real rollback failure and the outer catch
      // below would then claim "rolled back" when it wasn't (Codex review
      // finding). Check the returned `error` explicitly; also still catch
      // a thrown rejection (network failure) for the same reason
      // `lib/audit/write-audit-log.ts`'s `safeInsert` does.
      const rollbackResult = await supabase
        .from("billing_products")
        .delete()
        .eq("id", productRow.id)
        .catch((thrown) => ({
          error: {
            message: thrown instanceof Error ? thrown.message : String(thrown),
          },
        }));
      if (rollbackResult.error) {
        dbRollbackFailed = true;
      }
      throw priceInsertErr;
    }

    return {
      productId: stripeProduct.id,
      priceId: stripePrice.id,
      dbProductRowId: productRow.id,
      dbPriceRowId: priceRow.id,
    };
  } catch (err) {
    if (err instanceof BillingCatalogIdempotentReplayError) {
      // Deliberately skip all compensation — see the class doc comment
      // and the throw sites above for why.
      throw err;
    }

    await deactivateStripeObjects(stripe, {
      productId: stripeProduct?.id,
      priceId: stripePrice?.id,
    });

    const dbRowNote = dbProductRowId
      ? dbRollbackFailed
        ? `, FAILED to roll back billing_products row=${dbProductRowId} ` +
          `(ORPHAN DB ROW — requires manual cleanup, check billing_products.id=${dbProductRowId})`
        : `, rolled back billing_products row=${dbProductRowId}`
      : "";

    const compensationNote = stripeProduct
      ? ` (compensated: deactivated stripe product=${stripeProduct.id}` +
        (stripePrice ? `, price=${stripePrice.id}` : "") +
        dbRowNote +
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
