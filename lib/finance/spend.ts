import { getServiceClient } from '@/lib/supabase'

// Free spend log (finance overhaul v2 §10.3). Sources: manual, telegram, statement_import,
// simplefin. Feeds the "Today / This-week spend" readout and the budget category math.

export interface SpendRow {
  id: string
  amount: number
  merchant: string | null
  category: string | null
  source: string
  spent_at: string
  ext_id: string | null
  account_name: string | null
}

export interface SpendSummary {
  today: number
  thisWeek: number
  recent: SpendRow[]
  byCategory: { category: string; total: number }[]
}

function weekStartSunday(d = new Date()): string {
  const day = d.getUTCDay()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString()
}

export async function addSpend(input: { amount: number; merchant?: string; category?: string; source?: string; spentAt?: string }): Promise<SpendRow> {
  const db = getServiceClient()
  const { data } = await db.from('fin_spend').insert({
    amount: input.amount,
    merchant: input.merchant ?? null,
    category: input.category ?? null,
    source: input.source ?? 'manual',
    spent_at: input.spentAt ?? new Date().toISOString(),
  }).select().single()
  return data as SpendRow
}

export async function spendSummary(): Promise<SpendSummary> {
  const db = getServiceClient()
  const todayStart = new Date().toISOString().slice(0, 10)
  const { data } = await db
    .from('fin_spend').select('*').gte('spent_at', weekStartSunday()).order('spent_at', { ascending: false })
  const rows = (data as SpendRow[] | null) ?? []

  let today = 0, thisWeek = 0
  const cat = new Map<string, number>()
  for (const r of rows) {
    const amt = Number(r.amount)
    thisWeek += amt
    if (r.spent_at.slice(0, 10) === todayStart) today += amt
    const c = r.category ?? 'other'
    cat.set(c, (cat.get(c) ?? 0) + amt)
  }

  return {
    today,
    thisWeek,
    recent: rows.slice(0, 10),
    byCategory: [...cat.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total),
  }
}
