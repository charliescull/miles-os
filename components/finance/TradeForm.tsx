'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search } from 'lucide-react'

// Buy / Sell / Edit modal (finance overhaul v2 §5.3). Posts to /api/finance/trade (applyTrade)
// or, in edit mode, PATCH /api/finance/holding. On success the parent reloads the view.

interface SymbolMatch { symbol: string; description: string; type: string }

interface EditTarget { id: string; ticker: string; shares: number; avgCost: number | null }

export default function TradeForm({
  onClose,
  onDone,
  edit,
}: {
  onClose: () => void
  onDone: () => void
  edit?: EditTarget | null
}) {
  const isEdit = !!edit
  const [ticker, setTicker] = useState(edit?.ticker ?? '')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [shares, setShares] = useState(edit ? String(edit.shares) : '')
  const [price, setPrice] = useState('')
  const [avgCost, setAvgCost] = useState(edit?.avgCost != null ? String(edit.avgCost) : '')
  const [note, setNote] = useState('')
  const [matches, setMatches] = useState<SymbolMatch[]>([])
  const [showMatches, setShowMatches] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ticker autocomplete (buy mode only — sells/edits use the existing position).
  useEffect(() => {
    if (isEdit || side === 'sell' || ticker.trim().length < 1) { setMatches([]); return }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/finance/symbol-search?q=${encodeURIComponent(ticker.trim())}`)
        if (res.ok) setMatches((await res.json()).matches ?? [])
      } catch { /* fail soft */ }
    }, 250)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [ticker, side, isEdit])

  // Prefill the live quote when a ticker is chosen (buy/sell).
  async function prefillPrice(sym: string) {
    try {
      const res = await fetch('/api/finance')
      if (!res.ok) return
      const v = await res.json()
      const h = (v.holdings ?? []).find((x: { ticker: string; price: number | null }) => x.ticker === sym.toUpperCase())
      if (h?.price) setPrice(String(h.price))
    } catch { /* ignore */ }
  }

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      if (isEdit && edit) {
        const res = await fetch('/api/finance/holding', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: edit.id,
            shares: shares === '' ? undefined : Number(shares),
            avgCost: avgCost === '' ? null : Number(avgCost),
          }),
        })
        const j = await res.json()
        if (!res.ok || !j.ok) throw new Error(j.error ?? 'edit failed')
      } else {
        const res = await fetch('/api/finance/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: ticker.trim().toUpperCase(),
            side,
            shares: Number(shares),
            price: Number(price),
            note: note || undefined,
            rawTicker: ticker.trim(),
          }),
        })
        const j = await res.json()
        if (!res.ok || !j.ok) throw new Error(j.error ?? 'trade failed')
      }
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  const field = 'mono text-sm bg-[oklch(0.06_0_0)] border border-[oklch(1_0_0/0.08)] px-2 py-1.5 text-white placeholder:text-[oklch(0.40_0_0)] focus:outline-none focus:border-[var(--jarvis)] w-full'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card rounded-sm p-4 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="hud text-sm text-white">{isEdit ? `EDIT ${edit?.ticker}` : 'NEW TRADE'}</span>
          <button onClick={onClose} className="text-[oklch(0.45_0_0)] hover:text-white"><X size={16} /></button>
        </div>

        {!isEdit && (
          <div className="flex gap-1">
            {(['buy', 'sell'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`hud text-xs px-3 py-1 flex-1 border ${side === s ? 'border-[var(--jarvis)] text-white bg-[oklch(0.10_0.02_240)]' : 'border-[oklch(1_0_0/0.08)] text-[oklch(0.50_0_0)]'}`}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {!isEdit && (
          <div className="relative">
            <div className="flex items-center gap-1.5">
              <Search size={12} className="text-[oklch(0.45_0_0)]" />
              <input
                value={ticker}
                onChange={e => { setTicker(e.target.value.toUpperCase()); setShowMatches(true) }}
                placeholder="ticker (e.g. NVDA)"
                className={field}
                autoFocus
              />
            </div>
            {showMatches && matches.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-[oklch(0.05_0_0)] border border-[oklch(1_0_0/0.1)] max-h-40 overflow-y-auto">
                {matches.map(m => (
                  <button
                    key={m.symbol}
                    onClick={() => { setTicker(m.symbol); setShowMatches(false); prefillPrice(m.symbol) }}
                    className="block w-full text-left px-2 py-1 hover:bg-[oklch(1_0_0/0.05)]"
                  >
                    <span className="mono text-xs text-white">{m.symbol}</span>
                    <span className="card-label ml-2 truncate">{m.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="card-label">SHARES</label>
            <input value={shares} onChange={e => setShares(e.target.value)} inputMode="decimal" placeholder="0" className={field} />
          </div>
          {isEdit ? (
            <div>
              <label className="card-label">AVG COST</label>
              <input value={avgCost} onChange={e => setAvgCost(e.target.value)} inputMode="decimal" placeholder="—" className={field} />
            </div>
          ) : (
            <div>
              <label className="card-label">{side === 'buy' ? 'PRICE' : 'SELL PRICE'}</label>
              <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="0.00" className={field} />
            </div>
          )}
        </div>

        {!isEdit && (
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="note (optional)" className={field} />
        )}

        {error && <p className="mono text-[10px]" style={{ color: 'var(--stark-red)' }}>{error}</p>}

        <button
          onClick={submit}
          disabled={busy || (!isEdit && !ticker.trim())}
          className="hud text-sm px-3 py-2 w-full bg-[var(--jarvis)] text-black hover:brightness-110 transition disabled:opacity-40"
        >
          {busy ? '…' : isEdit ? 'SAVE' : side === 'buy' ? 'RECORD BUY' : 'RECORD SELL'}
        </button>
      </div>
    </div>
  )
}
