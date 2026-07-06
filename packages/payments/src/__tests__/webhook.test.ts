import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { verifyWebhookSignature } from "../webhook";

// See [[stripe_webhook_signature_missing]] — this package's public webhook
// API must be impossible to call in a way that skips signature verification.

function makeFakeStripe(constructEvent: (...args: unknown[]) => unknown) {
  return {
    webhooks: { constructEvent },
  } as unknown as Stripe;
}

describe("verifyWebhookSignature", () => {
  it("forwards payload/signature/secret to stripe.webhooks.constructEvent", () => {
    const fakeEvent = { type: "checkout.session.completed" };
    const constructEvent = vi.fn().mockReturnValue(fakeEvent);
    const stripe = makeFakeStripe(constructEvent);

    const event = verifyWebhookSignature(
      stripe,
      "raw-body",
      "sig_abc",
      "whsec_test"
    );

    expect(constructEvent).toHaveBeenCalledWith(
      "raw-body",
      "sig_abc",
      "whsec_test"
    );
    expect(event).toBe(fakeEvent);
  });

  it("propagates the underlying Stripe signature error (never swallows it)", () => {
    const constructEvent = vi.fn().mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });
    const stripe = makeFakeStripe(constructEvent);

    expect(() =>
      verifyWebhookSignature(stripe, "raw-body", "bad-sig", "whsec_test")
    ).toThrow(/no signatures found/i);
  });

  it("throws without calling Stripe when signature is an empty string", () => {
    const constructEvent = vi.fn();
    const stripe = makeFakeStripe(constructEvent);

    expect(() =>
      verifyWebhookSignature(stripe, "raw-body", "", "whsec_test")
    ).toThrow(/signature/i);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("throws without calling Stripe when webhookSecret is an empty string", () => {
    const constructEvent = vi.fn();
    const stripe = makeFakeStripe(constructEvent);

    expect(() =>
      verifyWebhookSignature(stripe, "raw-body", "sig_abc", "")
    ).toThrow(/webhookSecret/i);
    expect(constructEvent).not.toHaveBeenCalled();
  });
});
