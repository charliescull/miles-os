'use client'

import { useState, useEffect } from 'react'
import Shell from '@/components/dashboard/Shell'
import FinanceCore from '@/components/finance/FinanceCore'
import { LineChart, Sparkline, Donut } from '@/components/finance/charts'
import { HatchStrip } from '@/components/hud'
import TradeForm from '@/components/finance/TradeForm'
import MarketNews, { type MarketBrief } from '@/components/finance/MarketNews'
import Scores, { type PortfolioScore } from '@/components/finance/Scores'
import Recurring from '@/components/finance/Recurring'
import CreditCard from '@/components/finance/CreditCard'
import SpendReadout from '@/components/finance/SpendReadout'
import PaycheckBar from '@/components/finance/PaycheckBar'
import FoodRing from '@/components/finance/FoodRing'
import DreamCar from '@/components/finance/DreamCar'
import BuyingPower from '@/components/finance/BuyingPower'
import { RefreshCw, ChevronDown, Plus, Pencil } from 'lucide-react'

// B&W 2.0 signal tokens — match --signal-up / --signal-down in globals.css
const GREEN = 'oklch(0.78 0.17 150)'
const RED = 'oklch(0.64 0.21 27)'

// ---- shapes (mirror lib/finance/types.ts FinanceView) ----
interface Candle { t: number[]; c: number[] }
interface Holding {
  id?: string; ticker: string; companyName: string | null; shares: number; avgCost: number | null
  instrument: 'equity' | 'etf' | 'crypto'; sector: string; pinned?: boolean
  price: number | null; positionValue: number | null
  move7dAbs: number | null; move7dPct: number | null
  costAbs: number | null; costPct: number | null
}
interface Outlook { ticker: string; summary: string; outlook: string }
interface FinanceView {
  netWorth: number; investmentsSide: number; positionsValue: number; buyingPower: number
  bankBalance: number; income?: number; spendToday?: number; spendWeek?: number
  weeklyProfit: number; completedWeeks: number
  total7dAbs: number; total7dPct: number
  holdings: Holding[]; top3: string[]
  sectorPie: { label: string; value: number }[]; capPie: { label: string; value: number }[]
  food: { weekStart: string; budget: number; spent: number; remaining: number }
  charts: Record<string, { d7: Candle | null; d30: Candle | null; d60: Candle | null }>
  sparklines: Record<string, number[]>
  news: Record<string, { headline: string; source: string; url: string }[]>
  outlooks: Record<string, Outlook>
  marketBrief?: MarketBrief | null
  score?: PortfolioScore | null
  dreamTarget?: number
  dreamLabel?: string
  fetchedAt: string
}

