import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

const SENTINEL_DATE = '2000-01-01'

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceClient()
  const { data } = await db
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', SENTINEL_DATE)
    .single()

  if (!data) return NextResponse.json({ week: [], month: [] })

  try {
    const notes = typeof data.notes === 'string' ? JSON.parse(data.notes) : data.notes
    return NextResponse.json({
      week: notes?.goals_week_items ?? [],
      month: notes?.goals_month_items ?? [],
    })
  } catch {
    return NextResponse.json({ week: [], month: [] })
  }
}

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { scope, items } = await req.json()
  const db = getServiceClient()

  const { data: existing } = await db
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', SENTINEL_DATE)
    .single()

  const currentNotes = existing?.notes
    ? (typeof existing.notes === 'string' ? JSON.parse(existing.notes) : existing.notes)
    : {}

  const key = scope === 'week' ? 'goals_week_items' : 'goals_month_items'
  const updatedNotes = { ...currentNotes, [key]: items }

  const { error } = await db
    .from('daily_logs')
    .upsert({
      user_id: USER_ID,
      log_date: SENTINEL_DATE,
      notes: JSON.stringify(updatedNotes),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,log_date' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
