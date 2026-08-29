import { describe, it, expect, vi } from "vitest";
import {
  createBillingProductAndPrice,
  BillingCatalogWriteError,
  BillingCatalogIdempotentReplayError,
  type BillingCatalogStripeClient,
  type BillingCatalogClient,
} from "../billing-catalog";

// See [[stripe_plan_product_price_no_rollback_on_db_fail]].

function makeStripe(overrides?: Partial<BillingCatalogStripeClient>): {
  stripe: BillingCatalogStripeClient;
  productsCreate: ReturnType<typeof vi.fn>;
  productsUpdate: ReturnType<typeof vi.fn>;
  pricesCreate: ReturnType<typeof vi.fn>;
  pricesUpdate: ReturnType<typeof vi.fn>;
} {
  const productsCreate = vi.fn().mockResolvedValue({ id: "prod_123" });
  const productsUpdate = vi.fn().mockResolvedValue({});
  const pricesCreate = vi.fn().mockResolvedValue({ id: "price_123" });
  const pricesUpdate = vi.fn().mockResolvedValue({});

  return {
    stripe: {
      products: { create: productsCreate, update: productsUpdate },
      prices: { create: pricesCreate, update: pricesUpdate },
      ...overrides,
    } as unknown as BillingCatalogStripeClient,
    productsCreate,
    productsUpdate,
    pricesCreate,
    pricesUpdate,
  };
}

