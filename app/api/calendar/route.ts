import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { createCalendarEvent, deleteCalendarEvent, parseEventFromText, type EventInput } from '@/lib/calendar/calendarWrite'

// Module-level cache (5 min)
let cache: { data: unknown; ts: number } | null = null
const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data, { headers: { 'cache-control': 'no-store' } })
  }

  const icalUrl = process.env.GOOGLE_CALENDAR_ICAL_URL
  if (!icalUrl) {
    return NextResponse.json([], { headers: { 'cache-control': 'no-store' } })
  }

  try {
    const icalRes = await fetch(icalUrl)
    const raw = await icalRes.text()

    // Dynamically import ical.js (pure JS, no BigInt issue)
    const ICAL = (await import('ical.js')).default
    const jcalData = ICAL.parse(raw)
    const comp = new ICAL.Component(jcalData)

    const now = new Date()
    const start = new Date(now); start.setDate(start.getDate() - 1)
    const end = new Date(now); end.setDate(end.getDate() + 14)

    const events: unknown[] = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    comp.getAllSubcomponents('vevent').forEach((vevent: any) => {
      try {
        const ev = new ICAL.Event(vevent)
        const dtstart = ev.startDate

        // Expand recurring events
        if (ev.isRecurring()) {
          const iter = ev.iterator()
          let next
          let count = 0
          while ((next = iter.next()) && count < 50) {
            count++
            const d = next.toJSDate()
            if (d > end) break
            if (d >= start) {
              events.push(buildEvent(ev, d, next))
            }
          }
        } else {
          const d = dtstart.toJSDate()
          if (d >= start && d <= end) {
            events.push(buildEvent(ev, d, dtstart))
          }
        }
      } catch {
        // skip malformed events
      }
    })

    cache = { data: events, ts: Date.now() }
    return NextResponse.json(events, { headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    console.error('Calendar parse error:', err)
    return NextResponse.json([], { headers: { 'cache-control': 'no-store' } })
  }
}

// Create an event. POST { text } (natural language → parsed) OR explicit { summary, start, ... }.
// Used by the Telegram bot and for testing. Write goes through the service account.
export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  try {
    let input: EventInput | null = null
    if (typeof body.summary === 'string' && typeof body.start === 'string') {
      input = body as EventInput
    } else if (typeof body.text === 'string' && body.text.trim()) {
      input = await parseEventFromText(body.text)
      if (!input) return NextResponse.json({ created: false, reason: 'not a scheduling request' })
    } else {
      return NextResponse.json({ error: 'provide { text } or { summary, start }' }, { status: 400 })
    }

    const event = await createCalendarEvent(input)
    return NextResponse.json({ created: true, event }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Calendar create failed' }, { status: 500 })
  }
}

// Delete an event (test cleanup / future cancel intent). DELETE ?id=<eventId>.
export async function DELETE(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await deleteCalendarEvent(id)
    return NextResponse.json({ deleted: true, id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Calendar delete failed' }, { status: 500 })
  }
}

function buildEvent(ev: { summary: string; description?: string; isAllDay?: () => boolean; endDate?: { toJSDate: () => Date } }, startDate: Date, dtstart: { isDate?: boolean }) {
  const tz = process.env.USER_TIMEZONE ?? 'UTC'
  const dateKey = startDate.toLocaleDateString('en-CA', { timeZone: tz })
  const allDay = dtstart.isDate ?? false

  const tags = ev.summary ? extractTag(ev.summary) : undefined

  return {
    id: `${ev.summary}-${dateKey}`,
    title: ev.summary?.replace(/\[.*?\]/g, '').trim() ?? 'Event',
    subtitle: ev.description?.split('\n')[0]?.slice(0, 80),
    tag: tags,
    date: dateKey,
    allDay,
    startTime: allDay ? undefined : startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }),
    endTime: ev.endDate ? ev.endDate.toJSDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }) : undefined,
  }
}

function extractTag(summary: string): string | undefined {
  const match = summary.match(/\[([^\]]+)\]/)
  return match ? match[1].toUpperCase() : undefined
}
