import { getServiceClient } from '@/lib/supabase'

// Income / paychecks (finance overhaul v2 follow-up). Logged income raises cash → net worth.

export interface IncomeRow {
  id: string
  amount: number
  source: string | null
  note: string | null
  received_at: string
}

export async function addIncome(input: { amount: number; source?: string; note?: string; receivedAt?: string }): Promise<IncomeRow> {
  const db = getServiceClient()
  const { data } = await db.from('fin_income').insert({
    amount: input.amount,
    source: input.source ?? 'paycheck',
    note: input.note ?? null,
    received_at: input.receivedAt ?? new Date().toISOString(),
  }).select().single()
  return data as IncomeRow
}

// Sum of all logged income (feeds the cash balance).
export async function incomeTotal(): Promise<number> {
  const db = getServiceClient()
  const { data } = await db.from('fin_income').select('amount')
  return (data ?? []).reduce((s, r) => s + Number(r.amount), 0)
}

export interface IncomeSummary { total: number; monthToDate: number; recent: IncomeRow[] }

export async function incomeSummary(): Promise<IncomeSummary> {
  const db = getServiceClient()
  const { data } = await db.from('fin_income').select('*').order('received_at', { ascending: false })
  const rows = (data as IncomeRow[] | null) ?? []
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const monthKey = monthStart.toISOString()
  return {
    total: rows.reduce((s, r) => s + Number(r.amount), 0),
    monthToDate: rows.filter(r => r.received_at >= monthKey).reduce((s, r) => s + Number(r.amount), 0),
    recent: rows.slice(0, 8),
  }
}
