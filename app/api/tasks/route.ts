import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') ?? 'open'
  const urgency = searchParams.get('urgency')
  const key = searchParams.get('key')
  const kind = searchParams.get('kind')

  const db = getServiceClient()
  let q = db.from('tasks').select('*').eq('user_id', USER_ID).eq('status', status)

  if (urgency) q = q.eq('urgency', urgency)
  if (key === 'true') q = q.eq('is_key', true)
  if (kind) q = q.eq('kind', kind)

  const { data, error } = await q.order('priority_score', { ascending: false }).limit(100)
  if (error) {
    console.error('Tasks GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = getServiceClient()

  // Quick capture is intentionally forgiving: submitting the same open task
  // twice should not create two identical rails in the command center.
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'Task title is required' }, { status: 400 })
  const { data: existing } = await db
    .from('tasks')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('status', 'open')
    .ilike('title', title)
    .limit(1)
    .maybeSingle()

  if (existing) return NextResponse.json({ ...existing, deduplicated: true }, { status: 200 })

  const { data, error } = await db.from('tasks').insert({
    ...body,
    title,
    user_id: USER_ID,
    priority_score: body.priority_score ?? 0,
    status: 'open',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
