'use client'

import { useEffect, useState } from 'react'
import Panel from './Panel'
import { RefreshCw } from 'lucide-react'

interface FinanceSnapshot {
  net_worth: number
  currency: string
  as_of: string
  change_30d_pct?: number
  daily_delta?: number
  daily_delta_pct?: number
  monthly_delta?: number
  monthly_delta_pct?: number
  sparkline?: number[]
}

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 260
  const h = 40
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(' ')

  return (
    <svg width={w} height={h} className="w-full opacity-80">
      <polyline
        points={pts}
        fill="none"
        stroke="oklch(0.96 0 0)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number) {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

export default function FinancePulseCard() {
  const [data, setData] = useState<FinanceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load(refresh = false) {
    try {
      const url = refresh ? '/api/finance/snapshot?refresh=1' : '/api/finance/snapshot'
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // silent fail — show placeholder
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await load(true)
  }

  const placeholder: FinanceSnapshot = {
    net_worth: 0,
    currency: 'USD',
    as_of: '',
    change_30d_pct: 0,
    daily_delta: 0,
    daily_delta_pct: 0,
    monthly_delta: 0,
    monthly_delta_pct: 0,
  }
  const d = data ?? placeholder

  return (
    <Panel
      id="07"
      label="FINANCE PULSE"
      badge={<span className="card-label text-white drift-breathe">LIVE</span>}
      action={
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-[oklch(0.45_0_0)] hover:text-white transition-colors disabled:opacity-30"
          title="Refresh finance data"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
        </button>
      }
      className="min-h-0"
    >
      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-7 w-32 bg-[oklch(0.15_0_0)] rounded" />
          <div className="h-3 w-20 bg-[oklch(0.15_0_0)] rounded" />
        </div>
      ) : (
        <div>
          <div className="flex items-baseline justify-between">
            <p className="card-label mb-0.5">NET WORTH</p>
            {d.change_30d_pct !== undefined && (
              <span className={`mono text-[10px] px-1.5 py-0.5 rounded-sm border ${d.change_30d_pct >= 0 ? 'badge-warm' : 'badge-hot'}`}>
                {d.change_30d_pct >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(d.change_30d_pct))} · 30D
              </span>
            )}
          </div>
          <p className="mono text-2xl font-bold text-white leading-tight">
            {data ? fmt(d.net_worth) : '$[NET WORTH]'}
          </p>

          {/* Sparkline */}
          <div className="mt-2 -mx-1">
            <Sparkline data={d.sparkline ?? []} />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <p className="card-label mb-0.5">DAILY</p>
              <p className={`mono text-sm font-semibold ${(d.daily_delta ?? 0) >= 0 ? 'text-[var(--signal-up)]' : 'text-[var(--signal-down)]'}`}>
                {data ? fmt(d.daily_delta ?? 0) : '+$[DAY]'}
              </p>
              <p className="mono text-[10px] text-[oklch(0.45_0_0)]">
                {data ? fmtPct(d.daily_delta_pct ?? 0) : '+X.XX%'}
              </p>
            </div>
            <div>
              <p className="card-label mb-0.5">MONTHLY</p>
              <p className={`mono text-sm font-semibold ${(d.monthly_delta ?? 0) >= 0 ? 'text-[var(--signal-up)]' : 'text-[var(--signal-down)]'}`}>
                {data ? fmt(d.monthly_delta ?? 0) : '+$[MONTH]'}
              </p>
              <p className="mono text-[10px] text-[oklch(0.45_0_0)]">
                {data ? fmtPct(d.monthly_delta_pct ?? 0) : '+X.XX%'}
              </p>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}
