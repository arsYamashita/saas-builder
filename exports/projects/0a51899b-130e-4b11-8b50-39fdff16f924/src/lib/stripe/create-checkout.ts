import Stripe from 'stripe';
import { cookies } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

export async function createCheckoutSession({
  salonId,
  userId,
  planId,
  priceId
}: {
  salonId: string;
  userId: string;
  planId: string;
  priceId: string;
}) {
  const affiliateCode = cookies().get('affiliate_ref')?.value;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/salons/${salonId}/welcome`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/salons/${salonId}/plans`,
    metadata: {
      salon_id: salonId,
      user_id: userId,
      plan_id: planId,
      ...(affiliateCode && { affiliate_code: affiliateCode })
    },
    subscription_data: {
      metadata: {
        salon_id: salonId,
        user_id: userId
      }
    }
  });

  return session;
}