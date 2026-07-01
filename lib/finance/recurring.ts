import { getServiceClient } from '@/lib/supabase'

// Recurring expenses (finance overhaul v2 §9). Rocket-Money-style module: categorized bills,
// upcoming timeline, cancel tracking, per-type expiration, and a monthly total. Charge roll-forward
// and renewal/expiration alerts are handled in lib/finance/billAlerts.ts (daily 7am job).

export type Cadence = 'monthly' | 'yearly' | 'weekly' | 'quarterly' | 'one_time'
export type RecurringType = 'subscription' | 'trial' | 'fixed_term' | 'one_off'
export type RecurringStatus = 'active' | 'canceled' | 'expired' | 'paused'

export interface RecurringRow {
  id: string
  name: string
  merchant: string | null
  category: string
  type: RecurringType
  amount: number
  cadence: Cadence
  next_due: string | null
  start_date: string | null
  expiration_date: string | null
  status: RecurringStatus
  auto_renews: boolean
  notify_days_before: number
  last_notified_at: string | null
  note: string | null
}

// Normalize any cadence to an equivalent MONTHLY figure for rollups / the committed-spend line.
export function monthlyEquivalent(amount: number, cadence: Cadence): number {
  switch (cadence) {
    case 'monthly': return amount
    case 'yearly': return amount / 12
    case 'weekly': return (amount * 52) / 12
    case 'quarterly': return amount / 3
    case 'one_time': return 0 // not a recurring commitment
  }
}

// Advance a date by one cadence period (used for roll-forward + timeline projection).
export function advance(dateISO: string, cadence: Cadence): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  switch (cadence) {
    case 'weekly': d.setUTCDate(d.getUTCDate() + 7); break
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break
    case 'quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break
    case 'yearly': d.setUTCFullYear(d.getUTCFullYear() + 1); break
    case 'one_time': break
  }
  return d.toISOString().slice(0, 10)
}

export async function listRecurring(includeInactive = false): Promise<RecurringRow[]> {
  const db = getServiceClient()
  let q = db.from('fin_recurring').select('*')
  if (!includeInactive) q = q.eq('status', 'active')
  const { data } = await q.order('next_due', { ascending: true })
  return (data as RecurringRow[] | null) ?? []
}

export async function upsertRecurring(input: Partial<RecurringRow> & { name: string; category: string; type: RecurringType; amount: number; cadence: Cadence }): Promise<RecurringRow> {
  const db = getServiceClient()
  const row = {
    ...(input.id ? { id: input.id } : {}),
    name: input.name,
    merchant: input.merchant ?? null,
    category: input.category,
    type: input.type,
    amount: input.amount,
    cadence: input.cadence,
    next_due: input.next_due ?? null,
    start_date: input.start_date ?? null,
    expiration_date: input.expiration_date ?? null,
    status: input.status ?? 'active',
    auto_renews: input.auto_renews ?? true,
    notify_days_before: input.notify_days_before ?? 3,
    note: input.note ?? null,
    updated_at: new Date().toISOString(),
  }
  const { data } = await db.from('fin_recurring').upsert(row).select().single()
  return data as RecurringRow
}

export async function setRecurringStatus(id: string, status: RecurringStatus): Promise<void> {
  const db = getServiceClient()
  await db.from('fin_recurring').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function deleteRecurring(id: string): Promise<void> {
  const db = getServiceClient()
  await db.from('fin_recurring').delete().eq('id', id)
}

export interface RecurringSummary {
  monthlyTotal: number
  canceledMonthlySaved: number
  byCategory: { category: string; monthly: number }[]
  next7Total: number
  items: RecurringRow[]
}

// Rollup for the module + money-header "committed $X/mo" line.
export async function recurringSummary(): Promise<RecurringSummary> {
  const db = getServiceClient()
  const { data } = await db.from('fin_recurring').select('*').in('status', ['active', 'canceled'])
  const rows = (data as RecurringRow[] | null) ?? []
  const active = rows.filter(r => r.status === 'active')

  const catMap = new Map<string, number>()
  let monthlyTotal = 0
  for (const r of active) {
    const m = monthlyEquivalent(Number(r.amount), r.cadence)
    monthlyTotal += m
    catMap.set(r.category, (catMap.get(r.category) ?? 0) + m)
  }
  const canceledMonthlySaved = rows
    .filter(r => r.status === 'canceled')
    .reduce((s, r) => s + monthlyEquivalent(Number(r.amount), r.cadence), 0)

  const today = new Date().toISOString().slice(0, 10)
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)
  const next7Total = active
    .filter(r => r.next_due && r.next_due >= today && r.next_due <= in7)
    .reduce((s, r) => s + Number(r.amount), 0)

  return {
    monthlyTotal,
    canceledMonthlySaved,
    byCategory: [...catMap.entries()].map(([category, monthly]) => ({ category, monthly })).sort((a, b) => b.monthly - a.monthly),
    next7Total,
    items: active,
  }
}
