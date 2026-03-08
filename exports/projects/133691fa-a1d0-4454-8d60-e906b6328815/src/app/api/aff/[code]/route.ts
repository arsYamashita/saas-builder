import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const { code } = params;
  const supabase = await createClient();

  // Lookup affiliate link
  const { data: affiliateLink, error } = await supabase
    .from('affiliate_links')
    .select('id, tenant_id, is_active')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (error || !affiliateLink) {
    return NextResponse.json(
      { error: 'Invalid affiliate code' },
      { status: 404 }
    );
  }

  // Record click
  const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent');
  const referrer = request.headers.get('referer');

  await supabase.from('affiliate_clicks').insert({
    affiliate_link_id: affiliateLink.id,
    ip_address: ipAddress,
    user_agent: userAgent,
    referrer: referrer,
  });

  // Increment clicks counter
  await supabase.rpc('increment_affiliate_clicks', {
    link_id: affiliateLink.id,
  });

  // Get redirect URL from query params or default to tenant plans page
  const redirectUrl =
    request.nextUrl.searchParams.get('redirect') || '/plans';

  // Set 30-day attribution cookie
  const response = NextResponse.redirect(new URL(redirectUrl, request.url));
  response.cookies.set('aff_code', code, {
    maxAge: 2592000, // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  return response;
}