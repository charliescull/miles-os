import Anthropic from '@anthropic-ai/sdk'
import { getGoogleAccessToken } from '@/lib/google/auth'
import { localDateKey } from '@/lib/localDateKey'

// Calendar WRITE (Phase 4 of the Telegram agent). The existing app/api/calendar GET stays a
// read-only iCal feed; this adds event creation via the service account (shared with the
// calendar with "Make changes to events"). Reusable server-side — /api/calendar POST and the
// Telegram webhook both import createCalendarEvent / parseEventFromText.

const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

function calendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID || process.env.USER_EMAIL || 'primary'
}
function tz(): string {
  return process.env.USER_TIMEZONE || 'UTC'
}

export interface EventInput {
  summary: string
  description?: string
  allDay?: boolean
  start: string // 'YYYY-MM-DDTHH:mm:ss' (timed) or 'YYYY-MM-DD' (all-day)
  end?: string
  location?: string
}

export interface CreatedEvent {
  id: string
  htmlLink: string
  summary: string
  start: string
  end: string
  allDay: boolean
}

// Add one hour to a 'YYYY-MM-DDTHH:mm:ss' local datetime string (no TZ math — Google applies tz).
function plusOneHour(local: string): string {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return local
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)))
  d.setUTCHours(d.getUTCHours() + 1)
  return d.toISOString().slice(0, 19)
}
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function createCalendarEvent(input: EventInput): Promise<CreatedEvent> {
  if (!input.summary?.trim()) throw new Error('event summary required')
  if (!input.start?.trim()) throw new Error('event start required')

  const allDay = input.allDay ?? !input.start.includes('T')
  const body: Record<string, unknown> = {
    summary: input.summary.trim(),
    ...(input.description ? { description: input.description } : {}),
    ...(input.location ? { location: input.location } : {}),
  }

  if (allDay) {
    const startDate = input.start.slice(0, 10)
    const endDate = input.end ? input.end.slice(0, 10) : nextDay(startDate)
    body.start = { date: startDate }
    body.end = { date: endDate }
  } else {
    const start = input.start
    const end = input.end ?? plusOneHour(start)
    body.start = { dateTime: start, timeZone: tz() }
    body.end = { dateTime: end, timeZone: tz() }
  }

  const token = await getGoogleAccessToken(CAL_SCOPE)
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`Calendar create failed (${res.status}): ${json?.error?.message ?? 'unknown'}`)

  return {
    id: json.id,
    htmlLink: json.htmlLink,
    summary: json.summary,
    start: json.start?.dateTime ?? json.start?.date,
    end: json.end?.dateTime ?? json.end?.date,
    allDay,
  }
}

// Used for test cleanup (and a future "cancel" intent).
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const token = await getGoogleAccessToken(CAL_SCOPE)
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok && res.status !== 410) throw new Error(`Calendar delete failed (${res.status})`)
}

// Turn a natural-language message ("lunch with Sam tomorrow 12:30") into an EventInput using
// Claude, anchored to the user's current local date + timezone so "tomorrow"/"Friday" resolve.
export async function parseEventFromText(text: string): Promise<EventInput | null> {
  const today = localDateKey()
  const nowLocal = new Date().toLocaleString('en-US', { timeZone: tz() })
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const msg = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    output_config: { effort: 'max' },
    max_tokens: 400,
    system: `You convert a message into a calendar event. Today is ${today} (${nowLocal}), timezone ${tz()}.
Return ONLY a JSON object:
{ "summary": "short event title", "allDay": true|false, "start": "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DD", "end": same format or null, "location": string or null }
Rules:
- Resolve relative dates ("today","tomorrow","Friday","next week") against the date above.
- If a specific time is given, allDay=false and use "YYYY-MM-DDTHH:mm:ss" (24h, no timezone suffix). If no time, allDay=true and use "YYYY-MM-DD".
- If no explicit end, set "end": null (caller defaults to +1h for timed, +1 day for all-day).
- "summary" should be concise (no date/time words).
- If the text is NOT a request to schedule something, return { "summary": null }.`,
    messages: [{ role: 'user', content: text }],
  })

  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  const p = JSON.parse(match[0])
  if (!p.summary || typeof p.summary !== 'string') return null

  return {
    summary: p.summary,
    allDay: !!p.allDay,
    start: String(p.start),
    end: p.end ? String(p.end) : undefined,
    location: typeof p.location === 'string' ? p.location : undefined,
  }
}
