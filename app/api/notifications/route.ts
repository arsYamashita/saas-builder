import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/db/supabase/server'

const PAGE_SIZE = 20

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const type   = searchParams.get('type')   // billing | project | system | null (all)
  const limit  = parseInt(searchParams.get('limit') ?? String(PAGE_SIZE), 10)
  const from   = (page - 1) * limit
  const to     = from + limit - 1

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (type && ['billing', 'project', 'system'].includes(type)) {
    query = query.eq('type', type)
  }

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    notifications: data ?? [],
    total: count ?? 0,
    page,
    pageSize: limit,
    hasMore: (count ?? 0) > to + 1,
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // bulk: { ids: string[] }  — mark specific IDs read
  // single toggle: { id: string, is_read: boolean }
  if (body.ids) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', body.ids)
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.id !== undefined && body.is_read !== undefined) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: body.is_read })
      .eq('id', body.id)
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
}
