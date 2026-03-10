import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'kysely';

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const { code } = params;

  // 1. Find affiliate link
  const link = await db
    .selectFrom('affiliate_links')
    .where('code', '=', code)
    .selectAll()
    .executeTakeFirst();

  if (!link) {
    return NextResponse.redirect(new URL('/404', req.url));
  }

  // 2. Generate visitor ID or retrieve from cookie
  const visitorId = req.cookies.get('visitor_id')?.value ?? uuidv4();

  // 3. Record click
  const clickedAt = new Date();
  const expiresAt = new Date(clickedAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db
    .insertInto('affiliate_clicks')
    .values({
      id: uuidv4(),
      affiliate_link_id: link.id,
      tenant_id: link.tenant_id,
      visitor_id: visitorId,
      ip_address: req.ip || null,
      user_agent: req.headers.get('user-agent'),
      referer: req.headers.get('referer'),
      clicked_at: clickedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .execute();

  // 4. Update click count
  await db
    .updateTable('affiliate_links')
    .set({ clicks: sql`clicks + 1` })
    .where('id', '=', link.id)
    .execute();

  // 5. Get tenant slug for redirect
  const tenant = await db
    .selectFrom('tenants')
    .where('id', '=', link.tenant_id)
    .select('slug')
    .executeTakeFirst();

  if (!tenant) {
    return NextResponse.redirect(new URL('/404', req.url));
  }

  // 6. Set cookies and redirect
  const redirectUrl = new URL(`/${tenant.slug}`, req.url);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set('visitor_id', visitorId, {
    maxAge: 7 * 86400,
    httpOnly: true,
    sameSite: 'lax',
  });

  response.cookies.set('affiliate_code', code, {
    maxAge: 7 * 86400,
    httpOnly: true,
    sameSite: 'lax',
  });

  return response;
}