'use client'

import { useState } from 'react'

const GREEN = 'oklch(0.72 0.18 145)'
const RED = 'oklch(0.65 0.22 25)'

// Categorical palette for pies (gain/loss coloring does NOT apply here — spec §10).
const PIE_COLORS = [
  'oklch(0.72 0.18 145)',
  'oklch(0.60 0.10 230)',
  'oklch(0.78 0.16 90)',
  'oklch(0.70 0.14 300)',
  'oklch(0.72 0.13 60)',
  'oklch(0.70 0.12 190)',
  'oklch(0.65 0.16 350)',
  'oklch(0.65 0.22 25)',
  'oklch(0.55 0.10 145)',
  'oklch(0.50 0 0)',
]

function points(data: number[], w: number, h: number, pad = 2): string {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  return data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - pad * 2) - pad}`)
    .join(' ')
}

// ToS-style line chart: stroke green/red by direction, last-price tag, and an interactive
// crosshair that reads out the time + price at the hovered point.
export function LineChart({ candle, height = 120 }: { candle: { t: number[]; c: number[] } | null; height?: number }) {
  const [hoverX, setHoverX] = useState<number | null>(null)
  if (!candle || candle.c.length < 2) {
    return <div style={{ height }} className="flex items-center justify-center text-[10px] text-[oklch(0.40_0_0)]">no chart data</div>
  }
  const data = candle.c
  const times = candle.t
  const n = data.length
  const w = 320
  const pad = 6
  const up = data[n - 1] >= data[0]
  const color = up ? GREEN : RED
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const yPct = (v: number) => ((height - ((v - min) / range) * (height - pad * 2) - pad) / height) * 100

  const intraday = times.length > 1 && times[1] - times[0] < 86400
  const idx = hoverX === null ? null : Math.max(0, Math.min(n - 1, Math.round(hoverX * (n - 1))))
  const hx = idx === null ? 0 : (idx / (n - 1)) * 100

  const fmtT = (ts: number) => {
    const d = new Date(ts * 1000)
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return intraday ? `${date} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : date
  }

  return (
    <div
      className="relative w-full cursor-crosshair"
      style={{ height }}
      onMouseMove={e => {
        const r = e.currentTarget.getBoundingClientRect()
        setHoverX((e.clientX - r.left) / r.width)
      }}
      onMouseLeave={() => setHoverX(null)}
    >
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
        <polyline
          points={points(data, w, height, pad)}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {idx === null ? (
        <div
          className="mono absolute right-0 -translate-y-1/2 text-[9px] px-1 rounded-sm pointer-events-none"
          style={{ top: `${Math.max(6, Math.min(94, yPct(data[n - 1])))}%`, color, background: 'oklch(0.12 0 0)' }}
        >
          {data[n - 1].toFixed(2)}
        </div>
      ) : (
        <>
          <div className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${hx}%`, background: 'oklch(1 0 0 / 0.18)' }} />
          <div
            className="absolute w-1.5 h-1.5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${hx}%`, top: `${yPct(data[idx])}%`, background: color }}
          />
          <div
            className="mono absolute text-[9px] px-1 py-0.5 rounded-sm -translate-x-1/2 whitespace-nowrap pointer-events-none top-0"
            style={{ left: `${Math.min(82, Math.max(18, hx))}%`, background: 'oklch(0.16 0 0)', border: '1px solid oklch(1 0 0 / 0.1)' }}
          >
            <span style={{ color }}>${data[idx].toFixed(2)}</span>{' '}
            <span className="text-[oklch(0.5_0_0)]">{fmtT(times[idx])}</span>
          </div>
        </>
      )}
    </div>
  )
}

// One-color sparkline (green/red by 7d sign), no axes.
export function Sparkline({ data, height = 28 }: { data?: number[]; height?: number }) {
  if (!data || data.length < 2) return <div style={{ height }} className="w-full" />
  const w = 100
  const up = data[data.length - 1] >= data[0]
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="opacity-80">
      <polyline
        points={points(data, w, height)}
        fill="none"
        stroke={up ? GREEN : RED}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function arcPath(cx: number, cy: number, R: number, r: number, a0: number, a1: number): string {
  const pt = (rad: number, ang: number) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = pt(R, a0)
  const [x1, y1] = pt(R, a1)
  const [x2, y2] = pt(r, a1)
  const [x3, y3] = pt(r, a0)
  return `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z`
}

export function Donut({ slices, size = 140 }: { slices: { label: string; value: number }[]; size?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total <= 0) return <div style={{ height: size }} className="flex items-center justify-center text-[10px] text-[oklch(0.40_0_0)]">no data</div>

  const cx = size / 2
  const cy = size / 2
  const R = size / 2 - 2
  const r = R * 0.6
  let angle = -Math.PI / 2
  const segs = slices.map((s, i) => {
    const a0 = angle
    const a1 = angle + (s.value / total) * Math.PI * 2
    angle = a1
    return { ...s, a0, a1, i, pct: (s.value / total) * 100 }
  })
  const active = hover !== null ? segs[hover] : null

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {segs.map(s => (
          <path
            key={s.label}
            d={arcPath(cx, cy, R, r, s.a0, s.a1)}
            fill={PIE_COLORS[s.i % PIE_COLORS.length]}
            opacity={hover === null || hover === s.i ? 1 : 0.35}
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
            style={{ transition: 'opacity 0.15s' }}
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="mono" fontSize="13" fill="oklch(0.96 0 0)">
          {active ? `${active.pct.toFixed(0)}%` : ''}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="oklch(0.55 0 0)" style={{ letterSpacing: '0.05em' }}>
          {active ? active.label.toUpperCase() : ''}
        </text>
      </svg>
      <div className="flex flex-col gap-0.5">
        {segs.map(s => (
          <button
            key={s.label}
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
            className="flex items-center gap-1.5 text-left"
          >
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: PIE_COLORS[s.i % PIE_COLORS.length] }} />
            <span className="card-label" style={{ color: hover === s.i ? 'oklch(0.96 0 0)' : undefined }}>{s.label}</span>
            <span className="mono text-[10px] text-[oklch(0.55_0_0)]">{s.pct.toFixed(0)}%</span>
          </button>
        ))}
      </div>
    </div>
  )
}
