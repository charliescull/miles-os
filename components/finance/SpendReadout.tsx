'use client'

// Today / this-week spend readout (finance overhaul v2 §10.3). Self-fetches /api/finance/spend;
// lets you quick-log a manual spend. SimpleFIN + Telegram rows land here too.

import { useEffect, useState, useCallback } from 'react'

interface Summary {
  today: number; thisWeek: number
  byCategory: { category: string; total: number }[]
  recent: { id: string; amount: number; merchant: string | null; category: string | null; source: string }[]
}

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

export default function SpendReadout({ onChange }: { onChange?: () => void }) {
  const [s, setS] = useState<Summary | null>(null)
  const [amt, setAmt] = useState('')
  const [what, setWhat] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/finance/spend')
    if (res.ok) setS(await res.json())
  }, [])
  useEffect(() => { load() }, [load])

  async function log() {
    const amount = parseFloat(amt)
    if (!Number.isFinite(amount) || amount <= 0) return
    await fetch('/api/finance/spend', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, merchant: what || undefined, category: what || undefined }),
    })
    setAmt(''); setWhat(''); await load(); onChange?.()
  }
  const field = 'mono text-xs bg-[oklch(0.06_0_0)] border border-[oklch(1_0_0/0.08)] px-2 py-1 text-white placeholder:text-[oklch(0.40_0_0)] focus:outline-none focus:border-[var(--jarvis)]'

  return (
    <div className="card rounded-sm p-3 flex items-center gap-4 flex-wrap">
      <div>
        <span className="card-label">TODAY</span>
        <p className="mono text-lg text-white">{s ? usd(s.today) : '—'}</p>
      </div>
      <div>
        <span className="card-label">THIS WEEK</span>
        <p className="mono text-lg text-white">{s ? usd(s.thisWeek) : '—'}</p>
      </div>
      {s && s.byCategory.length > 0 && (
        <div className="flex gap-2 flex-wrap flex-1">
          {s.byCategory.slice(0, 4).map(c => (
            <span key={c.category} className="mono text-[10px] text-[oklch(0.6_0_0)]">
              {c.category} <span className="text-white">{usd(c.total)}</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2 ml-auto">
        <input value={amt} onChange={e => setAmt(e.target.value)} inputMode="decimal" placeholder="$" className={`${field} w-16`} />
        <input value={what} onChange={e => setWhat(e.target.value)} onKeyDown={e => e.key === 'Enter' && log()} placeholder="what" className={`${field} w-24`} />
        <button onClick={log} className="hud text-xs px-3 py-1 bg-white text-black hover:bg-[oklch(0.9_0_0)] transition">log</button>
      </div>
    </div>
  )
}
