import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { date } = await params
  const habitState = await req.json() // { done: string[] }

  const db = getServiceClient()

  // Upsert the daily_log row, merging habits into notes JSON
  const { data: existing } = await db
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', date)
    .single()

  const currentNotes = existing?.notes
    ? (typeof existing.notes === 'string' ? JSON.parse(existing.notes) : existing.notes)
    : {}

  const updatedNotes = { ...currentNotes, habits: habitState }

  const { error } = await db
    .from('daily_logs')
    .upsert({
      user_id: USER_ID,
      log_date: date,
      notes: JSON.stringify(updatedNotes),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,log_date' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
