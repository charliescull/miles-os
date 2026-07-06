'use client'

// Weekly food budget as a $150 ring (finance overhaul v2 follow-up). Green while there's room,
// yellow as it gets close, red once over. The ring fills with spend; the center shows remaining.

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export default function FoodRing({ spent, budget, size = 120 }: { spent: number; budget: number; size?: number }) {
  const remaining = budget - spent
  const frac = budget > 0 ? spent / budget : 0            // 0..>1
  const over = frac > 1

  // Color: green with room, yellow when close (≥80% used), red when over.
  const color = over ? 'var(--stark-red)' : frac >= 0.8 ? 'oklch(0.80 0.16 90)' : 'var(--signal-up)'

  const R = size / 2 - 8
  const circ = 2 * Math.PI * R
  const filled = Math.min(1, frac) * circ

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="9" />
        <circle
          cx={size / 2} cy={size / 2} r={R} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0.22,1,0.36,1)' }}
        />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" className="mono rotate-90" fontSize="16"
          fill={over ? 'var(--stark-red)' : 'oklch(0.96 0 0)'} transform={`rotate(90 ${size / 2} ${size / 2})`}>
          {usd(remaining)}
        </text>
        <text x={size / 2} y={size / 2 + 13} textAnchor="middle" fontSize="8" fill="oklch(0.55 0 0)"
          transform={`rotate(90 ${size / 2} ${size / 2})`} style={{ letterSpacing: '0.05em' }}>
          {over ? 'OVER' : 'LEFT'}
        </text>
      </svg>
      <div className="text-xs space-y-1">
        <p className="mono text-white">{usd(spent)} <span className="card-label">/ {usd(budget)}</span></p>
        <p className="card-label">{Math.round(frac * 100)}% used</p>
        <p className="mono text-[10px]" style={{ color }}>{over ? `${usd(-remaining)} over` : `${usd(remaining)} to go`}</p>
      </div>
    </div>
  )
}
