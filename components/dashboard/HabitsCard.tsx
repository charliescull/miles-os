'use client'

import { useState, useEffect, useRef } from 'react'
import Panel from './Panel'
import { BlockGauge } from '@/components/hud'
import { config } from '@/lib/config'

interface HabitState {
  done: string[]
}

function localDateKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: config.timezone })
}

export default function HabitsCard() {
  const today = localDateKey()
  const storageKey = `os-habits-${today}`
  const dirtyRef = useRef(false)

  const [state, setState] = useState<HabitState>({ done: [] })
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    // Load from localStorage first (instant)
    const cached = localStorage.getItem(storageKey)
    if (cached) {
      try { setState(JSON.parse(cached)) } catch {}
    }

    // Then sync from server
    fetch(`/api/habits?date=${today}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && !dirtyRef.current) {
          const s = { done: data.done ?? [] }
          setState(s)
          localStorage.setItem(storageKey, JSON.stringify(s))
        }
      })
      .catch(() => {})
  }, [today, storageKey])

  async function toggle(habitId: string) {
    dirtyRef.current = true
    const next = state.done.includes(habitId)
      ? state.done.filter(id => id !== habitId)
      : [...state.done, habitId]

    const newState = { done: next }
    setState(newState)
    localStorage.setItem(storageKey, JSON.stringify(newState))

    setSyncing(true)
    try {
      await fetch(`/api/habits/${today}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newState),
      })
    } catch {
      console.error('Habit sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const total = config.habits.length
  const done = state.done.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Panel
      id="03"
      label="HABITS"
      badge={
        <span className="mono text-[10px] text-[oklch(0.55_0_0)]">
          {done}/{total} · {pct}%
        </span>
      }
      action={
        <span className="card-label text-[oklch(0.35_0_0)]">
          DAILY SCORE · RESETS 00:00
        </span>
      }
      noPadding
      className="min-h-0"
    >
      {/* Progress gauge */}
      <div className="px-3 pt-2 pb-1">
        <BlockGauge ratio={done / Math.max(1, total)} segments={total * 3} signal="up" />
      </div>

      {done === 0 && (
        <p className="px-3 py-1 text-[oklch(0.40_0_0)] text-xs italic">Start with one.</p>
      )}

      <div className="grid grid-cols-3 gap-0">
        {config.habits.map((habit, i) => {
          const isDone = state.done.includes(habit.id)
          return (
            <button
              key={habit.id}
              onClick={() => toggle(habit.id)}
              className={`
                flex items-center gap-2 px-3 py-2 text-left transition-colors
                ${i % 3 !== 2 ? 'border-r border-[oklch(1_0_0/0.04)]' : ''}
                ${i < 3 ? 'border-b border-[oklch(1_0_0/0.04)]' : ''}
                hover:bg-[oklch(1_0_0/0.02)]
              `}
            >
              <span className={`
                w-3.5 h-3.5 border flex items-center justify-center flex-shrink-0 transition-colors
                ${isDone
                  ? 'bg-[var(--signal-up)] border-[var(--signal-up)]'
                  : 'border-[oklch(0.30_0_0)] bg-transparent'
                }
              `}
              style={isDone ? { boxShadow: '0 0 6px oklch(0.78 0.17 150 / 0.5)' } : undefined}>
                {isDone && (
                  <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                    <path d="M1 3L3 5L7 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              <div className="min-w-0">
                <p className={`text-[11px] truncate leading-tight ${isDone ? 'text-[var(--signal-up)]' : 'text-[oklch(0.70_0_0)]'}`}>
                  {habit.label}
                </p>
                <p className="card-label">{habit.category}</p>
              </div>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}
