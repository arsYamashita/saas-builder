import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function processAffiliateConversion({
  affiliate_code,
  subscription_id,
  tenant_id,
  amount,
}: {
  affiliate_code: string;
  subscription_id: string;
  tenant_id: string;
  amount: number;
}) {
  // 1. Find affiliate link
  const link = await db
    .selectFrom('affiliate_links')
    .where('code', '=', affiliate_code)
    .where('tenant_id', '=', tenant_id)
    .selectAll()
    .executeTakeFirst();

  if (!link) {
    console.warn(`Affiliate link not found for code: ${affiliate_code}`);
    return;
  }

  // 2. Get tenant commission rate
  const tenant = await db
    .selectFrom('tenants')
    .where('id', '=', tenant_id)
    .select('commission_rate')
    .executeTakeFirst();

  if (!tenant) {
    console.warn(`Tenant not found: ${tenant_id}`);
    return;
  }

  // 3. Calculate commission (percentage of first payment)
  const commissionAmount = Math.floor(amount * (tenant.commission_rate / 100));

  // 4. Check if conversion already exists
  const existing = await db
    .selectFrom('affiliate_conversions')
    .where('affiliate_link_id', '=', link.id)
    .where('subscription_id', '=', subscription_id)
    .executeTakeFirst();

  if (existing) {
    console.warn(`Conversion already exists for subscription: ${subscription_id}`);
    return;
  }

  // 5. Create conversion record
  await db
    .insertInto('affiliate_conversions')
    .values({
      id: uuidv4(),
      affiliate_link_id: link.id,
      subscription_id,
      tenant_id,
      commission_amount: commissionAmount,
      status: 'pending',
      converted_at: new Date().toISOString(),
    })
    .execute();

  // 6. Send notification to affiliate (implementation dependent)
  // await sendAffiliateNotification(link.user_id, commissionAmount);
}