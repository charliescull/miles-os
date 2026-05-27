'use client'

import { useState, useEffect, useRef } from 'react'
import { Send } from 'lucide-react'
import Panel from './Panel'
import { config } from '@/lib/config'

interface Task {
  id: string
  title: string
  time_estimate_min?: number
  urgency: string
}

function LiveClock() {
  const [time, setTime] = useState({ h: '', m: '', s: '' })
  const [dateStr, setDateStr] = useState('')

  useEffect(() => {
    function update() {
      const now = new Date()
      const opts = { timeZone: config.timezone }
      const h = now.toLocaleString('en-US', { ...opts, hour: '2-digit', hour12: false })
      const m = now.toLocaleString('en-US', { ...opts, minute: '2-digit' }).padStart(2, '0')
      const s = now.toLocaleString('en-US', { ...opts, second: '2-digit' }).padStart(2, '0')
      const d = now.toLocaleDateString('en-US', { ...opts, weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()
      setTime({ h, m, s })
      setDateStr(d)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  const hour = parseInt(time.h ?? '0')
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="flex items-start justify-between">
      <div>
        <p className="text-2xl font-light text-white">
          {greeting}, <em className="font-semibold not-italic">{config.firstName}.</em>
        </p>
        <p className="card-label mt-1">{dateStr}</p>
      </div>
      <div className="text-right">
        <p className="mono text-3xl font-light text-white leading-none tracking-tight">
          {time.h}:{time.m}
          <span className="text-lg text-[oklch(0.45_0_0)]">{time.s}</span>
        </p>
        <p className="card-label mt-1">LOCAL TIME</p>
      </div>
    </div>
  )
}

export default function SessionCard() {
  const [intent, setIntent] = useState('')
  const [capture, setCapture] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const dirtyRef = useRef(false)

  useEffect(() => {
    const saved = localStorage.getItem('os-intent-today')
    if (saved) setIntent(saved)

    fetch('/api/tasks?status=open&urgency=today&key=true')
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!dirtyRef.current) setTasks(data.slice(0, 3)) })
      .catch(() => {})
  }, [])

  function saveIntent(val: string) {
    setIntent(val)
    localStorage.setItem('os-intent-today', val)
  }

  async function handleCapture() {
    if (!capture.trim()) return
    setSending(true)
    try {
      await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: capture, source: 'web' }),
      })
      setToast('Captured')
      setCapture('')
      setTimeout(() => setToast(''), 2000)
    } catch {
      setToast('Error')
      setTimeout(() => setToast(''), 2000)
    } finally {
      setSending(false)
    }
  }

  return (
    <Panel
      id="02"
      label="SESSION"
      badge={
        <span className="card-label">
          {config.timezone.split('/').pop()?.replace('_', ' ')} · {
            new Date().toLocaleTimeString('en-US', {
              timeZoneName: 'shortOffset',
              timeZone: config.timezone,
            }).split(' ').pop()
          }
        </span>
      }
      className="min-h-0"
    >
      <LiveClock />

      {/* Intent */}
      <div className="mt-4">
        <p className="card-label mb-1.5">TODAY I WILL</p>
        <input
          value={intent}
          onChange={e => saveIntent(e.target.value)}
          placeholder="Set today's one thing…"
          className="
            w-full bg-transparent border-b border-[oklch(1_0_0/0.08)]
            text-sm text-white outline-none pb-1
            placeholder-[oklch(0.40_0_0)]
            focus:border-[oklch(0.72_0.18_145/0.5)] transition-colors
          "
        />
      </div>

      {/* Capture bar */}
      <div className="mt-4 flex gap-2 items-center border border-[oklch(1_0_0/0.08)] rounded-sm px-3 py-2">
        <span className="card-label text-[oklch(0.35_0_0)] flex-shrink-0">↗</span>
        <input
          value={capture}
          onChange={e => setCapture(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCapture() }}
          placeholder="Capture"
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder-[oklch(0.35_0_0)]"
        />
        {toast && (
          <span className="card-label text-[oklch(0.72_0.18_145)]">{toast}</span>
        )}
        <button
          onClick={handleCapture}
          disabled={sending || !capture.trim()}
          className="
            flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[10px] font-bold tracking-widest
            bg-[oklch(0.72_0.18_145/0.15)] border border-[oklch(0.72_0.18_145/0.3)]
            text-[oklch(0.72_0.18_145)] hover:bg-[oklch(0.72_0.18_145/0.25)]
            disabled:opacity-30 disabled:cursor-not-allowed transition-colors
          "
        >
          <Send size={10} />
          CAPTURE
        </button>
      </div>

      {/* Top tasks */}
      {tasks.length > 0 && (
        <div className="mt-3 space-y-1">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 py-1">
              <span className="w-1 h-1 rounded-full bg-[oklch(0.72_0.18_145)] flex-shrink-0" />
              <span className="text-xs text-[oklch(0.75_0_0)] flex-1 truncate">{task.title}</span>
              {task.time_estimate_min && (
                <span className="mono text-[10px] text-[oklch(0.40_0_0)]">{task.time_estimate_min}m</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
