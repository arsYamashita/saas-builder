import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/api/middleware/tenant-context';
import { hasPermission } from '@/lib/types/permissions';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
  req: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  return withTenantContext(req, async (req, context) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const contentType = searchParams.get('content_type');

    let query = db
      .selectFrom('contents')
      .where('tenant_id', '=', params.tenantId)
      .selectAll();

    // Members can only see published content
    if (context.role === 'member') {
      query = query.where('status', '=', 'published');
    } else {
      // Owner/Admin can filter by status
      if (status) {
        query = query.where('status', '=', status as 'draft' | 'published');
      }
    }

    if (contentType) {
      query = query.where('content_type', '=', contentType as any);
    }

    const contents = await query.orderBy('created_at', 'desc').execute();

    return NextResponse.json(contents);
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  return withTenantContext(req, async (req, context) => {
    if (!hasPermission(context.role, 'contents:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { title, body: contentBody, content_type, cover_image_url } = body;

    const content = await db
      .insertInto('contents')
      .values({
        id: uuidv4(),
        tenant_id: params.tenantId,
        author_id: context.user.id,
        title,
        body: contentBody,
        content_type,
        cover_image_url,
        status: 'draft',
      })
      .returningAll()
      .executeTakeFirst();

    return NextResponse.json(content, { status: 201 });
  });
}