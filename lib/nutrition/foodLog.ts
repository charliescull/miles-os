import Anthropic from '@anthropic-ai/sdk'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { localDateKey } from '@/lib/localDateKey'

// Standard food logging — appends one meal to today's `daily_logs.notes.nutrition.meals[]`,
// the SAME array the NutritionCard renders and the `/api/nutrition` route manages.
// "Standard food" = just logged (macros only). The recipe path (analyze + taste + saved to the
// recipe library) stays separate. Reusable server-side (the Telegram webhook imports this).

export interface Macros { kcal: number; protein: number; carbs: number; fat: number }

export interface LoggedMeal {
  id: string
  time: string
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  estimated: boolean
  idempotency_key?: string
}

function timeLabel(): string {
  const tz = process.env.USER_TIMEZONE ?? 'UTC'
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })
}

// Mirror of /api/nutrition/estimate, extracted so the bot path can call it without an HTTP hop.
export async function estimateMacros(text: string): Promise<Macros> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      output_config: { effort: 'max' },
      max_tokens: 256,
      system:
        'You are a nutrition estimator. Given a food description, return only a JSON object with keys: kcal (number), protein (number grams), carbs (number grams), fat (number grams). No explanation, just JSON.',
      messages: [{ role: 'user', content: text }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : {}
    return {
      kcal: Number(parsed.kcal) || 0,
      protein: Number(parsed.protein) || 0,
      carbs: Number(parsed.carbs) || 0,
      fat: Number(parsed.fat) || 0,
    }
  } catch {
    return { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  }
}

function sumMeals(meals: LoggedMeal[]): Macros {
  return meals.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

// Estimate (unless macros supplied) and append a meal to today's nutrition log.
export async function logStandardFood(
  description: string,
  macrosOverride?: Macros,
  idempotencyKey?: string | null,
): Promise<{ meal: LoggedMeal; totals: Macros; date: string }> {
  const macros = macrosOverride ?? (await estimateMacros(description))
  const date = localDateKey()
  const db = getServiceClient()

  const { data: existing } = await db
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', date)
    .single()

  const currentNotes = existing?.notes
    ? typeof existing.notes === 'string'
      ? JSON.parse(existing.notes)
      : existing.notes
    : {}

  const existingMeals: LoggedMeal[] = currentNotes?.nutrition?.meals ?? []
  const existingMeal = idempotencyKey ? existingMeals.find((item) => item.idempotency_key === idempotencyKey) : null
  if (existingMeal) return { meal: existingMeal, totals: sumMeals(existingMeals), date }
  const meal: LoggedMeal = {
    id: crypto.randomUUID(),
    time: timeLabel(),
    name: description,
    kcal: macros.kcal,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    estimated: true,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  }
  const meals = [...existingMeals, meal]

  await db.from('daily_logs').upsert(
    {
      user_id: USER_ID,
      log_date: date,
      notes: JSON.stringify({ ...currentNotes, nutrition: { ...(currentNotes.nutrition ?? {}), meals } }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,log_date' }
  )

  return { meal, totals: sumMeals(meals), date }
}
