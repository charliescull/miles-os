import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { localDateKey } from '@/lib/localDateKey'

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date') ?? localDateKey()
  const daysParam = req.nextUrl.searchParams.get('days')

  const db = getServiceClient()

  if (daysParam) {
    // Health tab: last N days
    const days = parseInt(daysParam)
    const since = new Date(); since.setDate(since.getDate() - days)
    const { data } = await db
      .from('daily_logs')
      .select('log_date, notes')
      .eq('user_id', USER_ID)
      .gte('log_date', since.toISOString().split('T')[0])
      .order('log_date', { ascending: false })
      .limit(days + 10)

    const rows = (data ?? []).map(row => {
      try {
        const notes = typeof row.notes === 'string' ? JSON.parse(row.notes) : row.notes
        const meals = notes?.nutrition?.meals ?? []
        const totals = meals.reduce((acc: { kcal: number; protein: number; carbs: number; fat: number }, m: { kcal: number; protein: number; carbs: number; fat: number }) => ({
          kcal: acc.kcal + (m.kcal ?? 0),
          protein: acc.protein + (m.protein ?? 0),
          carbs: acc.carbs + (m.carbs ?? 0),
          fat: acc.fat + (m.fat ?? 0),
        }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
        return { date: row.log_date, meals, ...totals }
      } catch {
        return { date: row.log_date, meals: [], kcal: 0, protein: 0, carbs: 0, fat: 0 }
      }
    })

    return NextResponse.json(rows)
  }

  // Single day
  const { data } = await db
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', date)
    .single()

  if (!data) return NextResponse.json({ meals: [] })

  try {
    const notes = typeof data.notes === 'string' ? JSON.parse(data.notes) : data.notes
    return NextResponse.json({ meals: notes?.nutrition?.meals ?? [] })
  } catch {
    return NextResponse.json({ meals: [] })
  }
}

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { date, meals } = await req.json()
  const db = getServiceClient()

  const { data: existing } = await db
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', date)
    .single()

  const currentNotes = existing?.notes
    ? (typeof existing.notes === 'string' ? JSON.parse(existing.notes) : existing.notes)
    : {}

  const updatedNotes = { ...currentNotes, nutrition: { meals } }

  const { error } = await db
    .from('daily_logs')
    .upsert({
      user_id: USER_ID,
      log_date: date,
      notes: JSON.stringify(updatedNotes),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,log_date' })

  if (error) {
    console.error('Nutrition POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
