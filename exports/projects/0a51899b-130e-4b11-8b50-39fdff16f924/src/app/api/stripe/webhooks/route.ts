import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = headers().get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createClient();

  // Log event
  await supabase.from('webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
    payload: event.data.object
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
    }

    // Mark as processed
    await supabase
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('event_id', event.id);

    return NextResponse.json({ received: true });
  } catch (error: any) {
    await supabase
      .from('webhook_events')
      .update({ 
        error_message: error.message,
        retry_count: supabase.raw('retry_count + 1')
      })
      .eq('event_id', event.id);

    throw error;
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const supabase = createClient();
  
  const salonId = session.metadata?.salon_id;
  const userId = session.metadata?.user_id;
  const affiliateCode = session.metadata?.affiliate_code;
  const planId = session.metadata?.plan_id;

  if (!salonId || !userId) return;

  // Create or update member
  const { data: member } = await supabase
    .from('salon_members')
    .upsert({
      salon_id: salonId,
      user_id: userId,
      role: 'member',
      subscription_id: session.subscription as string,
      customer_id: session.customer as string,
      plan_id: planId,
      subscription_status: 'active'
    }, { onConflict: 'salon_id,user_id' })
    .select()
    .single();

  // Track affiliate conversion
  if (affiliateCode && member) {
    const { data: referrer } = await supabase
      .from('salon_members')
      .select('id')
      .eq('salon_id', salonId)
      .eq('affiliate_code', affiliateCode)
      .single();

    if (referrer) {
      const { data: plan } = await supabase
        .from('plans')
        .select('price')
        .eq('id', planId)
        .single();

      const { data: salon } = await supabase
        .from('salons')
        .select('settings')
        .eq('id', salonId)
        .single();

      const affiliateRate = salon?.settings?.affiliate_rate || 20;
      const commissionAmount = Math.floor((plan.price * affiliateRate) / 100);

      await supabase.from('affiliate_conversions').insert({
        salon_id: salonId,
        referrer_member_id: referrer.id,
        referred_user_id: userId,
        subscription_id: session.subscription as string,
        commission_amount: commissionAmount,
        commission_rate: affiliateRate,
        commission_status: 'pending'
      });
    }
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const supabase = createClient();

  await supabase
    .from('salon_members')
    .update({
      subscription_status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end
    })
    .eq('subscription_id', subscription.id);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabase = createClient();

  await supabase
    .from('salon_members')
    .update({
      subscription_status: 'canceled',
      left_at: new Date().toISOString()
    })
    .eq('subscription_id', subscription.id);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const supabase = createClient();

  await supabase
    .from('salon_members')
    .update({
      current_period_end: new Date((invoice as any).lines.data[0].period.end * 1000).toISOString()
    })
    .eq('subscription_id', invoice.subscription as string);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const supabase = createClient();

  await supabase
    .from('salon_members')
    .update({
      subscription_status: 'past_due'
    })
    .eq('subscription_id', invoice.subscription as string);
}