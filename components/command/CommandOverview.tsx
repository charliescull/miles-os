'use client'

import { useEffect, useState } from 'react'

const axes = [
  { label: 'FOCUS', value: 78 },
  { label: 'ENERGY', value: 61 },
  { label: 'ORDER', value: 84 },
  { label: 'HEALTH', value: 69 },
  { label: 'MOMENTUM', value: 73 },
]

function pointFor(index: number, value: number, radius = 86) {
  const angle = (-Math.PI / 2) + index * ((Math.PI * 2) / axes.length)
  const r = radius * (value / 100)
  return `${100 + Math.cos(angle) * r},${100 + Math.sin(angle) * r}`
}

function ring(radius: number) {
  return axes.map((_, index) => pointFor(index, radius)).join(' ')
}

export default function CommandOverview() {
  const [openTasks, setOpenTasks] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/todos')
      .then(response => response.ok ? response.json() : [])
      .then(tasks => setOpenTasks(Array.isArray(tasks) ? tasks.filter((task: { status?: string }) => task.status !== 'done').length : 0))
      .catch(() => setOpenTasks(null))
  }, [])

  return (
    <section className="command-overview hidden lg:grid lg:grid-cols-[1.25fr_0.9fr_1fr] gap-px mb-px" aria-label="Operating picture">
      <div className="command-overview__hero p-5 xl:p-6">
        <div className="flex items-center gap-2 mb-8">
          <span className="online-dot w-1.5 h-1.5 rounded-full bg-[var(--signal-up)] shadow-[0_0_10px_var(--signal-up)]" />
          <span className="card-label text-[var(--signal-up)]">LIVE OPERATING PICTURE</span>
        </div>
        <p className="hud text-[10px] tracking-[0.28em] text-[var(--jarvis-dim)] mb-2">AUG 05 // COMMAND CENTER</p>
        <h1 className="display text-2xl xl:text-3xl text-white leading-tight max-w-xl glow">
          Shape the day<br />before it shapes you.
        </h1>
        <div className="flex items-end justify-between gap-6 mt-8">
          <div>
            <p className="card-label mb-1">NEXT CONTROL INPUT</p>
            <p className="text-sm text-white">Clear the smallest open loop.</p>
          </div>
          <span className="mono text-xs text-[var(--signal-up)] whitespace-nowrap">{openTasks === null ? 'SYNCING' : `${openTasks} OPEN`}</span>
        </div>
      </div>

      <div className="command-overview__panel p-4 xl:p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="card-label text-[var(--jarvis)]">BALANCE MAP</span>
          <span className="mono text-[10px] text-[oklch(0.48_0_0)]">01 / 05</span>
        </div>
        <div className="relative mx-auto aspect-square max-w-[220px]">
          <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible" role="img" aria-label="Personal balance radar chart">
            {[20, 40, 60, 80].map(level => <polygon key={level} points={ring(level)} fill="none" stroke="oklch(0.82 0.13 225 / 0.16)" strokeWidth="0.7" />)}
            {axes.map((axis, index) => <line key={axis.label} x1="100" y1="100" x2={pointFor(index, 100).split(',')[0]} y2={pointFor(index, 100).split(',')[1]} stroke="oklch(0.82 0.13 225 / 0.15)" strokeWidth="0.7" />)}
            <polygon points={axes.map((axis, index) => pointFor(index, axis.value)).join(' ')} fill="oklch(0.78 0.17 150 / 0.13)" stroke="var(--signal-up)" strokeWidth="1.4" />
            {axes.map((axis, index) => {
              const [x, y] = pointFor(index, axis.value).split(',')
              return <circle key={axis.label} cx={x} cy={y} r="2.2" fill="var(--signal-up)" />
            })}
          </svg>
          {axes.map((axis, index) => {
            const angle = (-Math.PI / 2) + index * ((Math.PI * 2) / axes.length)
            const x = 50 + Math.cos(angle) * 50
            const y = 50 + Math.sin(angle) * 50
            return <span key={axis.label} className="absolute card-label text-[8px] text-[oklch(0.62_0_0)] -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>{axis.label}</span>
          })}
        </div>
      </div>

      <div className="command-overview__panel p-4 xl:p-5">
        <div className="flex items-center justify-between mb-5">
          <span className="card-label text-[var(--jarvis)]">SYSTEM READOUT</span>
          <span className="mono text-[10px] text-[var(--signal-up)]">NOMINAL</span>
        </div>
        <div className="space-y-5">
          {[['EXECUTION', '64%', 'var(--signal-up)'], ['RECOVERY', '72%', 'var(--jarvis)'], ['CLARITY', '81%', 'var(--signal-up)']].map(([label, value, color]) => (
            <div key={label}>
              <div className="flex justify-between mb-2"><span className="card-label">{label}</span><span className="mono text-[11px] text-white">{value}</span></div>
              <div className="h-1 bg-[oklch(1_0_0/0.08)] overflow-hidden"><div className="h-full" style={{ width: value, background: color, boxShadow: `0 0 12px ${color}` }} /></div>
            </div>
          ))}
        </div>
        <div className="border-t border-[oklch(1_0_0/0.08)] mt-7 pt-4 flex items-center justify-between">
          <span className="card-label">SIGNAL</span>
          <span className="mono text-[11px] text-[var(--signal-up)]">BUILD MOMENTUM</span>
        </div>
      </div>
    </section>
  )
}
