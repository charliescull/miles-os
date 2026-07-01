'use client'

// Portfolio scoring gauges (finance overhaul v2 §8.3). Two half-circle gauges:
//   SENTIMENT (cyan family) and DIVERSIFICATION/RISK (amber→violet), each with score + label,
// then a risk-factors list (stark-red dots) and an upside line (cyan). Gauge fill animates on load.

import { useEffect, useState } from 'react'

export interface PortfolioScore {
  sentiment: number | null
  sentimentLabel: string | null
  diversification: number | null
  diversificationLabel: string | null
  risk: number | null
  riskFactors: string[]
  upside: string | null
}

// Blend two oklch endpoints in a channel-wise lerp (good enough for a gauge stroke).
function ramp(t: number, from: [number, number, number], to: [number, number, number]): string {
  const c = from.map((f, i) => f + (to[i] - f) * t)
  return `oklch(${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(1)})`
}

function Gauge({ value, label, sub, color }: { value: number; label: string; sub: string; color: string }) {
  const [fill, setFill] = useState(0)
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setFill(value); return }
    const id = requestAnimationFrame(() => setFill(value))
    return () => cancelAnimationFrame(id)
  }, [value])

  const R = 34
  const circ = Math.PI * R // half circle
  const offset = circ * (1 - fill / 100)

  return (
    <div className="flex flex-col items-center">
      <svg width="90" height="52" viewBox="0 0 90 52">
        <path d="M8 46 A37 37 0 0 1 82 46" fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="6" strokeLinecap="round" />
        <path
          d="M8 46 A37 37 0 0 1 82 46" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
        />
        <text x="45" y="42" textAnchor="middle" className="mono" fontSize="17" fill="oklch(0.96 0 0)">{Math.round(fill)}</text>
      </svg>
      <span className="card-label mt-0.5">{label}</span>
      <span className="mono text-[10px]" style={{ color }}>{sub}</span>
    </div>
  )
}

export default function Scores({ score }: { score?: PortfolioScore | null }) {
  if (!score || (score.sentiment === null && score.diversification === null)) {
    return (
      <div className="card rounded-sm p-3">
        <p className="card-label mb-1">PORTFOLIO SCORES</p>
        <p className="text-[10px] text-[oklch(0.42_0_0)]">Generated with the 7am brief — run /api/cron/market-brief once positions exist.</p>
      </div>
    )
  }

  // Sentiment: red (bearish) → cyan (bullish).
  const sentColor = ramp((score.sentiment ?? 50) / 100, [0.64, 0.21, 27], [0.82, 0.13, 225])
  // Diversification: violet (concentrated) → amber (diversified). Uses the risk score to shade.
  const divColor = ramp((score.diversification ?? 50) / 100, [0.62, 0.18, 300], [0.80, 0.15, 85])

  return (
    <div className="card rounded-sm p-3 space-y-3">
      <p className="card-label">PORTFOLIO SCORES</p>
      <div className="flex justify-around">
        {score.sentiment !== null && (
          <Gauge value={score.sentiment} label="SENTIMENT" sub={score.sentimentLabel ?? ''} color={sentColor} />
        )}
        {score.diversification !== null && (
          <Gauge value={score.diversification} label="DIVERSIFY" sub={score.diversificationLabel ?? ''} color={divColor} />
        )}
        {score.risk !== null && (
          <Gauge value={score.risk} label="RISK" sub={score.risk >= 66 ? 'High' : score.risk >= 33 ? 'Moderate' : 'Low'} color="var(--stark-red)" />
        )}
      </div>

      {score.riskFactors.length > 0 && (
        <div>
          <p className="card-label mb-1">RISK FACTORS</p>
          <ul className="space-y-0.5">
            {score.riskFactors.map((f, i) => (
              <li key={i} className="flex gap-1.5 text-[10px] text-[oklch(0.70_0_0)]">
                <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ background: 'var(--stark-red)' }} />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {score.upside && (
        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--jarvis-bright)' }}>
          <span className="card-label mr-1" style={{ color: 'var(--jarvis)' }}>UPSIDE</span>{score.upside}
        </p>
      )}
    </div>
  )
}
