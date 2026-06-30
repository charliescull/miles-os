import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { localDateKey } from '@/lib/localDateKey'

export const dynamic = 'force-dynamic'

// Daily notepad. GET ?date=YYYY-MM-DD → that day's notes. GET ?dates=1 → distinct
// dates that have notes (for the history tab). POST { text } → add to today.
export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceClient()
  const sp = req.nextUrl.searchParams

  if (sp.get('dates')) {
    const { data } = await db.from('notes').select('note_date').eq('user_id', USER_ID).order('note_date', { ascending: false }).limit(400)
    const dates = Array.from(new Set((data ?? []).map(r => r.note_date)))
    return NextResponse.json(dates, { headers: { 'cache-control': 'no-store' } })
  }

  const date = sp.get('date') ?? localDateKey()
  const { data, error } = await db.from('notes').select('*').eq('user_id', USER_ID).eq('note_date', date).order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [], { headers: { 'cache-control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const db = getServiceClient()
  const { data, error } = await db.from('notes').insert({
    user_id: USER_ID, note_date: localDateKey(), text,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const db = getServiceClient()
  await db.from('notes').delete().eq('user_id', USER_ID).eq('id', id)
  return NextResponse.json({ deleted: true, id })
}
