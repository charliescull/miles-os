'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * COMMAND // TASKS — the left rail. Neon-bordered boxes, one per actionable task
 * (backed by the tasks table, kind='task'). Check off from here or from phone /
 * Telegram; both stay in sync. Add quick tasks inline too.
 */

interface Task {
  id: string
  title: string
  status: string
  urgency?: string
  is_key?: boolean
}

// Distinct neon hues so tasks separate visually at a glance.
const NEON = [
  { c: 'oklch(0.82 0.17 195)', g: 'oklch(0.82 0.17 195 / 0.40)' }, // cyan
  { c: 'oklch(0.72 0.28 330)', g: 'oklch(0.72 0.28 330 / 0.40)' }, // magenta
  { c: 'oklch(0.86 0.23 130)', g: 'oklch(0.86 0.23 130 / 0.40)' }, // lime
  { c: 'oklch(0.80 0.18 65)',  g: 'oklch(0.80 0.18 65 / 0.40)'  }, // amber
  { c: 'oklch(0.72 0.20 285)', g: 'oklch(0.72 0.20 285 / 0.40)' }, // violet
  { c: 'oklch(0.80 0.20 25)',  g: 'oklch(0.80 0.20 25 / 0.40)'  }, // coral
]

export default function TaskList({ className = '' }: { className?: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/todos')
      setTasks(r.ok ? await r.json() : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 20000) // keep in sync with phone/Telegram check-offs
    return () => clearInterval(id)
  }, [load])

  async function toggle(t: Task) {
    const done = t.status !== 'done'
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: done ? 'done' : 'open' } : x))
    await fetch('/api/todos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, done }),
    })
    load()
  }

  async function add() {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, kind: 'task', urgency: 'today', priority_score: 50 }),
    })
    load()
  }

  const openCount = tasks.filter(t => t.status !== 'done').length

  return (
    <div className={`card rounded-sm flex flex-col min-h-0 h-full ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(0.82_0.13_225/0.12)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="mono text-[oklch(0.40_0_0)] text-[10px] font-medium">02 //</span>
          <span className="card-label text-[var(--jarvis)]">TASKS</span>
        </div>
        <span className="card-label">{openCount} OPEN</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
        {loading ? (
          <p className="mono text-[10px] text-[oklch(0.40_0_0)] px-1 py-2">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-[11px] text-[oklch(0.45_0_0)] px-1 py-2 leading-relaxed">
            No tasks yet. Tell the bot something to do — &ldquo;read 10 pages of book&rdquo; — and it lands here.
          </p>
        ) : (
          tasks.map((t, i) => {
            const neon = NEON[i % NEON.length]
            const done = t.status === 'done'
            return (
              <button
                key={t.id}
                onClick={() => toggle(t)}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 border rounded-sm transition-all"
                style={{
                  borderColor: done ? 'oklch(1 0 0 / 0.10)' : neon.c,
                  boxShadow: done ? 'none' : `0 0 7px ${neon.g}, inset 0 0 11px ${neon.g.replace('0.40', '0.10')}`,
                  background: done ? 'oklch(0.04 0 0)' : 'oklch(0.05 0 0)',
                  opacity: done ? 0.45 : 1,
                }}
              >
                <span
                  className="w-4 h-4 flex-shrink-0 flex items-center justify-center border text-[10px] leading-none"
                  style={{ borderColor: neon.c, background: done ? neon.c : 'transparent', color: 'oklch(0 0 0)' }}
                >
                  {done ? '✓' : ''}
                </span>
                <span className={`text-[12px] leading-tight ${done ? 'line-through text-[oklch(0.50_0_0)]' : 'text-white'}`}>
                  {t.title}
                </span>
                {t.is_key && !done && <span className="ml-auto text-[9px]" style={{ color: neon.c }}>★</span>}
              </button>
            )
          })
        )}
      </div>

      <div className="flex gap-2 items-center px-3 py-2 border-t border-[oklch(0.82_0.13_225/0.10)] flex-shrink-0">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="+ add task"
          className="flex-1 bg-transparent text-[12px] text-white outline-none placeholder-[oklch(0.35_0_0)]"
        />
        <button onClick={add} disabled={!draft.trim()} className="card-label text-[var(--jarvis-bright)] hover:glow-cyan disabled:opacity-30 transition-colors">ADD</button>
      </div>
    </div>
  )
}
