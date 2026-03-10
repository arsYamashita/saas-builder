import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { handleCheckoutCompleted, handleSubscriptionUpdated, handleSubscriptionDeleted } from '@/lib/stripe/webhook-handlers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const STRIPE_EVENTS = {
  'checkout.session.completed': handleCheckoutCompleted,
  'customer.subscription.updated': handleSubscriptionUpdated,
  'customer.subscription.deleted': handleSubscriptionDeleted,
} as const;

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    // 1. Verify webhook signature
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    );
  }

  // 2. Idempotency check
  const existingEvent = await db
    .selectFrom('stripe_webhook_events')
    .where('stripe_event_id', '=', event.id)
    .selectAll()
    .executeTakeFirst();

  if (existingEvent?.processed) {
    return NextResponse.json({ received: true });
  }

  // 3. Store event
  await db
    .insertInto('stripe_webhook_events')
    .values({
      id: uuidv4(),
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event.data as any,
      received_at: new Date().toISOString(),
      processed: false,
    })
    .execute();

  // 4. Process event
  try {
    const handler = STRIPE_EVENTS[event.type as keyof typeof STRIPE_EVENTS];
    if (handler) {
      await handler(event);
    }

    // Mark as processed
    await db
      .updateTable('stripe_webhook_events')
      .set({ processed: true, processed_at: new Date().toISOString() })
      .where('stripe_event_id', '=', event.id)
      .execute();
  } catch (error: any) {
    // Log error but don't fail webhook
    await db
      .updateTable('stripe_webhook_events')
      .set({ processing_error: error.message })
      .where('stripe_event_id', '=', event.id)
      .execute();
  }

  return NextResponse.json({ received: true });
}