function makeSupabase(opts: {
  productInsertResult?: {
    data: { id: string } | null;
    error: { message: string; code?: string } | null;
  };
  priceInsertResult?: {
    data: { id: string } | null;
    error: { message: string; code?: string } | null;
  };
}) {
  const productInsertResult = opts.productInsertResult ?? {
    data: { id: "db-product-1" },
    error: null,
  };
  const priceInsertResult = opts.priceInsertResult ?? {
    data: { id: "db-price-1" },
    error: null,
  };

  const productSingle = vi.fn().mockResolvedValue(productInsertResult);
  const productSelect = vi.fn().mockReturnValue({ single: productSingle });
  const productInsert = vi.fn().mockReturnValue({ select: productSelect });
  const productDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const productDelete = vi.fn().mockReturnValue({ eq: productDeleteEq });

  const priceSingle = vi.fn().mockResolvedValue(priceInsertResult);
  const priceSelect = vi.fn().mockReturnValue({ single: priceSingle });
  const priceInsert = vi.fn().mockReturnValue({ select: priceSelect });
  const priceDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const priceDelete = vi.fn().mockReturnValue({ eq: priceDeleteEq });

  const from = vi.fn((table: string) => {
    if (table === "billing_products") {
      return { insert: productInsert, delete: productDelete };
    }
    if (table === "billing_prices") {
      return { insert: priceInsert, delete: priceDelete };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    supabase: { from } as unknown as BillingCatalogClient,
    from,
    productInsert,
    productDeleteEq,
    priceInsert,
    priceDeleteEq,
  };
}

const baseParams = {
  tenantId: "tenant-1",
  productName: "Pro Plan",
  productType: "membership",
  amount: 5000,
  idempotencyKey: "billing-catalog:tenant-1:pro-plan:attempt-1",
};

describe("createBillingProductAndPrice", () => {
  it("creates the Stripe product+price and persists both DB rows on the happy path", async () => {
    const { stripe, productsCreate, pricesCreate, productsUpdate, pricesUpdate } = makeStripe();
    const { supabase, productInsert, priceInsert } = makeSupabase({});

    const result = await createBillingProductAndPrice(stripe, supabase, baseParams);

    expect(result).toEqual({
      productId: "prod_123",
      priceId: "price_123",
      dbProductRowId: "db-product-1",
      dbPriceRowId: "db-price-1",
    });
    expect(productsCreate).toHaveBeenCalledTimes(1);
    expect(productsCreate).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: "billing-catalog:tenant-1:pro-plan:attempt-1:product",
    });
    expect(pricesCreate).toHaveBeenCalledTimes(1);
    expect(pricesCreate).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: "billing-catalog:tenant-1:pro-plan:attempt-1:price",
    });
    expect(productInsert).toHaveBeenCalledTimes(1);
    expect(priceInsert).toHaveBeenCalledTimes(1);
    // No compensation on the happy path.
    expect(productsUpdate).not.toHaveBeenCalled();
    expect(pricesUpdate).not.toHaveBeenCalled();
  });

  it("deactivates the Stripe product (no price yet) and throws when prices.create fails", async () => {
    const { stripe, productsUpdate, pricesUpdate } = makeStripe({
      prices: {
        create: vi.fn().mockRejectedValue(new Error("stripe price create failed")),
        update: vi.fn().mockResolvedValue({}),
      },
    } as any);
    const { supabase, productInsert } = makeSupabase({});

    await expect(
      createBillingProductAndPrice(stripe, supabase, baseParams)
    ).rejects.toThrow(BillingCatalogWriteError);

    expect(productsUpdate).toHaveBeenCalledWith("prod_123", { active: false });
    // The DB was never touched — the failure happened before any insert.
    expect(productInsert).not.toHaveBeenCalled();
  });

  it("deactivates BOTH Stripe objects and never leaves an orphan when the billing_products insert fails (THE reproduction of the KB bug)", async () => {
    const { stripe, productsUpdate, pricesUpdate } = makeStripe();
    const { supabase, priceInsert } = makeSupabase({
      productInsertResult: { data: null, error: { message: "db down" } },
    });

    await expect(
      createBillingProductAndPrice(stripe, supabase, baseParams)
    ).rejects.toThrow(BillingCatalogWriteError);

    expect(pricesUpdate).toHaveBeenCalledWith("price_123", { active: false });
    expect(productsUpdate).toHaveBeenCalledWith("prod_123", { active: false });
    // billing_prices was never attempted since billing_products failed first.
    expect(priceInsert).not.toHaveBeenCalled();
  });

  it("rolls back the DB billing_products row AND deactivates both Stripe objects when the billing_prices insert fails", async () => {
    const { stripe, productsUpdate, pricesUpdate } = makeStripe();
    const { supabase, productDeleteEq } = makeSupabase({
      priceInsertResult: { data: null, error: { message: "fk violation" } },
    });

    await expect(
      createBillingProductAndPrice(stripe, supabase, baseParams)
    ).rejects.toThrow(BillingCatalogWriteError);

    expect(productDeleteEq).toHaveBeenCalledWith("id", "db-product-1");
    expect(pricesUpdate).toHaveBeenCalledWith("price_123", { active: false });
    expect(productsUpdate).toHaveBeenCalledWith("prod_123", { active: false });
  });

  it("throws and never calls Stripe when idempotencyKey is empty (mirrors createCheckoutSession's guard)", async () => {
    const { stripe, productsCreate } = makeStripe();
    const { supabase } = makeSupabase({});

    await expect(
      createBillingProductAndPrice(stripe, supabase, {
        ...baseParams,
        idempotencyKey: "",
      })
    ).rejects.toThrow(/idempotencyKey/i);
    expect(productsCreate).not.toHaveBeenCalled();
  });

  it("marks the error message as an ORPHAN DB ROW when the billing_products rollback itself fails (Codex review finding: a resolved { error } must not be swallowed by a bare .catch)", async () => {
    const { stripe, productsUpdate, pricesUpdate } = makeStripe();
    const { supabase, productDeleteEq } = makeSupabase({
      priceInsertResult: { data: null, error: { message: "fk violation" } },
    });
    // billing_products.delete().eq() resolves with an error instead of
    // throwing — the realistic Supabase failure shape.
    productDeleteEq.mockResolvedValue({ error: { message: "delete blocked by trigger" } });

    await expect(
      createBillingProductAndPrice(stripe, supabase, baseParams)
    ).rejects.toThrow(/ORPHAN DB ROW/);

    expect(productDeleteEq).toHaveBeenCalledWith("id", "db-product-1");
    expect(pricesUpdate).toHaveBeenCalledWith("price_123", { active: false });
    expect(productsUpdate).toHaveBeenCalledWith("prod_123", { active: false });
  });

  it("throws BillingCatalogIdempotentReplayError WITHOUT deactivating anything when billing_products insert hits a unique_violation on stripe_product_id (Stripe idempotency-key replay, Codex review round 2 finding)", async () => {
    const { stripe, productsUpdate, pricesUpdate } = makeStripe();
    const { supabase, priceInsert } = makeSupabase({
      productInsertResult: {
        data: null,
        error: {
          message:
            'duplicate key value violates unique constraint "billing_products_stripe_product_id_key"',
          code: "23505",
        },
      },
    });

    await expect(
      createBillingProductAndPrice(stripe, supabase, baseParams)
    ).rejects.toThrow(BillingCatalogIdempotentReplayError);

    // The replayed Stripe objects are legitimate and already in use — must
    // NOT be deactivated.
    expect(productsUpdate).not.toHaveBeenCalled();
    expect(pricesUpdate).not.toHaveBeenCalled();
    expect(priceInsert).not.toHaveBeenCalled();
  });

  it("throws BillingCatalogIdempotentReplayError WITHOUT rolling back billing_products or deactivating anything when billing_prices insert hits a unique_violation on stripe_price_id", async () => {
    const { stripe, productsUpdate, pricesUpdate } = makeStripe();
    const { supabase, productDeleteEq } = makeSupabase({
      priceInsertResult: {
        data: null,
        error: {
          message:
            'duplicate key value violates unique constraint "billing_prices_stripe_price_id_key"',
          code: "23505",
        },
      },
    });

    await expect(
      createBillingProductAndPrice(stripe, supabase, baseParams)
    ).rejects.toThrow(BillingCatalogIdempotentReplayError);

    expect(productDeleteEq).not.toHaveBeenCalled();
    expect(productsUpdate).not.toHaveBeenCalled();
    expect(pricesUpdate).not.toHaveBeenCalled();
  });

  it("still throws the ORIGINAL error even if the compensation call itself fails", async () => {
    const { stripe } = makeStripe({
      products: {
        create: vi.fn().mockResolvedValue({ id: "prod_123" }),
        update: vi.fn().mockRejectedValue(new Error("stripe update also down")),
      },
      prices: {
        create: vi.fn().mockResolvedValue({ id: "price_123" }),
        update: vi.fn().mockRejectedValue(new Error("stripe update also down")),
      },
    } as any);
    const { supabase } = makeSupabase({
      productInsertResult: { data: null, error: { message: "db down" } },
    });

    await expect(
      createBillingProductAndPrice(stripe, supabase, baseParams)
    ).rejects.toThrow(/db down/);
  });
});
