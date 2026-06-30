import { getServiceClient, USER_ID } from '@/lib/supabase'
import {
  createCalendarEvent,
  updateCalendarEventTime,
  deleteCalendarEvent,
  parseEventFromText,
  type EventInput,
} from '@/lib/calendar/calendarWrite'

/**
 * Hybrid appointment layer (COMMAND CENTER). Every appointment is written to the
 * real Google Calendar (via the service account) AND mirrored into the Supabase
 * `appointments` table so the dashboard shows named events instantly and remains
 * correct even if the Google calendar share isn't configured yet.
 */

export interface Appointment {
  id: string
  google_event_id: string | null
  summary: string
  start_local: string
  end_local: string | null
  all_day: boolean
  recurrence: string | null
  location: string | null
}

export interface ShapedEvent {
  id: string
  title: string
  date: string
  allDay: boolean
  startTime?: string
  endTime?: string
  source: 'mirror'
}

const DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function addMonths(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

// Map a natural-language frequency phrase to a Google RRULE. Null if unrecognized.
export function parseRecurrence(freq: string | undefined | null): string | null {
  if (!freq) return null
  const f = freq.trim().toLowerCase()
  const DAYS: Record<string, string> = {
    monday: 'MO', mon: 'MO', tuesday: 'TU', tue: 'TU', tues: 'TU',
    wednesday: 'WE', wed: 'WE', thursday: 'TH', thu: 'TH', thurs: 'TH',
    friday: 'FR', fri: 'FR', saturday: 'SA', sat: 'SA', sunday: 'SU', sun: 'SU',
  }
  for (const [name, code] of Object.entries(DAYS)) {
    if (f.includes(name)) return `FREQ=WEEKLY;BYDAY=${code}`
  }
  if (/weekday/.test(f)) return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
  if (/(^|\b)(day|daily)\b/.test(f)) return 'FREQ=DAILY'
  if (/(week|weekly)/.test(f)) return 'FREQ=WEEKLY'
  if (/(month|monthly)/.test(f)) return 'FREQ=MONTHLY'
  if (/(year|yearly|annual)/.test(f)) return 'FREQ=YEARLY'
  return null
}

export async function createAppointment(opts: {
  summary: string
  start: string
  end?: string
  allDay?: boolean
  location?: string
  recurrence?: string | null
}): Promise<Appointment> {
  const allDay = opts.allDay ?? !opts.start.includes('T')
  const input: EventInput = {
    summary: opts.summary,
    start: opts.start,
    end: opts.end,
    allDay,
    location: opts.location,
    recurrence: opts.recurrence ? [`RRULE:${opts.recurrence}`] : undefined,
  }

  let googleId: string | null = null
  try {
    const created = await createCalendarEvent(input)
    googleId = created.id
  } catch (err) {
    console.error('Google Calendar create failed (mirroring only):', err)
  }

  const db = getServiceClient()
  const { data } = await db.from('appointments').insert({
    user_id: USER_ID,
    google_event_id: googleId,
    summary: opts.summary,
    start_local: opts.start,
    end_local: opts.end ?? null,
    all_day: allDay,
    recurrence: opts.recurrence ?? null,
    location: opts.location ?? null,
  }).select().single()

  return data as Appointment
}

export async function createAppointmentFromText(
  summary: string,
  whenText: string,
  freq?: string | null,
): Promise<Appointment | null> {
  const parsed = await parseEventFromText(`${summary} at ${whenText}`)
  if (!parsed) return null
  return createAppointment({
    summary: summary.trim() || parsed.summary,
    start: parsed.start,
    end: parsed.end,
    allDay: parsed.allDay,
    location: parsed.location,
    recurrence: parseRecurrence(freq),
  })
}

export async function changeAppointmentTime(
  summary: string,
  newWhenText: string,
): Promise<Appointment | null> {
  const db = getServiceClient()
  const todayKey = new Date().toISOString().slice(0, 10)

  const parsed = await parseEventFromText(`${summary} at ${newWhenText}`)
  if (!parsed) return null

  const { data: rows } = await db
    .from('appointments')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('canceled', false)
    .ilike('summary', `%${summary.trim()}%`)
    .order('start_local', { ascending: true })

  const list = (rows ?? []) as Appointment[]
  if (!list.length) return null
  const upcoming = list.find(a => a.start_local.slice(0, 10) >= todayKey) ?? list[list.length - 1]

  if (upcoming.google_event_id) {
    try {
      await updateCalendarEventTime(upcoming.google_event_id, parsed.start, parsed.end, parsed.allDay)
    } catch (err) {
      console.error('Google Calendar update failed (mirroring only):', err)
    }
  }

  const { data } = await db.from('appointments').update({
    start_local: parsed.start,
    end_local: parsed.end ?? null,
    all_day: parsed.allDay,
    updated_at: new Date().toISOString(),
  }).eq('id', upcoming.id).select().single()

  return data as Appointment
}

export async function cancelAppointment(
  summary: string,
  whenText?: string | null,
): Promise<Appointment | null> {
  const db = getServiceClient()
  const todayKey = new Date().toISOString().slice(0, 10)

  const { data: rows } = await db
    .from('appointments')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('canceled', false)
    .ilike('summary', `%${summary.trim()}%`)
    .order('start_local', { ascending: true })

  const list = (rows ?? []) as Appointment[]
  if (!list.length) return null

  // If a time was given ("cancel appointment Dentist at 3pm"), prefer the row at that time.
  let target: Appointment | undefined
  if (whenText) {
    const parsed = await parseEventFromText(`${summary} at ${whenText}`)
    if (parsed) {
      const key = String(parsed.start).slice(0, 16)
      target = list.find(a => a.start_local.slice(0, 16) === key)
    }
  }
  // Otherwise the next upcoming occurrence, falling back to the most recent past one.
  target = target ?? list.find(a => a.start_local.slice(0, 10) >= todayKey) ?? list[list.length - 1]

  if (target.google_event_id) {
    try {
      await deleteCalendarEvent(target.google_event_id)
    } catch (err) {
      console.error('Google Calendar delete failed (mirroring only):', err)
    }
  }

  const { data } = await db.from('appointments').update({
    canceled: true,
    updated_at: new Date().toISOString(),
  }).eq('id', target.id).select().single()

  return data as Appointment
}

export async function listAppointments(fromDate: string, toDate: string): Promise<Appointment[]> {
  const db = getServiceClient()
  const { data } = await db
    .from('appointments')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('canceled', false)
    .gte('start_local', fromDate)
    .lte('start_local', `${toDate}T23:59:59`)
    .order('start_local', { ascending: true })
  return (data ?? []) as Appointment[]
}

// Expand the mirror (incl. recurring rows) into concrete dated events over [from,to].
// Shared by /api/appointments (dashboard) and the alert cron.
export async function expandAppointments(from: string, to: string): Promise<ShapedEvent[]> {
  const appts = await listAppointments(addDays(from, -370), to) // recurring origins may be in the past
  const out: ShapedEvent[] = []

  for (const a of appts) {
    const startDate = a.start_local.slice(0, 10)
    const startTime = a.all_day ? undefined : a.start_local.slice(11, 16)
    const endTime = a.end_local && !a.all_day ? a.end_local.slice(11, 16) : undefined
    const base = { title: a.summary, allDay: a.all_day, startTime, endTime, source: 'mirror' as const }

    if (!a.recurrence) {
      if (startDate >= from && startDate <= to) out.push({ id: a.id, date: startDate, ...base })
      continue
    }

    const m = a.recurrence
    const byDay = m.match(/BYDAY=([A-Z,]+)/)?.[1]?.split(',') ?? null
    let cur = startDate
    let guard = 0
    if (/FREQ=DAILY/.test(m)) {
      if (cur < from) cur = from
      while (cur <= to && guard++ < 500) { out.push({ id: `${a.id}:${cur}`, date: cur, ...base }); cur = addDays(cur, 1) }
    } else if (/FREQ=WEEKLY/.test(m)) {
      const targets = byDay ? byDay.map(d => DOW[d]).filter(n => n != null) : [new Date(`${startDate}T00:00:00Z`).getUTCDay()]
      let scan = from
      while (scan <= to && guard++ < 800) {
        if (scan >= startDate && targets.includes(new Date(`${scan}T00:00:00Z`).getUTCDay())) {
          out.push({ id: `${a.id}:${scan}`, date: scan, ...base })
        }
        scan = addDays(scan, 1)
      }
    } else if (/FREQ=MONTHLY/.test(m)) {
      while (cur <= to && guard++ < 200) { if (cur >= from) out.push({ id: `${a.id}:${cur}`, date: cur, ...base }); cur = addMonths(cur, 1) }
    } else if (/FREQ=YEARLY/.test(m)) {
      while (cur <= to && guard++ < 50) { if (cur >= from) out.push({ id: `${a.id}:${cur}`, date: cur, ...base }); cur = addMonths(cur, 12) }
    } else {
      if (startDate >= from && startDate <= to) out.push({ id: a.id, date: startDate, ...base })
    }
  }
  return out
}
