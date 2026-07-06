'use client'

// Paycheck / income logger (finance overhaul v2 follow-up). Logged income raises cash → net worth.
// Self-fetches /api/finance/income; calls onChange so the parent reloads net worth immediately.

import { useEffect, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'

interface Summary { total: number; monthToDate: number; recent: { id: string; amount: number; source: string | null }[] }
const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export default function PaycheckBar({ onChange }: { onChange?: () => void }) {
  const [s, setS] = useState<Summary | null>(null)
  const [amt, setAmt] = useState('')
  const [source, setSource] = useState('paycheck')

  const load = useCallback(async () => {
    const res = await fetch('/api/finance/income')
    if (res.ok) setS(await res.json())
  }, [])
  useEffect(() => { load() }, [load])

  async function log() {
    const amount = parseFloat(amt)
    if (!Number.isFinite(amount) || amount <= 0) return
    await fetch('/api/finance/income', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, source }),
    })
    setAmt(''); await load(); onChange?.()
  }
  const field = 'mono text-xs bg-[oklch(0.06_0_0)] border border-[oklch(1_0_0/0.08)] px-2 py-1 text-white placeholder:text-[oklch(0.40_0_0)] focus:outline-none focus:border-[var(--signal-up)]'

  return (
    <div className="card rounded-sm p-3 flex items-center gap-4 flex-wrap">
      <div>
        <span className="card-label">INCOME · MTD</span>
        <p className="mono text-lg" style={{ color: 'var(--signal-up)' }}>{s ? usd(s.monthToDate) : '—'}</p>
      </div>
      <div>
        <span className="card-label">TOTAL LOGGED</span>
        <p className="mono text-lg text-white">{s ? usd(s.total) : '—'}</p>
      </div>
      <div className="flex gap-2 ml-auto items-center">
        <select value={source} onChange={e => setSource(e.target.value)} className={field}>
          <option value="paycheck">paycheck</option>
          <option value="refund">refund</option>
          <option value="other">other</option>
        </select>
        <input value={amt} onChange={e => setAmt(e.target.value)} onKeyDown={e => e.key === 'Enter' && log()} inputMode="decimal" placeholder="$ amount" className={`${field} w-24`} />
        <button onClick={log} className="hud text-xs px-3 py-1 flex items-center gap-1 bg-[var(--signal-up)] text-black hover:brightness-110 transition"><Plus size={11} /> log</button>
      </div>
    </div>
  )
}
