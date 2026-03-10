import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function handleCheckoutSessionCompleted(
  event: Stripe.Event
) {
  const session = event.data.object as Stripe.Checkout.Session;
  const supabase = createClient();
  
  // Extract metadata
  const tenantId = session.metadata?.tenant_id;
  const planId = session.metadata?.plan_id;
  const userId = session.metadata?.user_id;
  const affiliateCode = session.metadata?.affiliate_code;
  
  if (!tenantId || !planId || !userId) {
    throw new Error('Missing required metadata');
  }
  
  // Get subscription from Stripe
  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );
  
  // Create subscription record
  const { data: newSubscription } = await supabase
    .from('subscriptions')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      plan_id: planId,
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .select()
    .single();
  
  if (!newSubscription) {
    throw new Error('Failed to create subscription');
  }
  
  // Update tenant_user role to 'member' if not already
  await supabase
    .from('tenant_users')
    .update({ role: 'member', status: 'active' })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  
  // Handle affiliate conversion if code exists
  if (affiliateCode) {
    const { data: affiliateCodeRecord } = await supabase
      .from('affiliate_codes')
      .select('*')
      .eq('code', affiliateCode)
      .single();
    
    if (affiliateCodeRecord) {
      // Create conversion
      const { data: conversion } = await supabase
        .from('affiliate_conversions')
        .insert({
          tenant_id: tenantId,
          affiliate_code_id: affiliateCodeRecord.id,
          affiliate_user_id: affiliateCodeRecord.user_id,
          referred_user_id: userId,
          subscription_id: newSubscription.id,
          plan_id: planId,
        })
        .select()
        .single();
      
      // Get plan for commission calculation
      const { data: plan } = await supabase
        .from('plans')
        .select('*')
        .eq('id', planId)
        .single();
      
      if (plan && conversion) {
        const subscriptionAmount = subscription.items.data[0].price.unit_amount! / 100;
        const commissionAmount = Math.floor(
          subscriptionAmount * (plan.commission_rate / 100)
        );
        
        // Create commission
        await supabase.from('commissions').insert({
          tenant_id: tenantId,
          affiliate_user_id: affiliateCodeRecord.user_id,
          conversion_id: conversion.id,
          plan_id: planId,
          subscription_amount: subscriptionAmount,
          commission_rate: plan.commission_rate,
          amount: commissionAmount,
          status: 'pending',
        });
        
        // Update affiliate code stats
        await supabase
          .from('affiliate_codes')
          .update({
            conversion_count: affiliateCodeRecord.conversion_count + 1,
            total_commission: affiliateCodeRecord.total_commission + commissionAmount,
          })
          .eq('id', affiliateCodeRecord.id);
      }
    }
  }
  
  // Send notification
  await supabase.from('notifications').insert({
    tenant_id: tenantId,
    user_id: userId,
    type: 'subscription_created',
    title: 'サブスクリプション開始',
    message: 'サブスクリプションへの登録が完了しました',
  });
}

export async function handleSubscriptionUpdated(
  event: Stripe.Event
) {
  const subscription = event.data.object as Stripe.Subscription;
  const supabase = createClient();
  
  await supabase
    .from('subscriptions')
    .update({
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at 
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : null,
    })
    .eq('stripe_subscription_id', subscription.id);
}

export async function handleSubscriptionDeleted(
  event: Stripe.Event
) {
  const subscription = event.data.object as Stripe.Subscription;
  const supabase = createClient();
  
  const { data: sub } = await supabase
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('stripe_subscription_id', subscription.id)
    .select()
    .single();
  
  if (sub) {
    await supabase.from('notifications').insert({
      tenant_id: sub.tenant_id,
      user_id: sub.user_id,
      type: 'subscription_expired',
      title: 'サブスクリプション終了',
      message: 'サブスクリプションが終了しました',
    });
  }
}

export async function handleInvoicePaymentFailed(
  event: Stripe.Event
) {
  const invoice = event.data.object as Stripe.Invoice;
  const supabase = createClient();
  
  const { data: sub } = await supabase
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', invoice.subscription as string)
    .select()
    .single();
  
  if (sub) {
    await supabase.from('notifications').insert({
      tenant_id: sub.tenant_id,
      user_id: sub.user_id,
      type: 'payment_failed',
      title: '決済失敗',
      message: 'お支払いに失敗しました。カード情報をご確認ください',
      link: '/subscription/billing',
    });
  }
}