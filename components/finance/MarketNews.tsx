'use client'

// Market News panel (finance overhaul v2 §6.5) — right column of TOTAL HOLDINGS.
// Renders the server-generated daily brief (7am ET job) + a "this week" expandable.
// Scaffolded in phase 3; the payload (v.marketBrief) is populated by the phase-4 cron.

import { useState } from 'react'

export interface Mover { ticker: string; changePct: number }
export interface Bullet { title: string; detail: string; sentiment: 'positive' | 'negative' | 'neutral' }
export interface MarketBrief {
  headline: string | null
  body: string | null
  bullets: Bullet[]
  movers: { gainers: Mover[]; losers: Mover[] } | null
  briefDate: string | null
  weekly?: { headline: string | null; body: string | null } | null
}

const SENT_COLOR: Record<Bullet['sentiment'], string> = {
  positive: 'var(--signal-up)',
  negative: 'var(--stark-red)',
  neutral: 'oklch(0.55 0 0)',
}

export default function MarketNews({ brief }: { brief?: MarketBrief | null }) {
  const [showWeek, setShowWeek] = useState(false)

  if (!brief) {
    return (
      <div className="card rounded-sm p-3 h-full flex flex-col">
        <p className="card-label mb-2" style={{ color: 'var(--jarvis)' }}>MARKET NEWS</p>
        <div className="flex-1 flex items-center justify-center text-[10px] text-[oklch(0.40_0_0)] text-center px-2">
          No brief yet — the 7:00am ET job generates it. Add ALPHAVANTAGE_API_KEY + the cron-job.org
          07:00 job, or hit /api/cron/market-brief once to seed.
        </div>
      </div>
    )
  }

  return (
    <div className="card rounded-sm p-3 h-full flex flex-col gap-2 overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className="card-label" style={{ color: 'var(--jarvis)' }}>MARKET NEWS</p>
        {brief.briefDate && <span className="card-label text-[oklch(0.40_0_0)]">{brief.briefDate}</span>}
      </div>

      {brief.headline && (
        <p className="mono text-sm leading-snug" style={{ color: 'var(--jarvis-bright)' }}>{brief.headline}</p>
      )}
      {brief.body && <p className="text-[11px] text-[oklch(0.68_0_0)] leading-relaxed">{brief.body}</p>}

      {brief.bullets.length > 0 && (
        <ul className="space-y-1 mt-1">
          {brief.bullets.map((b, i) => (
            <li key={i} className="flex gap-1.5 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ background: SENT_COLOR[b.sentiment] }} />
              <span className="text-[oklch(0.72_0_0)]"><span className="text-white">{b.title}.</span> {b.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {brief.movers && (brief.movers.gainers.length > 0 || brief.movers.losers.length > 0) && (
        <div className="border-t border-[oklch(1_0_0/0.05)] pt-2 mt-1">
          <p className="card-label mb-1">MOVERS</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {[...brief.movers.gainers.slice(0, 3), ...brief.movers.losers.slice(0, 3)].map(m => (
              <span key={m.ticker} className="mono text-[10px]">
                <span className="text-white">{m.ticker}</span>{' '}
                <span style={{ color: m.changePct >= 0 ? 'var(--signal-up)' : 'var(--stark-red)' }}>
                  {m.changePct >= 0 ? '+' : ''}{m.changePct.toFixed(1)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {brief.weekly && (
        <div className="border-t border-[oklch(1_0_0/0.05)] pt-2 mt-auto">
          <button onClick={() => setShowWeek(s => !s)} className="card-label hover:text-white transition">
            {showWeek ? '▾' : '▸'} THIS WEEK
          </button>
          {showWeek && (
            <div className="mt-1">
              {brief.weekly.headline && <p className="mono text-[11px] text-white">{brief.weekly.headline}</p>}
              {brief.weekly.body && <p className="text-[10px] text-[oklch(0.65_0_0)] leading-relaxed mt-1">{brief.weekly.body}</p>}
            </div>
          )}
        </div>
      )}

      <p className="text-[9px] text-[oklch(0.38_0_0)] mt-1">Not financial advice.</p>
    </div>
  )
}
