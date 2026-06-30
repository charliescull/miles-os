import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { localDateKey } from '@/lib/localDateKey'

export const dynamic = 'force-dynamic'

// The COMMAND task list (neon boxes). Backed by the existing `tasks` table,
// kind='task'. GET → open tasks + anything completed today (so a checked item
// stays visible/striked for the day). POST { id, done } → toggle.
export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceClient()
  const today = localDateKey()

  const { data: open } = await db.from('tasks').select('*')
    .eq('user_id', USER_ID).eq('kind', 'task').eq('status', 'open')
    .order('created_at', { ascending: true }).limit(100)

  const { data: doneToday } = await db.from('tasks').select('*')
    .eq('user_id', USER_ID).eq('kind', 'task').eq('status', 'done')
    .gte('completed_at', `${today}T00:00:00`)
    .order('completed_at', { ascending: true }).limit(50)

  return NextResponse.json([...(open ?? []), ...(doneToday ?? [])], { headers: { 'cache-control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  const done = !!body.done
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = getServiceClient()
  const { data, error } = await db.from('tasks').update({
    status: done ? 'done' : 'open',
    completed_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('user_id', USER_ID).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
