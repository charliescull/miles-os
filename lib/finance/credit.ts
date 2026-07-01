import { getServiceClient } from '@/lib/supabase'
import { sendTelegram } from '@/lib/telegram'

// Credit card (Discover, manual) + FICO history (finance overhaul v2 §10.1/§10.2). Single-user →
// one primary account is the common case, but the layer supports many. Payment-due alerts run
// daily from the 7am cron (same pattern as bill alerts).

export interface CreditAccountRow {
  id: string
  issuer: string
  nickname: string | null
  last4: string | null
  credit_limit: number | null
  current_balance: number
  statement_balance: number | null
  min_payment: number | null
  due_date: string | null
  apr: number | null
  autopay: boolean
  notify_days_before: number
  last_notified_at: string | null
}

export interface CreditView {
  account: CreditAccountRow | null
  utilization: number | null // 0..1
  fico: { latest: number | null; delta: number | null; history: { score: number; scored_on: string }[] }
}

export async function getCreditView(): Promise<CreditView> {
  const db = getServiceClient()
  const { data: acct } = await db.from('fin_credit_accounts').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle()
  const account = (acct as CreditAccountRow | null) ?? null
  const utilization = account && account.credit_limit ? account.current_balance / account.credit_limit : null

  const { data: scores } = await db.from('fin_credit_score').select('score, scored_on').order('scored_on', { ascending: false }).limit(12)
  const history = ((scores as { score: number; scored_on: string }[] | null) ?? []).slice().reverse()
  const latest = history.length ? history[history.length - 1].score : null
  const delta = history.length >= 2 ? history[history.length - 1].score - history[history.length - 2].score : null

  return { account, utilization, fico: { latest, delta, history } }
}

export async function upsertCreditAccount(patch: Partial<CreditAccountRow>): Promise<CreditAccountRow> {
  const db = getServiceClient()
  const row = { ...patch, updated_at: new Date().toISOString() }
  const { data } = await db.from('fin_credit_accounts').upsert(row).select().single()
  return data as CreditAccountRow
}

export async function addCreditScore(score: number, scoredOn?: string): Promise<void> {
  const db = getServiceClient()
  await db.from('fin_credit_score').insert({ score, scored_on: scoredOn ?? new Date().toISOString().slice(0, 10) })
}

// Payment-due Telegram alerts (§10.2). Called from the daily 7am cron.
export async function runCreditAlerts(): Promise<{ fired: number }> {
  const db = getServiceClient()
  const { data } = await db.from('fin_credit_accounts').select('*')
  const rows = (data as CreditAccountRow[] | null) ?? []
  let fired = 0
  for (const a of rows) {
    if (!a.due_date || a.autopay) continue
    const dLeft = Math.ceil((new Date(`${a.due_date}T00:00:00Z`).getTime() - Date.now()) / 86400_000)
    if (dLeft < 0 || dLeft > a.notify_days_before) continue
    if (a.last_notified_at && (Date.now() - new Date(a.last_notified_at).getTime()) / 3_600_000 < 20) continue
    const amt = a.min_payment ?? a.statement_balance ?? a.current_balance
    await sendTelegram(`💳 *${a.issuer} payment ${dLeft === 0 ? 'due today' : `due in ${dLeft}d`}:* $${Number(amt).toFixed(2)} min.`)
    await db.from('fin_credit_accounts').update({ last_notified_at: new Date().toISOString() }).eq('id', a.id)
    fired++
  }
  return { fired }
}
