import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { createCheckoutSession } from "../checkout";

// See [[stripe_checkout_idempotency_key_missing]] — this package's public
// checkout API must be impossible to call without an idempotency key.

function makeFakeStripe(create: (...args: unknown[]) => unknown) {
  return {
    checkout: { sessions: { create } },
  } as unknown as Stripe;
}

describe("createCheckoutSession", () => {
  it("forwards params and idempotencyKey to stripe.checkout.sessions.create", async () => {
    const create = vi.fn().mockResolvedValue({ url: "https://stripe.test/x" });
    const stripe = makeFakeStripe(create);

    const params = { mode: "subscription" } as Stripe.Checkout.SessionCreateParams;
    const result = await createCheckoutSession(stripe, params, "checkout:u1:p1");

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(params, {
      idempotencyKey: "checkout:u1:p1",
    });
    expect(result).toEqual({ url: "https://stripe.test/x" });
  });

  it("throws and never calls Stripe when idempotencyKey is an empty string", async () => {
    const create = vi.fn();
    const stripe = makeFakeStripe(create);

    await expect(
      createCheckoutSession(
        stripe,
        {} as Stripe.Checkout.SessionCreateParams,
        ""
      )
    ).rejects.toThrow(/idempotencyKey/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("throws and never calls Stripe when idempotencyKey is whitespace-only", async () => {
    const create = vi.fn();
    const stripe = makeFakeStripe(create);

    await expect(
      createCheckoutSession(
        stripe,
        {} as Stripe.Checkout.SessionCreateParams,
        "   "
      )
    ).rejects.toThrow(/idempotencyKey/i);
    expect(create).not.toHaveBeenCalled();
  });
});
