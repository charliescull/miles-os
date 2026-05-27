'use client'

import { useState, useEffect } from 'react'
import Shell from '@/components/dashboard/Shell'
import { RefreshCw } from 'lucide-react'

interface FinanceData {
  net_worth: number
  liquid: number
  invested: number
  liabilities: number
  change_30d_pct?: number
  change_1y_pct?: number
  runway_months?: number
  income_mo?: number
  burn_mo?: number
  save_rate?: number
  checking?: number
  savings?: number
  hysa?: number
  stables?: number
  equities?: number
  index?: number
  crypto?: number
  private_inv?: number
  cc_float?: number
  car_lease?: number
  loc?: number
  tax_accrued?: number
  history?: HistoryRow[]
  sparklines?: { liquid: number[]; invested: number[]; liabilities: number[] }
}

interface HistoryRow {
  period: string
  net_worth: number
  liquid: number
  invested: number
  liabilities: number
  delta: number
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '$[—]'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n?: number) {
  if (n === undefined || n === null) return '[—]%'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function Sparkline({ data, color = 'oklch(0.72 0.18 145)' }: { data?: number[]; color?: string }) {
  if (!data || data.length < 2) return <div className="h-10" />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 300; const h = 40
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="opacity-70">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatCard({ label, sub, value, sub2, extra }: { label: string; sub?: string; value: string; sub2?: string; extra?: string }) {
  return (
    <div className="card rounded-sm p-4">
      <p className="card-label">{label}</p>
      {sub && <p className="text-[10px] text-[oklch(0.45_0_0)] mt-0.5">{sub}</p>}
      <p className="mono text-2xl font-light text-white mt-1">{value}</p>
      {sub2 && <p className="mono text-xs text-[oklch(0.72_0.18_145)] mt-0.5">{sub2}</p>}
      {extra && <p className="card-label mt-0.5">{extra}</p>}
    </div>
  )
}

export default function FinancePage() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load(refresh = false) {
    try {
      const url = refresh ? '/api/finance/snapshot?refresh=1' : '/api/finance/snapshot'
      const res = await fetch(url)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const d = data

  return (
    <Shell>
      <div className="p-4 space-y-3 overflow-y-auto h-[calc(100vh-40px)]">

        {/* Top row: net worth + summary cards */}
        <div className="grid grid-cols-4 gap-3">
          <div className="card rounded-sm p-4 col-span-1">
            <div className="flex items-center justify-between mb-1">
              <p className="card-label">NET WORTH · LIVE</p>
              <button onClick={() => { setRefreshing(true); load(true) }} className="text-[oklch(0.40_0_0)] hover:text-white transition-colors">
                <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>
            <p className="mono text-3xl font-light text-white">{loading ? '...' : fmt(d?.net_worth)}</p>
            <div className="flex gap-2 mt-1">
              {d?.change_30d_pct !== undefined && (
                <span className={`mono text-[10px] px-1.5 py-0.5 rounded-sm border ${d.change_30d_pct >= 0 ? 'badge-warm' : 'badge-hot'}`}>
                  {d.change_30d_pct >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(d.change_30d_pct))} · 30D
                </span>
              )}
              {d?.change_1y_pct !== undefined && (
                <span className={`mono text-[10px] px-1.5 py-0.5 rounded-sm border ${d.change_1y_pct >= 0 ? 'badge-warm' : 'badge-hot'}`}>
                  {d.change_1y_pct >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(d.change_1y_pct))} · 1Y
                </span>
              )}
            </div>
            <div className="mt-2 h-10">
              <Sparkline data={[]} />
            </div>
          </div>

          <StatCard
            label="RUNWAY"
            value={d?.runway_months ? `${d.runway_months} mo` : '[—] mo'}
            sub="@ current burn · static"
            sub2="∞ at projected delta"
          />
          <StatCard
            label="INCOME / MO"
            value={fmt(d?.income_mo)}
            sub2={d?.income_mo ? `${fmtPct(0)} vs L3M avg` : undefined}
            extra="3 sources · 2 recurring"
          />
          <StatCard
            label="BURN / MO"
            value={fmt(d?.burn_mo)}
            sub="stable · ±[—]% L3M"
            extra={d?.save_rate ? `${d.save_rate}% save rate` : '[—]% save rate'}
          />
        </div>

        {/* Asset breakdown */}
        <div className="grid grid-cols-3 gap-3">
          {/* Liquid cash */}
          <div className="card rounded-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <div>
                <span className="mono text-[10px] text-[oklch(0.40_0_0)]">a1 //</span>
                <span className="card-label ml-1">LIQUID CASH</span>
              </div>
              <span className="card-label text-[oklch(0.40_0_0)]">[—]% OF NET</span>
            </div>
            <p className="mono text-2xl font-light text-white mb-2">{fmt(d?.liquid)}</p>
            <Sparkline data={d?.sparklines?.liquid} />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
              {[['CHECKING', d?.checking], ['SAVINGS', d?.savings], ['HYSA', d?.hysa], ['STABLES', d?.stables]].map(([l, v]) => (
                <div key={l as string}>
                  <p className="card-label">{l as string}</p>
                  <p className="mono text-xs text-white">{fmt(v as number | undefined)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Invested */}
          <div className="card rounded-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <div>
                <span className="mono text-[10px] text-[oklch(0.40_0_0)]">a2 //</span>
                <span className="card-label ml-1">INVESTED ASSETS</span>
              </div>
              <span className="card-label text-[oklch(0.40_0_0)]">[—]% OF NET</span>
            </div>
            <p className="mono text-2xl font-light text-white mb-2">{fmt(d?.invested)}</p>
            <Sparkline data={d?.sparklines?.invested} />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
              {[['EQUITIES', d?.equities], ['INDEX', d?.index], ['CRYPTO', d?.crypto], ['PRIVATE', d?.private_inv]].map(([l, v]) => (
                <div key={l as string}>
                  <p className="card-label">{l as string}</p>
                  <p className="mono text-xs text-white">{fmt(v as number | undefined)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Liabilities */}
          <div className="card rounded-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <div>
                <span className="mono text-[10px] text-[oklch(0.40_0_0)]">a3 //</span>
                <span className="card-label ml-1">LIABILITIES</span>
              </div>
              <span className="card-label text-[oklch(0.40_0_0)]">[—]% OF NET</span>
            </div>
            <p className="mono text-2xl font-light text-white mb-2">{fmt(d?.liabilities)}</p>
            <Sparkline data={d?.sparklines?.liabilities} color="oklch(0.65 0.22 25)" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
              {[['CC FLOAT', d?.cc_float], ['CAR LEASE', d?.car_lease], ['LOC', d?.loc], ['TAX ACCR.', d?.tax_accrued]].map(([l, v]) => (
                <div key={l as string}>
                  <p className="card-label">{l as string}</p>
                  <p className="mono text-xs text-white">{fmt(v as number | undefined)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Snapshot history */}
        <div className="card rounded-sm">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[oklch(1_0_0/0.05)]">
            <div>
              <span className="mono text-[10px] text-[oklch(0.40_0_0)]">a4 //</span>
              <span className="card-label ml-1">SNAPSHOT HISTORY</span>
            </div>
            <span className="card-label">MONTHLY · 24MO</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[oklch(1_0_0/0.05)]">
                {['PERIOD', 'NET WORTH', 'LIQUID', 'INVESTED', 'LIABILITIES', 'Δ VS PRIOR'].map(h => (
                  <th key={h} className="px-4 py-2 text-left card-label font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(d?.history ?? []).map((row, i) => (
                <tr key={row.period} className={`border-b border-[oklch(1_0_0/0.04)] hover:bg-[oklch(1_0_0/0.02)] transition-colors`}>
                  <td className="px-4 py-2 card-label">{row.period}</td>
                  <td className="px-4 py-2 mono text-white">{fmt(row.net_worth)}</td>
                  <td className="px-4 py-2 mono text-[oklch(0.60_0_0)]">{fmt(row.liquid)}</td>
                  <td className="px-4 py-2 mono text-[oklch(0.60_0_0)]">{fmt(row.invested)}</td>
                  <td className="px-4 py-2 mono text-[oklch(0.60_0_0)]">{fmt(row.liabilities)}</td>
                  <td className={`px-4 py-2 mono font-medium ${row.delta >= 0 ? 'text-[oklch(0.72_0.18_145)]' : 'text-[oklch(0.65_0.22_25)]'}`}>
                    {row.delta !== 0 ? (row.delta >= 0 ? '+' : '') + fmt(row.delta) : '$0'}
                  </td>
                </tr>
              ))}
              {(!d?.history || d.history.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[oklch(0.35_0_0)] text-xs">
                    No snapshots yet — click refresh to run the first analysis
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  )
}
