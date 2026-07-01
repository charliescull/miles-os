import { getServiceClient } from '@/lib/supabase'
import { sendTelegram } from '@/lib/telegram'
import { advance, type RecurringRow } from './recurring'

// Recurring/bill renewal + expiration alerts and charge roll-forward (finance overhaul v2 §9.4).
// Runs daily from the 7am market-brief cron. For each active recurring item:
//   • roll next_due forward once it's in the past (subscriptions/fixed-term auto-renew)
//   • fire a Telegram alert notify_days_before a charge, trial end, or fixed-term expiry
//   • dedupe via last_notified_at (once per notify window)

const DAY = 86400_000
const daysUntil = (dateISO: string): number => Math.ceil((new Date(`${dateISO}T00:00:00Z`).getTime() - Date.now()) / DAY)

export async function runBillAlerts(): Promise<{ fired: number; rolled: number }> {
  const db = getServiceClient()
  const { data } = await db.from('fin_recurring').select('*').eq('status', 'active')
  const rows = (data as RecurringRow[] | null) ?? []
  const todayKey = new Date().toISOString().slice(0, 10)
  let fired = 0, rolled = 0

  for (const r of rows) {
    // Roll a past-due charge forward by its cadence (skip one_off — it just lapses).
    if (r.next_due && r.next_due < todayKey && r.cadence !== 'one_time' && r.type !== 'one_off') {
      const next = advance(r.next_due, r.cadence)
      await db.from('fin_recurring').update({ next_due: next, updated_at: new Date().toISOString() }).eq('id', r.id)
      r.next_due = next
      rolled++
    }

    // Which date matters for this type?
    const alertDate = (r.type === 'trial' || r.type === 'fixed_term') && r.expiration_date ? r.expiration_date : r.next_due
    if (!alertDate) continue
    const dLeft = daysUntil(alertDate)
    if (dLeft < 0 || dLeft > r.notify_days_before) continue

    // Dedupe: only alert once per window.
    if (r.last_notified_at) {
      const sinceHrs = (Date.now() - new Date(r.last_notified_at).getTime()) / 3_600_000
      if (sinceHrs < 20) continue
    }

    const amt = `$${Number(r.amount).toFixed(2)}`
    const when = dLeft === 0 ? 'today' : `in ${dLeft}d`
    let msg: string
    if (r.type === 'trial') msg = `⏳ *Trial ending ${when}:* ${r.name} — cancel or it converts (${amt}).`
    else if (r.type === 'fixed_term') msg = r.auto_renews
      ? `🔁 *${r.name} renews ${when}* — ${amt}.`
      : `📕 *${r.name} ends ${when}* — term over.`
    else msg = `💳 *${r.name} ${when}:* ${amt} (${r.category}).`

    await sendTelegram(msg)
    await db.from('fin_recurring').update({ last_notified_at: new Date().toISOString() }).eq('id', r.id)
    fired++
  }

  return { fired, rolled }
}
