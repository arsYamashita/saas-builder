import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

const AFFILIATE_COOKIE_NAME = 'affiliate_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export interface AffiliateSession {
  code: string;
  session_id: string;
  tenant_id: string;
}

export async function trackAffiliateClick(
  code: string,
  tenantId: string,
  request: Request
): Promise<string> {
  const supabase = createClient();
  
  // Validate affiliate code
  const { data: affiliateCode, error } = await supabase
    .from('affiliate_codes')
    .select('*')
    .eq('code', code)
    .eq('tenant_id', tenantId)
    .single();
  
  if (error || !affiliateCode) {
    throw new Error('Invalid affiliate code');
  }
  
  // Generate session ID
  const sessionId = crypto.randomUUID();
  
  // Record click
  await supabase.from('affiliate_clicks').insert({
    tenant_id: tenantId,
    affiliate_code_id: affiliateCode.id,
    ip_address: request.headers.get('x-forwarded-for'),
    user_agent: request.headers.get('user-agent'),
    referrer: request.headers.get('referer'),
    session_id: sessionId,
  });
  
  // Increment click count
  await supabase
    .from('affiliate_codes')
    .update({ 
      click_count: affiliateCode.click_count + 1 
    })
    .eq('id', affiliateCode.id);
  
  // Set cookie
  cookies().set(AFFILIATE_COOKIE_NAME, JSON.stringify({
    code,
    session_id: sessionId,
    tenant_id: tenantId,
  } as AffiliateSession), {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  
  return sessionId;
}

export function getAffiliateSession(): AffiliateSession | null {
  const cookieStore = cookies();
  const cookie = cookieStore.get(AFFILIATE_COOKIE_NAME);
  
  if (!cookie) return null;
  
  try {
    return JSON.parse(cookie.value) as AffiliateSession;
  } catch {
    return null;
  }
}

export function clearAffiliateSession(): void {
  cookies().delete(AFFILIATE_COOKIE_NAME);
}