'use client'

import { useCallback, useEffect, useState } from 'react'
import { config } from '@/lib/config'

/**
 * COMMAND // NOTES — right column. A futuristic notepad: faint ruled lines, cyan
 * bullets. Notes arrive from Telegram as "X ..." (or typed here). They reset each
 * day (only the selected day shows); a history tab steps back through past days.
 */

interface Note { id: string; text: string; note_date: string; created_at: string }

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: config.timezone })
}
function pretty(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function NotesPad({ className = '' }: { className?: string }) {
  const today = todayKey()
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState<Note[]>([])
  const [dates, setDates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')

  const isToday = date === today

  const load = useCallback(async (d: string) => {
    const r = await fetch(`/api/notes?date=${d}`)
    setNotes(r.ok ? await r.json() : [])
    setLoading(false)
  }, [])

  useEffect(() => { load(date) }, [date, load])
  useEffect(() => {
    fetch('/api/notes?dates=1').then(r => r.ok ? r.json() : []).then(setDates)
    if (isToday) { const id = setInterval(() => load(today), 20000); return () => clearInterval(id) }
  }, [load, isToday, today])

  async function add() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
    load(today)
  }

  // step through days that have notes (plus today)
  const allDays = Array.from(new Set([today, ...dates])).sort().reverse()
  const idx = allDays.indexOf(date)
  const olderEnabled = idx >= 0 && idx < allDays.length - 1
  const newerEnabled = idx > 0

  return (
    <div className={`card rounded-sm flex flex-col min-h-0 h-full ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(0.82_0.13_225/0.12)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="mono text-[oklch(0.40_0_0)] text-[10px] font-medium">04 //</span>
          <span className="card-label text-[var(--jarvis)]">NOTES</span>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={!olderEnabled} onClick={() => setDate(allDays[idx + 1])} className="hud text-[11px] text-[oklch(0.50_0_0)] hover:text-[var(--jarvis-bright)] disabled:opacity-25">‹</button>
          <span className="card-label">{isToday ? 'TODAY' : pretty(date)}</span>
          <button disabled={!newerEnabled} onClick={() => setDate(allDays[idx - 1])} className="hud text-[11px] text-[oklch(0.50_0_0)] hover:text-[var(--jarvis-bright)] disabled:opacity-25">›</button>
        </div>
      </div>

      {/* ruled notepad surface */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2"
        style={{
          backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, oklch(0.82 0.13 225 / 0.07) 27px, oklch(0.82 0.13 225 / 0.07) 28px)',
        }}
      >
        {loading ? (
          <p className="mono text-[10px] text-[oklch(0.40_0_0)]">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="text-[11px] text-[oklch(0.45_0_0)] leading-relaxed">
            {isToday ? 'Nothing noted today. Send the bot “X …” to drop a note here.' : 'No notes this day.'}
          </p>
        ) : (
          <ul className="space-y-[7px]">
            {notes.map(n => (
              <li key={n.id} className="flex gap-2 text-[12px] leading-[28px] text-[oklch(0.86_0_0)]">
                <span className="text-[var(--jarvis-bright)] flex-shrink-0 glow-cyan">▸</span>
                <span className="flex-1">{n.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isToday && (
        <div className="flex gap-2 items-center px-3 py-2 border-t border-[oklch(0.82_0.13_225/0.10)] flex-shrink-0">
          <span className="text-[var(--jarvis-dim)] text-[12px]">▸</span>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
            placeholder="jot a note…"
            className="flex-1 bg-transparent text-[12px] text-white outline-none placeholder-[oklch(0.35_0_0)]"
          />
          <button onClick={add} disabled={!draft.trim()} className="card-label text-[var(--jarvis-bright)] hover:glow-cyan disabled:opacity-30 transition-colors">SAVE</button>
        </div>
      )}
    </div>
  )
}
