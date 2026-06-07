import { getServiceClient } from '@/lib/supabase'
import { GROCERY_WEEKLY } from './constants'

// Food budget: Sunday→Saturday weeks. Spend decrements the remaining balance (can go negative);
// on rollover a closed week's variance (budget − spent) feeds the bank balance. See spec §5.

export function weekStartSunday(d = new Date()): string {
  const day = d.getUTCDay() // 0 = Sunday
  const sunday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day))
  return sunday.toISOString().slice(0, 10)
}

async function ensureWeekRow(weekStart: string): Promise<void> {
  const db = getServiceClient()
  await db
    .from('fin_food_weeks')
    .upsert({ week_start: weekStart, budget: GROCERY_WEEKLY }, { onConflict: 'week_start', ignoreDuplicates: true })
}

export interface CurrentWeek {
  weekStart: string
  budget: number
  spent: number
  varianceSum: number // sum of all closed weeks' variance
}

// Ensure the current week exists, close any still-open prior weeks, return current week + closed variance sum.
export async function ensureWeekAndRollover(now = new Date()): Promise<CurrentWeek> {
  const db = getServiceClient()
  const current = weekStartSunday(now)
  await ensureWeekRow(current)

  const { data: openPrior } = await db
    .from('fin_food_weeks')
    .select('week_start, budget, spent')
    .eq('closed', false)
    .lt('week_start', current)

  for (const w of openPrior ?? []) {
    const variance = Number(w.budget) - Number(w.spent)
    await db.from('fin_food_weeks').update({ closed: true, variance }).eq('week_start', w.week_start)
  }

  const varianceSum = await getClosedVarianceSum()
  const { data: cur } = await db
    .from('fin_food_weeks')
    .select('budget, spent')
    .eq('week_start', current)
    .single()

  return {
    weekStart: current,
    budget: Number(cur?.budget ?? GROCERY_WEEKLY),
    spent: Number(cur?.spent ?? 0),
    varianceSum,
  }
}

export async function getClosedVarianceSum(): Promise<number> {
  const db = getServiceClient()
  const { data } = await db.from('fin_food_weeks').select('variance').eq('closed', true)
  return (data ?? []).reduce((s, r) => s + Number(r.variance ?? 0), 0)
}

export async function logSpend(amount: number, note?: string): Promise<CurrentWeek> {
  const db = getServiceClient()
  const weekStart = weekStartSunday()
  await ensureWeekRow(weekStart)
  await db.from('fin_food_log').insert({ week_start: weekStart, amount, note: note ?? null })

  const { data: cur } = await db.from('fin_food_weeks').select('spent').eq('week_start', weekStart).single()
  const newSpent = Number(cur?.spent ?? 0) + amount
  await db.from('fin_food_weeks').update({ spent: newSpent }).eq('week_start', weekStart)

  return ensureWeekAndRollover()
}
