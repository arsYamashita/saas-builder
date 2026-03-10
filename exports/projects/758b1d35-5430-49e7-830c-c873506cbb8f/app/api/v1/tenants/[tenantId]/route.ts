import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/api/middleware/tenant-context';
import { hasPermission } from '@/lib/types/permissions';
import { db } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  return withTenantContext(req, async (req, context) => {
    const tenant = await db
      .selectFrom('tenants')
      .where('id', '=', params.tenantId)
      .selectAll()
      .executeTakeFirst();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json(tenant);
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  return withTenantContext(req, async (req, context) => {
    if (!hasPermission(context.role, 'settings:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { name, branding_logo_url, commission_rate } = body;

    const updated = await db
      .updateTable('tenants')
      .set({
        name,
        branding_logo_url,
        commission_rate,
      })
      .where('id', '=', params.tenantId)
      .returningAll()
      .executeTakeFirst();

    return NextResponse.json(updated);
  });
}