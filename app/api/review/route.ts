import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

// Reviews stored on a dedicated sentinel date per week: 1900-01-{weekNum}
function weekDate(weekNum: number): string {
  return `1900-01-${String(weekNum).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const week = parseInt(req.nextUrl.searchParams.get('week') ?? '1')
  const db = getServiceClient()

  const { data } = await db
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', weekDate(week))
    .single()

  if (!data) return NextResponse.json(null)

  try {
    const notes = typeof data.notes === 'string' ? JSON.parse(data.notes) : data.notes
    return NextResponse.json(notes?.review ?? null)
  } catch {
    return NextResponse.json(null)
  }
}

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { week, ...reviewData } = await req.json()
  const db = getServiceClient()

  const { data: existing } = await db
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', weekDate(week))
    .single()

  const currentNotes = existing?.notes
    ? (typeof existing.notes === 'string' ? JSON.parse(existing.notes) : existing.notes)
    : {}

  const { error } = await db
    .from('daily_logs')
    .upsert({
      user_id: USER_ID,
      log_date: weekDate(week),
      notes: JSON.stringify({ ...currentNotes, review: reviewData }),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,log_date' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
