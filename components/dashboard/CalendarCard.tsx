'use client'

import { useState, useEffect } from 'react'
import Panel from './Panel'
import { config } from '@/lib/config'

interface CalEvent {
  id: string
  title: string
  subtitle?: string
  tag?: string
  startTime?: string
  endTime?: string
  allDay?: boolean
  date: string // YYYY-MM-DD
}

function localDateKey(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: config.timezone })
}

function getWeekDateStrings(): string[] {
  // Derive today in the configured timezone, then do pure date arithmetic
  const todayStr = localDateKey() // YYYY-MM-DD in configured tz
  const [y, m, d] = todayStr.split('-').map(Number)
  const anchor = new Date(y, m - 1, d)
  const dow = anchor.getDay() // 0=Sun — safe because we built from tz-correct date parts
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(y, m - 1, d + mondayOffset + i)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })
}

function fmtMonth(): string {
  return new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: config.timezone }).toUpperCase()
}

export default function CalendarCard({ className = '' }: { className?: string }) {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(localDateKey())

  const today = localDateKey()
  const weekDays = getWeekDateStrings()

  useEffect(() => {
    fetch('/api/calendar')
      .then(r => r.ok ? r.json() : [])
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [])

  const dayEvents = events.filter(e => e.date === selectedDate)

  const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

  return (
    <Panel
      id="04"
      label="CALENDAR"
      badge={<span className="card-label">{fmtMonth()}</span>}
      noPadding
      className={`min-h-0 ${className}`}
    >
      <div className="flex flex-col h-full min-h-0">
      {/* 7-day strip */}
      <div className="grid grid-cols-7 flex-none border-b border-[oklch(1_0_0/0.05)]">
        {weekDays.map((key, i) => {
          const isToday = key === today
          const isSelected = key === selectedDate
          const dayNum = parseInt(key.split('-')[2])

          return (
            <button
              key={key}
              onClick={() => setSelectedDate(key)}
              className={`
                py-2 flex flex-col items-center gap-0.5 transition-colors
                ${isSelected ? 'bg-white' : 'hover:bg-[oklch(1_0_0/0.03)]'}
                ${i < 6 ? 'border-r border-[oklch(1_0_0/0.04)]' : ''}
              `}
            >
              <span className={`card-label ${isSelected ? 'text-black' : ''}`}>
                {DAY_NAMES[i]}
              </span>
              <span className={`mono text-sm font-semibold leading-none ${
                isSelected ? 'text-black' : isToday ? 'glow' : 'text-white'
              }`}>
                {dayNum.toString().padStart(2, '0')}
              </span>
            </button>
          )
        })}
      </div>

      {/* Events for selected day — fills the screen on mobile, capped on desktop */}
      <div className="overflow-y-auto flex-1 min-h-0 lg:flex-none lg:max-h-[220px]">
        {loading ? (
          <div className="p-3 space-y-2 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-10 bg-[oklch(0.15_0_0)] rounded" />)}
          </div>
        ) : dayEvents.length === 0 ? (
          <div className="p-3">
            <p className="text-[oklch(0.35_0_0)] text-xs">No events</p>
          </div>
        ) : (
          dayEvents.map((ev, i) => (
            <div
              key={ev.id}
              className={`
                flex gap-3 px-3 py-2 items-start
                ${i < dayEvents.length - 1 ? 'border-b border-[oklch(1_0_0/0.04)]' : ''}
                hover:bg-[oklch(1_0_0/0.02)] transition-colors
              `}
            >
              <div className="mono text-[10px] text-[oklch(0.45_0_0)] flex-shrink-0 w-10">
                {ev.allDay ? (
                  <span>ALL DAY</span>
                ) : (
                  <div>
                    <div>{ev.startTime}</div>
                    {ev.endTime && <div>—</div>}
                    {ev.endTime && <div>{ev.endTime}</div>}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate">{ev.title}</p>
                {ev.subtitle && (
                  <p className="text-[10px] text-[oklch(0.45_0_0)] truncate mt-0.5">{ev.subtitle}</p>
                )}
              </div>
              {ev.tag && (
                <span className="mono text-[9px] px-1.5 py-0.5 border border-[oklch(1_0_0/0.12)] text-[oklch(0.50_0_0)] rounded-sm flex-shrink-0">
                  {ev.tag}
                </span>
              )}
            </div>
          ))
        )}
      </div>
      </div>
    </Panel>
  )
}
