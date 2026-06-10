'use client'

import { useState, useEffect } from 'react'
import Panel from './Panel'
import { config } from '@/lib/config'

// Same streak rules as the HEALTH workout log: consecutive logged days back
// from today; REST days don't break it; today not yet logged doesn't break it.
function calcStreak(entries: { date: string; workout_type: string | null }[]): number {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: config.timezone })
  const map = new Map(entries.map(e => [e.date, e.workout_type]))
  let streak = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('en-CA', { timeZone: config.timezone })
    const type = map.get(key)
    if (type === undefined || type === null) {
      if (key < today) break
    } else if (type.toUpperCase() === 'REST') {
      continue
    } else {
      streak++
    }
  }
  return streak
}

export default function OperatorCard() {
  const [streak, setStreak] = useState(0)
  const [focus, setFocus] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('os-focus')
    if (saved) setFocus(saved)

    fetch('/api/workouts?days=30')
      .then(r => (r.ok ? r.json() : []))
      .then((data: { date: string; workout_type: string | null }[]) => {
        if (Array.isArray(data)) setStreak(calcStreak(data))
      })
      .catch(() => {})
  }, [])

  function saveFocus() {
    setFocus(draft)
    localStorage.setItem('os-focus', draft)
    setEditing(false)
  }

  return (
    <Panel
      id="01"
      label="OPERATOR"
      badge={
        <span className="flex items-center gap-1">
          <span className="online-dot w-1.5 h-1.5 bg-[var(--signal-up)] inline-block" style={{ boxShadow: '0 0 6px oklch(0.78 0.17 150 / 0.6)' }} />
          <span className="card-label text-[var(--signal-up)]">ONLINE</span>
        </span>
      }
      className="min-h-0"
    >
      <div className="flex gap-3">
        {/* Avatar placeholder */}
        <div className="
          w-12 h-12 flex-shrink-0
          bg-[oklch(0.06_0_0)] border border-white/20 glow-box
          flex items-center justify-center
          text-white text-lg hud
        ">
          {config.displayName.slice(0, 2).toUpperCase()}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">
            {config.displayName}
          </p>
          <p className="card-label mt-0.5">{config.role} · {config.location}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <p className="card-label mb-1">FOCUS</p>
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={saveFocus}
              onKeyDown={e => { if (e.key === 'Enter') saveFocus() }}
              className="
                w-full bg-transparent border-b border-white/40
                text-xs text-white outline-none pb-0.5
              "
              placeholder="Today's focus..."
            />
          ) : (
            <p
              onClick={() => { setDraft(focus); setEditing(true) }}
              className="text-xs text-[oklch(0.75_0_0)] cursor-text hover:text-white transition-colors truncate"
            >
              {focus || <span className="text-[oklch(0.40_0_0)]">Set focus…</span>}
            </p>
          )}
        </div>

        <div>
          <p className="card-label mb-1">STREAK</p>
          <p className="mono text-xs text-white">
            {streak} <span className="text-[oklch(0.45_0_0)]">DAYS</span>
          </p>
        </div>
      </div>
    </Panel>
  )
}
