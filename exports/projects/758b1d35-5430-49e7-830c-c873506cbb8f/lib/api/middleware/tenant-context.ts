import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { db } from '@/lib/db';
import { TenantContext } from '@/lib/types/permissions';

type TenantContextHandler = (
  req: NextRequest,
  context: TenantContext
) => Promise<NextResponse>;

export async function withTenantContext(
  req: NextRequest,
  handler: TenantContextHandler
): Promise<NextResponse> {
  // Get user from Supabase session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Extract tenantId from route params
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const tenantIdIndex = pathParts.indexOf('tenants') + 1;
  const tenantId = pathParts[tenantIdIndex];

  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
  }

  // Verify user has access to tenant
  const userRole = await db
    .selectFrom('user_roles')
    .where('user_id', '=', user.id)
    .where('tenant_id', '=', tenantId)
    .selectAll()
    .executeTakeFirst();

  if (!userRole) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Call handler with context
  return handler(req, {
    user: {
      id: user.id,
      email: user.email!,
    },
    tenantId,
    role: userRole.role,
  });
}