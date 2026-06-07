import { getServiceClient, USER_ID } from '@/lib/supabase'

// Workout detail save — upserts the day's summary title and replaces that day's exercise rows.
// Extracted from app/api/workouts/route.ts so the route AND the Telegram vision path can share it
// without an HTTP hop. Mirrors the lib/nutrition/foodLog.ts pattern.

export interface ExerciseInput {
  section?: string | null
  name: string
  raw?: string | null
  sets?: number | null
  reps?: string | null
  note?: string | null
  done?: boolean
}

export async function saveWorkoutDetail(
  date: string,
  title: string | null,
  exercises: ExerciseInput[]
): Promise<{ ok: true; date: string; title: string | null; count: number }> {
  const db = getServiceClient()
  const now = new Date().toISOString()

  const { error: wErr } = await db
    .from('workouts')
    .upsert({ user_id: USER_ID, date, workout_type: title, updated_at: now }, { onConflict: 'user_id,date' })
  if (wErr) throw new Error(wErr.message)

  await db.from('workout_exercises').delete().eq('user_id', USER_ID).eq('date', date)

  const rows = exercises.map((e, i) => ({
    user_id: USER_ID,
    date,
    position: i,
    section: e.section ?? null,
    name: e.name,
    raw: e.raw ?? null,
    sets: e.sets ?? null,
    reps: e.reps ?? null,
    note: e.note ?? null,
    done: e.done !== false,
  }))
  if (rows.length) {
    const { error: exErr } = await db.from('workout_exercises').insert(rows)
    if (exErr) throw new Error(exErr.message)
  }

  return { ok: true, date, title, count: rows.length }
}
