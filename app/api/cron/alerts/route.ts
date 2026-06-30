import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { expandAppointments } from '@/lib/calendar/appointments'

export const dynamic = 'force-dynamic'

// 15-minutes-before-event alert. Runs on a schedule (vercel.json cron, ~every
// 5 min). Looks at upcoming events from the Supabase appointment mirror AND the
// Google iCal feed; for any timed event starting within the next 15 minutes that
// hasn't been alerted yet, sends a Telegram message and records it in alert_log.

const TZ = process.env.USER_TIMEZONE || 'UTC'
const LEAD_MIN = 15

interface Ev { title: string; date: string; startTime?: string; allDay?: boolean }

// 'YYYY-MM-DDTHH:mm' for "now" in the user's timezone (sv-SE → 'YYYY-MM-DD HH:mm:ss').
function nowLocalMinute(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T').slice(0, 16)
}
function epochOf(localMinute: string): number {
  return Date.parse(`${localMinute}:00Z`) // both "now" and event are in the same tz frame
}

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_USER_ID
  if (!token || !chatId) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  }).catch(() => {})
}

// Today's timed events straight from the Google iCal feed (best-effort).
async function icalToday(todayKey: string): Promise<Ev[]> {
  const url = process.env.GOOGLE_CALENDAR_ICAL_URL
  if (!url) return []
  try {
    const raw = await (await fetch(url)).text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ICAL = (await import('ical.js')).default as any
    const comp = new ICAL.Component(ICAL.parse(raw))
    const out: Ev[] = []
    const dayStart = new Date(`${todayKey}T00:00:00Z`)
    const dayEnd = new Date(`${todayKey}T23:59:59Z`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    comp.getAllSubcomponents('vevent').forEach((ve: any) => {
      try {
        const ev = new ICAL.Event(ve)
        const pushIf = (d: Date) => {
          const dateKey = d.toLocaleDateString('en-CA', { timeZone: TZ })
          if (dateKey !== todayKey) return
          const startTime = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
          out.push({ title: ev.summary?.replace(/\[.*?\]/g, '').trim() || 'Event', date: dateKey, startTime, allDay: ev.startDate.isDate })
        }
        if (ev.isRecurring()) {
          const it = ev.iterator(); let n; let c = 0
          while ((n = it.next()) && c < 60) { c++; const d = n.toJSDate(); if (d > dayEnd) break; if (d >= dayStart) pushIf(d) }
        } else {
          pushIf(ev.startDate.toJSDate())
        }
      } catch { /* skip malformed */ }
    })
    return out
  } catch {
    return []
  }
}

async function runAlerts() {
  const nowMin = nowLocalMinute()
  const todayKey = nowMin.slice(0, 10)
  const nowEpoch = epochOf(nowMin)

  const mirror = await expandAppointments(todayKey, todayKey)
  const ical = await icalToday(todayKey)
  const events: Ev[] = [...mirror, ...ical]

  const db = getServiceClient()
  const fired: string[] = []

  for (const ev of events) {
    if (ev.allDay || !ev.startTime) continue
    const diffMin = (epochOf(`${ev.date}T${ev.startTime}`) - nowEpoch) / 60000
    if (diffMin <= 0 || diffMin > LEAD_MIN) continue

    const key = `${ev.date}T${ev.startTime}|${ev.title}`
    const { data: seen } = await db.from('alert_log').select('id').eq('user_id', USER_ID).eq('event_key', key).maybeSingle()
    if (seen) continue

    await sendTelegram(`⏰ *In ${Math.max(1, Math.round(diffMin))} min:* ${ev.title}\n🕒 ${ev.startTime}`)
    await db.from('alert_log').insert({ user_id: USER_ID, event_key: key })
    fired.push(key)
  }

  return { now: nowMin, checked: events.length, fired }
}

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await runAlerts()) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'alert run failed' }, { status: 500 })
  }
}
