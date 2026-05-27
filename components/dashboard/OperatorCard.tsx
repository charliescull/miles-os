'use client'

import { useState, useEffect } from 'react'
import Panel from './Panel'
import { config } from '@/lib/config'

export default function OperatorCard() {
  const [streak, setStreak] = useState(0)
  const [focus, setFocus] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('os-focus')
    if (saved) setFocus(saved)
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
          <span className="online-dot w-1.5 h-1.5 rounded-full bg-[oklch(0.72_0.18_145)] inline-block" />
          <span className="card-label text-[oklch(0.72_0.18_145)]">ONLINE</span>
        </span>
      }
      className="min-h-0"
    >
      <div className="flex gap-3">
        {/* Avatar placeholder */}
        <div className="
          w-12 h-12 rounded-sm flex-shrink-0
          bg-[oklch(0.15_0_0)] border border-[oklch(1_0_0/0.06)]
          flex items-center justify-center
          text-[oklch(0.72_0.18_145)] text-lg font-bold mono
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
                w-full bg-transparent border-b border-[oklch(0.72_0.18_145/0.4)]
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
