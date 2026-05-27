'use client'

import { useState, useEffect } from 'react'
import Shell from '@/components/dashboard/Shell'
import { Check } from 'lucide-react'

interface ReviewData {
  wins: string
  what_slipped: string
  open_loops: string
  people_to_follow_up: string
  content_shipped: string
  health_pattern: string
  next_week_top3: string
}

const EMPTY: ReviewData = {
  wins: '',
  what_slipped: '',
  open_loops: '',
  people_to_follow_up: '',
  content_shipped: '',
  health_pattern: '',
  next_week_top3: '',
}

function getWeekLabel(): { label: string; weekNum: number; start: string; end: string } {
  const now = new Date()
  const jan1 = new Date(now.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  const dow = now.getDay()
  const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
  return { label: `W${weekNum}`, weekNum, start: fmt(mon), end: fmt(sun) }
}

const FIELDS: { key: keyof ReviewData; label: string; cols?: number }[] = [
  { key: 'wins', label: 'WINS THIS WEEK' },
  { key: 'what_slipped', label: 'WHAT SLIPPED' },
  { key: 'open_loops', label: 'OPEN LOOPS' },
  { key: 'people_to_follow_up', label: 'PEOPLE TO FOLLOW UP WITH' },
  { key: 'content_shipped', label: 'CONTENT SHIPPED' },
  { key: 'health_pattern', label: 'HEALTH PATTERN' },
]

export default function ReviewPage() {
  const week = getWeekLabel()
  const storageKey = `os-review-${week.weekNum}-${new Date().getFullYear()}`

  const [data, setData] = useState<ReviewData>(EMPTY)
  const [saved, setSaved] = useState(false)
  const [sealed, setSealed] = useState(false)

  useEffect(() => {
    const cached = localStorage.getItem(storageKey)
    if (cached) {
      try { setData(JSON.parse(cached)) } catch {}
    }
    // Also load from server
    fetch(`/api/review?week=${week.weekNum}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
  }, [storageKey, week.weekNum])

  function update(key: keyof ReviewData, val: string) {
    const next = { ...data, [key]: val }
    setData(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
    setSaved(false)
    // Auto-save after 1s
    setTimeout(async () => {
      await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week: week.weekNum, ...next }),
      })
      setSaved(true)
    }, 1000)
  }

  async function seal() {
    await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week: week.weekNum, ...data, sealed: true }),
    })
    setSealed(true)
  }

  return (
    <Shell>
      <div className="p-4 overflow-y-auto h-[calc(100vh-40px)] max-w-5xl mx-auto">
        {/* Header */}
        <div className="card rounded-sm p-4 mb-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="card-label mb-1">WEEKLY REVIEW · {week.label}</p>
              <h1 className="text-2xl font-light text-white">
                <em className="not-italic font-medium">Mon</em> {week.start} →{' '}
                <em className="not-italic font-medium">Sun</em> {week.end}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {saved && (
                <span className="card-label text-[oklch(0.72_0.18_145)]">AUTO-SAVED</span>
              )}
              <button
                onClick={seal}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[11px] font-semibold tracking-widest transition-colors ${
                  sealed
                    ? 'bg-[oklch(0.72_0.18_145/0.2)] border border-[oklch(0.72_0.18_145/0.4)] text-[oklch(0.72_0.18_145)]'
                    : 'bg-white text-black hover:bg-[oklch(0.90_0_0)]'
                }`}
              >
                <Check size={12} />
                SEAL WEEK
              </button>
            </div>
          </div>
        </div>

        {/* Field grid */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {FIELDS.map(({ key, label }) => (
            <div key={key} className="card rounded-sm p-4">
              <p className="card-label mb-2">{label}</p>
              <textarea
                value={data[key]}
                onChange={e => update(key, e.target.value)}
                placeholder={`${label.toLowerCase()}…`}
                rows={3}
                className="w-full bg-transparent text-sm text-white outline-none resize-none placeholder-[oklch(0.30_0_0)] leading-relaxed"
              />
            </div>
          ))}
        </div>

        {/* Next week top 3 */}
        <div className="card rounded-sm p-4">
          <p className="card-label mb-2">NEXT WEEK — TOP 3</p>
          <textarea
            value={data.next_week_top3}
            onChange={e => update('next_week_top3', e.target.value)}
            placeholder="1) … 2) … 3) …"
            rows={4}
            className="w-full bg-transparent text-sm text-white outline-none resize-none placeholder-[oklch(0.30_0_0)] leading-relaxed"
          />
        </div>
      </div>
    </Shell>
  )
}
