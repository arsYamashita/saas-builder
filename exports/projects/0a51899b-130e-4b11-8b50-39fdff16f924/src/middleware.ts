import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref');
  
  if (ref) {
    const response = NextResponse.next();
    
    // Set affiliate cookie (7 days)
    response.cookies.set('affiliate_ref', ref, {
      maxAge: 7 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    // Track click async
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/affiliate/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        affiliate_code: ref,
        salon_slug: request.nextUrl.pathname.split('/')[1],
        referrer_url: request.headers.get('referer'),
        user_agent: request.headers.get('user-agent')
      })
    }).catch(console.error);

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:salonSlug*'
};