const usd = (n: number | null | undefined, dp = 2) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n)
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`)
const shares = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(6).replace(/0+$/, '').replace(/\.$/, ''))
const sign = (n: number | null | undefined) => (n === null || n === undefined ? 'oklch(0.55 0 0)' : n >= 0 ? GREEN : RED)
const arrow = (n: number) => (n >= 0 ? '▲' : '▼')

function Pnl({ abs, pctv }: { abs: number | null; pctv: number | null }) {
  if (abs === null) return <span className="text-[oklch(0.40_0_0)]">—</span>
  return (
    <span className="mono" style={{ color: sign(abs) }}>
      {pct(pctv)} <span className="text-[oklch(0.50_0_0)]">/</span> {abs >= 0 ? '+' : ''}{usd(abs)}
    </span>
  )
}

function TopCard({ v, ticker }: { v: FinanceView; ticker: string }) {
  const [range, setRange] = useState<'d7' | 'd30' | 'd60'>('d7')
  const h = v.holdings.find(x => x.ticker === ticker)
  if (!h) return null
  const candle = v.charts[ticker]?.[range]
  const ol = v.outlooks[ticker]
  const headlines = v.news[ticker] ?? []

  return (
    <div className="card rounded-sm p-3 flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="mono text-sm text-white">{ticker}</span>
          <span className="card-label ml-1.5">{h.companyName ?? ''}</span>
        </div>
        <span className="mono text-sm text-white">{usd(h.price)}</span>
      </div>

      <div className="flex gap-4 text-[10px]">
        <div><span className="card-label">7D</span> <Pnl abs={h.move7dAbs} pctv={h.move7dPct} /></div>
        <div><span className="card-label">COST</span> <Pnl abs={h.costAbs} pctv={h.costPct} /></div>
      </div>

      {h.pinned ? (
        <div className="h-[120px] flex items-center justify-center text-[10px] text-[oklch(0.45_0_0)] border border-dashed border-[oklch(1_0_0/0.08)] rounded-sm">
          price pinned · ${h.price?.toFixed(2)}
        </div>
      ) : (
        <>
          <LineChart candle={candle ?? null} />
          <div className="flex gap-1">
            {(['d7', 'd30', 'd60'] as const).map(rr => (
              <button
                key={rr}
                onClick={() => setRange(rr)}
                className={`mono text-[9px] px-1.5 py-0.5 border ${range === rr ? 'border-white/50 text-white' : 'border-[oklch(1_0_0/0.06)] text-[oklch(0.45_0_0)]'}`}
              >
                {rr.slice(1)}D
              </button>
            ))}
          </div>
        </>
      )}

      <div className="border-t border-[oklch(1_0_0/0.05)] pt-2 mt-1">
        {ol?.summary ? (
          <p className="text-[10px] text-[oklch(0.65_0_0)] leading-relaxed">{ol.summary}</p>
        ) : headlines.length ? (
          <ul className="space-y-0.5">
            {headlines.slice(0, 2).map((n, i) => (
              <li key={i} className="text-[10px] text-[oklch(0.60_0_0)] truncate">· {n.headline}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[10px] text-[oklch(0.45_0_0)] italic">AI outlook — add Gemini key in env to enable</p>
        )}
        {ol?.outlook && <p className="text-[10px] text-[oklch(0.70_0_0)] leading-relaxed mt-1">{ol.outlook}</p>}
        <p className="text-[9px] text-[oklch(0.40_0_0)] mt-1">Not financial advice.</p>
      </div>
    </div>
  )
}

export default function FinancePage() {
  const [v, setV] = useState<FinanceView | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showSplit, setShowSplit] = useState(false)
  const [spend, setSpend] = useState('')
  const [tradeOpen, setTradeOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<{ id: string; ticker: string; shares: number; avgCost: number | null } | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/finance')
      if (res.ok) setV(await res.json())
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/finance/refresh', { method: 'POST' })
      if (res.ok) setV(await res.json())
    } finally {
      setRefreshing(false)
    }
  }

  async function logSpend() {
    const amount = parseFloat(spend)
    if (!Number.isFinite(amount) || amount === 0) return
    const res = await fetch('/api/finance/food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    })
    if (res.ok && v) {
      const food = await res.json()
      setV({ ...v, food })
      setSpend('')
      load() // refresh net worth (food variance can shift cash on week rollover)
    }
  }

  if (loading || !v) {
    return (
      <Shell>
        <div className="p-4 h-[calc(100vh-40px)] flex items-center justify-center text-[oklch(0.45_0_0)] mono text-sm">
          {loading ? 'loading positions…' : 'no data'}
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="overflow-y-auto h-[calc(100vh-40px)] bg-black">
        {/* discreet ambient data-streams down both page edges */}
        <div className="side-rail side-rail-l" aria-hidden />
        <div className="side-rail side-rail-r" aria-hidden />
        {/* Net-worth core organ — flashes green/red on daily P/L */}
        <FinanceCore className="h-[28vh] min-h-[200px]" />
        <HatchStrip height={6} />

      <div className="p-4 space-y-3">

        {/* ---- money header (net worth · food · credit) ---- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* net worth */}
          <div className="card card-charge rounded-sm p-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setShowSplit(s => !s)} className="flex items-center gap-1 group">
                <span className="card-label">NET WORTH</span>
                <ChevronDown size={11} className={`text-[oklch(0.45_0_0)] transition-transform ${showSplit ? 'rotate-180' : ''}`} />
              </button>
              <button onClick={refresh} className="text-[oklch(0.40_0_0)] hover:text-white transition-colors">
                <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>
            <p className="mono text-3xl font-light text-white mt-1">{usd(v.netWorth, 2)}</p>
            <p className="mono text-xs mt-1">
              <span style={{ color: GREEN }}>+{usd(v.income ?? 0)} in</span>
              <span className="text-[oklch(0.45_0_0)]"> · </span>
              <span style={{ color: RED }}>−{usd(v.spendWeek ?? 0)} wk spend</span>
            </p>
            {showSplit && (
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-[oklch(1_0_0/0.05)]">
                <div>
                  <p className="card-label">CASH</p>
                  <p className="mono text-sm text-white">{usd(v.bankBalance)}</p>
                </div>
                <div>
                  <p className="card-label">INVESTMENTS</p>
                  <p className="mono text-sm text-white">{usd(v.investmentsSide)}</p>
                </div>
              </div>
            )}
          </div>

          {/* food budget — $150 weekly ring */}
          <div className="card rounded-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">FOOD BUDGET</span>
              <span className="card-label text-[oklch(0.40_0_0)]">SUN–SAT · {v.food.weekStart}</span>
            </div>
            <FoodRing spent={v.food.spent} budget={v.food.budget} />
            <div className="flex gap-2 mt-3">
              <input
                value={spend}
                onChange={e => setSpend(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && logSpend()}
                inputMode="decimal"
                placeholder="food $__"
                className="mono text-xs bg-[oklch(0.06_0_0)] border border-[oklch(1_0_0/0.08)] px-2 py-1 w-24 text-white placeholder:text-[oklch(0.40_0_0)] focus:outline-none focus:border-white/40"
              />
              <button onClick={logSpend} className="hud text-xs px-3 py-1 bg-white text-black hover:bg-[oklch(0.90_0_0)] transition-colors">
                log
              </button>
            </div>
          </div>

          {/* credit / Discover (§10) */}
          <CreditCard />
        </div>

        {/* paychecks in · daily spend out (both flow into net worth) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PaycheckBar onChange={load} />
          <SpendReadout onChange={load} />
        </div>

        {/* ---- investments terminal ---- */}
        <div className="card rounded-sm p-4 space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <span className="card-label">TOTAL HOLDINGS</span>
              <p className="mono text-2xl font-light text-white">{usd(v.investmentsSide)}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="mono text-sm" style={{ color: sign(v.total7dAbs) }}>
                  {arrow(v.total7dAbs)} {pct(v.total7dPct)} <span className="text-[oklch(0.50_0_0)]">/</span> {v.total7dAbs >= 0 ? '+' : ''}{usd(v.total7dAbs)}
                </p>
                <span className="card-label">7-DAY · <BuyingPower value={v.buyingPower} onSaved={load} /></span>
              </div>
              <button
                onClick={() => { setEditTarget(null); setTradeOpen(true) }}
                className="hud text-xs px-2.5 py-1.5 flex items-center gap-1 border border-[var(--jarvis)] text-[var(--jarvis)] hover:bg-[oklch(0.10_0.02_240)] transition"
              >
                <Plus size={12} /> TRADE
              </button>
            </div>
          </div>

          {/* top 3 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {v.top3.map(t => <TopCard key={t} v={v} ticker={t} />)}
          </div>

          {/* portfolio (left ~60%) + market news (right ~40%) */}
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-3">
            {/* LEFT: holdings table + allocation donuts */}
            <div className="space-y-4 min-w-0">
              <div className="overflow-x-auto">
                <div className="grid grid-cols-[56px_56px_64px_104px_104px_72px_64px_78px_24px] gap-2 px-1 pb-1 border-b border-[oklch(1_0_0/0.06)]">
                  {['TICKER', '7D', 'PRICE', '7D P/L', 'COST P/L', 'SHARES', 'AVG', 'VALUE', ''].map((h, i) => (
                    <span key={i} className="card-label">{h}</span>
                  ))}
                </div>
                {v.holdings.map(h => (
                  <div key={h.ticker} className="grid grid-cols-[56px_56px_64px_104px_104px_72px_64px_78px_24px] gap-2 px-1 py-1.5 items-center border-b border-[oklch(1_0_0/0.03)] hover:bg-[oklch(1_0_0/0.02)] text-xs group">
                    <div>
                      <span className="mono text-white">{h.ticker}</span>
                      {h.pinned && <span className="card-label ml-1 text-[oklch(0.45_0_0)]">pin</span>}
                    </div>
                    <div className="w-[56px] h-6"><Sparkline data={v.sparklines[h.ticker]} height={24} /></div>
                    <span className="mono text-white">{usd(h.price)}</span>
                    <span className="text-[10px] truncate"><Pnl abs={h.move7dAbs} pctv={h.move7dPct} /></span>
                    <span className="text-[10px] truncate"><Pnl abs={h.costAbs} pctv={h.costPct} /></span>
                    <span className="mono text-[oklch(0.65_0_0)]">{shares(h.shares)}</span>
                    <span className="mono text-[oklch(0.65_0_0)]">{h.avgCost === null ? '—' : usd(h.avgCost)}</span>
                    <span className="mono text-white">{usd(h.positionValue)}</span>
                    {h.id ? (
                      <button
                        onClick={() => { setEditTarget({ id: h.id!, ticker: h.ticker, shares: h.shares, avgCost: h.avgCost }); setTradeOpen(true) }}
                        className="text-[oklch(0.35_0_0)] opacity-0 group-hover:opacity-100 hover:text-[var(--jarvis)] transition"
                        aria-label={`edit ${h.ticker}`}
                      >
                        <Pencil size={11} />
                      </button>
                    ) : <span />}
                  </div>
                ))}
                {v.holdings.length === 0 && (
                  <p className="text-[11px] text-[oklch(0.45_0_0)] py-6 text-center">
                    No positions yet — hit <span className="text-[var(--jarvis)]">+ TRADE</span> or Telegram “bought 10 NVDA @ 120”.
                  </p>
                )}
              </div>

              {/* allocation donuts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="card rounded-sm p-3">
                  <p className="card-label mb-2">SECTOR</p>
                  <Donut slices={v.sectorPie} size={120} />
                </div>
                <div className="card rounded-sm p-3">
                  <p className="card-label mb-2">MARKET CAP</p>
                  <Donut slices={v.capPie} size={120} />
                </div>
              </div>

              {/* portfolio scoring gauges (§8) */}
              <Scores score={v.score} />
            </div>

            {/* RIGHT: market news (populated by the phase-4 7am job) */}
            <MarketNews brief={v.marketBrief} />
          </div>
        </div>

        {/* recurring / bills module (§9) */}
        <Recurring onChange={load} />

        {/* dream-car progress (§11) */}
        <DreamCar netWorth={v.netWorth} target={v.dreamTarget ?? 88750} label={v.dreamLabel ?? '2022 Porsche 718 Cayman GTS 4.0'} />

        <p className="card-label text-center text-[oklch(0.35_0_0)]">
          updated {new Date(v.fetchedAt).toLocaleString()} · prices via Finnhub/Yahoo · XRP pinned
        </p>
      </div>
      </div>

      {tradeOpen && (
        <TradeForm
          edit={editTarget}
          onClose={() => { setTradeOpen(false); setEditTarget(null) }}
          onDone={() => { setTradeOpen(false); setEditTarget(null); load() }}
        />
      )}
    </Shell>
  )
}
