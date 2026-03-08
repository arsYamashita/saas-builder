import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

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

  const supabase = await createClient();

  // Idempotency check
  const { data: existingEvent } = await supabase
    .from('stripe_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .single();

  if (existingEvent) {
    return NextResponse.json({ received: true });
  }

  // Log event
  await supabase.from('stripe_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event.data.object,
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
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
    }

    await supabase
      .from('stripe_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('stripe_event_id', event.id);
  } catch (error: any) {
    await supabase
      .from('stripe_events')
      .update({ processing_error: error.message })
      .eq('stripe_event_id', event.id);
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Implementation for creating subscription, tenant_user, and commission
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  // Implementation for updating subscription status
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // Implementation for cancellation
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  // Implementation for payment success
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  // Implementation for payment failure
}