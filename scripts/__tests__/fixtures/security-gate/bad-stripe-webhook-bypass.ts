import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@saas/payments";

export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const signature = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();

  // Intentional fixture violation: constructs the webhook event directly
  // instead of verifyWebhookSignature() from @saas/payments — should
  // trigger `no-stripe-bypass` (no guaranteed signature verification).
  const event = stripe.webhooks.constructEvent(payload, signature, "whsec_x");

  return NextResponse.json({ received: true, type: event.type });
}
