'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { config } from '@/lib/config'

/**
 * COMMAND // SCHEDULE — center column. Merges the read-only Google iCal feed
 * (/api/calendar) with the Supabase appointment mirror (/api/appointments) so
 * bot-created events show immediately. Toggle DAY (default) or WEEK.
 */

interface CalEvent {
  id: string
  title: string
  subtitle?: string
  tag?: string
  date: string
  allDay?: boolean
  startTime?: string
  endTime?: string
}

function dateKey(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: config.timezone })
}
function shift(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const nd = new Date(Date.UTC(y, m - 1, d + days))
  return nd.toISOString().slice(0, 10)
}
function weekOf(key: string): string[] {
  const [y, m, d] = key.split('-').map(Number)
  const anchor = new Date(Date.UTC(y, m - 1, d))
  const dow = anchor.getUTCDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  return Array.from({ length: 7 }, (_, i) => shift(key, mondayOffset + i))
}
function dayLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return {
    weekday: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase(),
    day: String(d).padStart(2, '0'),
    long: dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }),
  }
}

function EventRow({ ev }: { ev: CalEvent }) {
  return (
    <div className="flex gap-2.5 px-3 py-2 items-start border-b border-[oklch(1_0_0/0.04)] hover:bg-[oklch(0.82_0.13_225/0.04)] transition-colors">
      <div className="mono text-[10px] text-[var(--jarvis-dim)] flex-shrink-0 w-11 leading-tight">
        {ev.allDay ? 'ALL DAY' : <><div>{ev.startTime}</div>{ev.endTime && <div className="text-[oklch(0.40_0_0)]">{ev.endTime}</div>}</>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-white truncate">{ev.title}</p>
        {ev.subtitle && <p className="text-[10px] text-[oklch(0.45_0_0)] truncate mt-0.5">{ev.subtitle}</p>}
      </div>
      {ev.tag && <span className="mono text-[9px] px-1.5 py-0.5 border border-[oklch(0.82_0.13_225/0.25)] text-[var(--jarvis-dim)] rounded-sm flex-shrink-0">{ev.tag}</span>}
    </div>
  )
}

export default function CommandCalendar({ className = '' }: { className?: string }) {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'day' | 'week'>('day')
  const [cursor, setCursor] = useState(dateKey())

  const load = useCallback(async () => {
    try {
      const [ical, mirror] = await Promise.all([
        fetch('/api/calendar').then(r => r.ok ? r.json() : []),
        fetch('/api/appointments').then(r => r.ok ? r.json() : []),
      ])
      const seen = new Set<string>()
      const merged: CalEvent[] = []
      for (const e of [...mirror, ...ical] as CalEvent[]) {
        const k = `${e.date}|${e.startTime ?? 'all'}|${e.title}`
        if (seen.has(k)) continue
        seen.add(k); merged.push(e)
      }
      setEvents(merged)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [load])

  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const e of events) {
      const arr = map.get(e.date) ?? []
      arr.push(e); map.set(e.date, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.allDay ? '' : a.startTime ?? '').localeCompare(b.allDay ? '' : b.startTime ?? ''))
    }
    return map
  }, [events])

  const today = dateKey()
  const week = weekOf(cursor)
  const dl = dayLabel(cursor)

  return (
    <div className={`card rounded-sm flex flex-col min-h-0 h-full ${className}`}>
      {/* header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(0.82_0.13_225/0.12)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="mono text-[oklch(0.40_0_0)] text-[10px] font-medium">03 //</span>
          <span className="card-label text-[var(--jarvis)]">SCHEDULE</span>
        </div>
        <div className="flex items-center gap-1">
          {(['day', 'week'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`hud text-[10px] tracking-[0.16em] px-2 py-0.5 transition-colors ${view === v ? 'bg-[oklch(0.85_0.13_222)] text-black' : 'text-[oklch(0.50_0_0)] hover:text-[var(--jarvis-bright)]'}`}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* nav */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[oklch(1_0_0/0.05)] flex-shrink-0">
        <button onClick={() => setCursor(shift(cursor, view === 'day' ? -1 : -7))} className="hud text-[12px] text-[oklch(0.50_0_0)] hover:text-[var(--jarvis-bright)] px-2">‹</button>
        <button onClick={() => setCursor(today)} className="card-label hover:text-[var(--jarvis-bright)] transition-colors">
          {view === 'day' ? dl.long : `WEEK OF ${dayLabel(week[0]).long}`}
        </button>
        <button onClick={() => setCursor(shift(cursor, view === 'day' ? 1 : 7))} className="hud text-[12px] text-[oklch(0.50_0_0)] hover:text-[var(--jarvis-bright)] px-2">›</button>
      </div>

      {loading ? (
        <div className="p-3 mono text-[10px] text-[oklch(0.40_0_0)]">Loading schedule…</div>
      ) : view === 'day' ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {(byDay.get(cursor) ?? []).length === 0
            ? <p className="text-[11px] text-[oklch(0.40_0_0)] px-3 py-3">No events.</p>
            : (byDay.get(cursor) ?? []).map(ev => <EventRow key={ev.id} ev={ev} />)}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-7" style={{ gap: '1px', background: 'oklch(0.82 0.13 225 / 0.08)' }}>
          {week.map(key => {
            const l = dayLabel(key)
            const evs = byDay.get(key) ?? []
            const isToday = key === today
            return (
              <div key={key} className="bg-black min-h-[120px] flex flex-col">
                <button onClick={() => { setCursor(key); setView('day') }}
                  className={`flex flex-col items-center py-1.5 border-b border-[oklch(1_0_0/0.05)] ${isToday ? 'bg-[oklch(0.82_0.13_225/0.12)]' : ''}`}>
                  <span className="card-label">{l.weekday}</span>
                  <span className={`mono text-[13px] leading-none ${isToday ? 'glow-cyan' : 'text-white'}`}>{l.day}</span>
                </button>
                <div className="flex-1 overflow-y-auto p-1 space-y-1">
                  {evs.map(ev => (
                    <div key={ev.id} className="px-1.5 py-1 border-l-2 bg-[oklch(0.05_0_0)]" style={{ borderColor: 'oklch(0.82 0.13 225 / 0.7)' }}>
                      <div className="mono text-[8px] text-[var(--jarvis-dim)]">{ev.allDay ? 'ALL' : ev.startTime}</div>
                      <div className="text-[10px] text-white leading-tight truncate">{ev.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
