'use client'

// Credit / Discover card (finance overhaul v2 §10.2). Balance, statement, min payment, due-date
// countdown (amber ≤5d, red ≤2d), utilization (amber >30%, red >50%), latest FICO + sparkline +
// monthly delta. Self-fetches from /api/finance/credit; opens CreditForm for manual monthly updates.

import { useEffect, useState, useCallback } from 'react'
import { Pencil } from 'lucide-react'
import { Sparkline } from './charts'
import CreditForm from './CreditForm'

interface View {
  account: {
    issuer: string; current_balance: number; statement_balance: number | null; min_payment: number | null
    credit_limit: number | null; due_date: string | null; apr: number | null; autopay: boolean
  } | null
  utilization: number | null
  fico: { latest: number | null; delta: number | null; history: { score: number; scored_on: string }[] }
}

const usd = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const daysUntil = (d: string) => Math.ceil((new Date(`${d}T00:00:00Z`).getTime() - Date.now()) / 86400_000)

export default function CreditCard() {
  const [v, setV] = useState<View | null>(null)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/finance/credit')
    if (res.ok) setV(await res.json())
  }, [])
  useEffect(() => { load() }, [load])

  const a = v?.account
  const util = v?.utilization ?? null
  const utilColor = util == null ? 'oklch(0.6 0 0)' : util > 0.5 ? 'var(--stark-red)' : util > 0.3 ? 'oklch(0.78 0.16 90)' : 'var(--signal-up)'
  const dLeft = a?.due_date ? daysUntil(a.due_date) : null
  const dueColor = dLeft == null ? 'oklch(0.6 0 0)' : dLeft <= 2 ? 'var(--stark-red)' : dLeft <= 5 ? 'oklch(0.78 0.16 90)' : 'oklch(0.7 0 0)'

  return (
    <div className="card rounded-sm p-4">
      <div className="flex items-center justify-between">
        <span className="card-label">CREDIT · {a?.issuer ?? 'Discover'}</span>
        <button onClick={() => setEditing(true)} className="text-[oklch(0.4_0_0)] hover:text-[var(--jarvis)] transition"><Pencil size={11} /></button>
      </div>

      {!a ? (
        <p className="text-[11px] text-[oklch(0.45_0_0)] mt-2">No card yet — tap the pencil to add balance, due date & FICO.</p>
      ) : (
        <>
          <p className="mono text-3xl font-light text-white mt-1">{usd(a.current_balance)}</p>
          <div className="flex items-center gap-3 mt-1 text-[10px]">
            <span className="card-label">min <span className="mono text-white">{usd(a.min_payment)}</span></span>
            {a.due_date && <span className="mono" style={{ color: dueColor }}>due {dLeft === 0 ? 'today' : dLeft && dLeft < 0 ? 'past' : `in ${dLeft}d`}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-[oklch(1_0_0/0.05)]">
            <div>
              <p className="card-label">UTILIZATION</p>
              <p className="mono text-sm" style={{ color: utilColor }}>{util == null ? '—' : `${(util * 100).toFixed(0)}%`}</p>
              <div className="h-1 bg-[oklch(0.1_0_0)] rounded-sm overflow-hidden mt-1">
                <div className="h-full" style={{ width: `${Math.min(100, (util ?? 0) * 100)}%`, background: utilColor }} />
              </div>
            </div>
            <div>
              <p className="card-label">FICO 8</p>
              <p className="mono text-sm text-white">
                {v?.fico.latest ?? '—'}
                {v?.fico.delta != null && (
                  <span className="ml-1 text-[10px]" style={{ color: v.fico.delta >= 0 ? 'var(--signal-up)' : 'var(--stark-red)' }}>
                    {v.fico.delta >= 0 ? '+' : ''}{v.fico.delta}
                  </span>
                )}
              </p>
              {v && v.fico.history.length > 1 && (
                <div className="h-5 mt-0.5"><Sparkline data={v.fico.history.map(h => h.score)} height={20} /></div>
              )}
            </div>
          </div>
        </>
      )}

      {editing && <CreditForm initial={a ?? null} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />}
    </div>
  )
}
