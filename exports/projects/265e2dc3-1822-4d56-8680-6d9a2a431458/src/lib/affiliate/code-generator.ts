import { customAlphabet } from 'nanoid';
import { createClient } from '@/lib/supabase/server';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

export async function generateAffiliateCode(
  tenantId: string,
  userId: string
): Promise<string> {
  const supabase = createClient();
  let code: string;
  let exists = true;
  
  // Generate unique code
  while (exists) {
    code = nanoid();
    const { data } = await supabase
      .from('affiliate_codes')
      .select('id')
      .eq('code', code)
      .single();
    exists = !!data;
  }
  
  // Insert new affiliate code
  const { error } = await supabase
    .from('affiliate_codes')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      code,
    });
  
  if (error) {
    throw new Error('Failed to create affiliate code');
  }
  
  return code;
}