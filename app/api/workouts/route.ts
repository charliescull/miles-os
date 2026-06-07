import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { saveWorkoutDetail, type ExerciseInput } from '@/lib/workouts/saveWorkout'

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceClient()
  const dateParam = req.nextUrl.searchParams.get('date')

  // Single-day detail: summary title + exercises.
  if (dateParam) {
    const [{ data: w }, { data: ex }] = await Promise.all([
      db.from('workouts').select('workout_type').eq('user_id', USER_ID).eq('date', dateParam).single(),
      db.from('workout_exercises').select('*').eq('user_id', USER_ID).eq('date', dateParam).order('position', { ascending: true }),
    ])
    return NextResponse.json({ date: dateParam, title: w?.workout_type ?? null, exercises: ex ?? [] })
  }

  // Day-strip: last N days of summary rows (unchanged shape).
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '10')
  const since = new Date()
  since.setDate(since.getDate() - (days - 1))
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await db
    .from('workouts')
    .select('date, workout_type')
    .eq('user_id', USER_ID)
    .gte('date', sinceStr)
    .order('date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { date } = body
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const db = getServiceClient()
  const now = new Date().toISOString()

  // Detail save: { date, title, exercises[] } → upsert summary + replace exercises for the day.
  if (Array.isArray(body.exercises)) {
    const title = body.title ?? body.workout_type ?? null
    try {
      const result = await saveWorkoutDetail(date, title, body.exercises as ExerciseInput[])
      return NextResponse.json(result)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 })
    }
  }

  // Simple summary save (existing behavior): { date, workout_type }.
  const { workout_type } = body
  const { data, error } = await db
    .from('workouts')
    .upsert({ user_id: USER_ID, date, workout_type: workout_type ?? null, updated_at: now }, { onConflict: 'user_id,date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
