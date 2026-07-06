import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@saas/payments";

export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  // Intentional fixture violation: calls the Stripe SDK directly instead of
  // createCheckoutSession() from @saas/payments — should trigger
  // `no-stripe-bypass` (no idempotency key enforcement).
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [],
  });

  return NextResponse.json({ url: session.url });
}
