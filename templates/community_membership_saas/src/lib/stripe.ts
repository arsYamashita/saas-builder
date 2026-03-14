// ============================================================
// community_membership_saas v1 — Stripe Client
// ============================================================

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing");

  _stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" });
  return _stripe;
}
