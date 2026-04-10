import Stripe from 'stripe';

export interface CheckoutParams {
  priceId: string;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export async function createCheckoutSession(params: CheckoutParams): Promise<Stripe.Checkout.Session> {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer: params.customerId,
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  });
}
