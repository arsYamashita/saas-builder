import Stripe from 'stripe';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { processAffiliateConversion } from './affiliate-conversion';

export async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;

  // Extract metadata
  const { user_id, tenant_id, plan_id, affiliate_code } = session.metadata || {};

  if (!user_id || !tenant_id || !plan_id) {
    throw new Error('Missing required metadata in checkout session');
  }

  // 1. Retrieve subscription from Stripe
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16',
  });

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );

  // 2. Create subscription record
  await db
    .insertInto('subscriptions')
    .values({
      id: uuidv4(),
      user_id,
      tenant_id,
      plan_id,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: session.customer as string,
      status: subscription.status as any,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: false,
    })
    .execute();

  // 3. Assign member role
  await db
    .insertInto('user_roles')
    .values({
      id: uuidv4(),
      user_id,
      tenant_id,
      role: 'member',
    })
    .onConflict((oc) => oc.columns(['user_id', 'tenant_id']).doNothing())
    .execute();

  // 4. Handle affiliate conversion if applicable
  if (affiliate_code) {
    await processAffiliateConversion({
      affiliate_code,
      subscription_id: subscription.id,
      tenant_id,
      amount: subscription.items.data[0].price.unit_amount || 0,
    });
  }
}

export async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;

  await db
    .updateTable('subscriptions')
    .set({
      status: subscription.status as any,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
    })
    .where('stripe_subscription_id', '=', subscription.id)
    .execute();
}

export async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;

  await db
    .updateTable('subscriptions')
    .set({
      status: 'canceled',
    })
    .where('stripe_subscription_id', '=', subscription.id)
    .execute();

  // Optionally remove member role
  const sub = await db
    .selectFrom('subscriptions')
    .where('stripe_subscription_id', '=', subscription.id)
    .select(['user_id', 'tenant_id'])
    .executeTakeFirst();

  if (sub) {
    await db
      .deleteFrom('user_roles')
      .where('user_id', '=', sub.user_id)
      .where('tenant_id', '=', sub.tenant_id)
      .where('role', '=', 'member')
      .execute();
  }
}