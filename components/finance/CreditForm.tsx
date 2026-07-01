'use client'

// Credit account + FICO manual entry (finance overhaul v2 §10.2). Updated monthly from the
// Discover app/statement. POSTs to /api/finance/credit.

import { useState } from 'react'
import { X } from 'lucide-react'

interface Account {
  issuer?: string; nickname?: string | null; last4?: string | null
  credit_limit?: number | null; current_balance?: number; statement_balance?: number | null
  min_payment?: number | null; due_date?: string | null; apr?: number | null; autopay?: boolean
}

export default function CreditForm({ initial, onClose, onSaved }: { initial: Account | null; onClose: () => void; onSaved: () => void }) {
  const [a, setA] = useState<Account>({
    issuer: initial?.issuer ?? 'Discover',
    credit_limit: initial?.credit_limit ?? undefined,
    current_balance: initial?.current_balance ?? undefined,
    statement_balance: initial?.statement_balance ?? undefined,
    min_payment: initial?.min_payment ?? undefined,
    due_date: initial?.due_date ?? '',
    apr: initial?.apr ?? undefined,
    autopay: initial?.autopay ?? false,
  })
  const [score, setScore] = useState('')
  const [busy, setBusy] = useState(false)
  const num = (k: keyof Account, val: string) => setA(s => ({ ...s, [k]: val === '' ? null : Number(val) }))
  const field = 'mono text-sm bg-[oklch(0.06_0_0)] border border-[oklch(1_0_0/0.08)] px-2 py-1.5 text-white placeholder:text-[oklch(0.40_0_0)] focus:outline-none focus:border-[var(--jarvis)] w-full'

  async function save() {
    setBusy(true)
    try {
      await fetch('/api/finance/credit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: { ...a, due_date: a.due_date || null },
          ...(score ? { score: Number(score) } : {}),
        }),
      })
      onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card rounded-sm p-4 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="hud text-sm text-white">CREDIT — {a.issuer}</span>
          <button onClick={onClose} className="text-[oklch(0.45_0_0)] hover:text-white"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="card-label flex flex-col gap-0.5">BALANCE<input defaultValue={a.current_balance ?? ''} onChange={e => num('current_balance', e.target.value)} inputMode="decimal" className={field} /></label>
          <label className="card-label flex flex-col gap-0.5">LIMIT<input defaultValue={a.credit_limit ?? ''} onChange={e => num('credit_limit', e.target.value)} inputMode="decimal" className={field} /></label>
          <label className="card-label flex flex-col gap-0.5">STATEMENT<input defaultValue={a.statement_balance ?? ''} onChange={e => num('statement_balance', e.target.value)} inputMode="decimal" className={field} /></label>
          <label className="card-label flex flex-col gap-0.5">MIN PAY<input defaultValue={a.min_payment ?? ''} onChange={e => num('min_payment', e.target.value)} inputMode="decimal" className={field} /></label>
          <label className="card-label flex flex-col gap-0.5">DUE DATE<input type="date" defaultValue={a.due_date ?? ''} onChange={e => setA(s => ({ ...s, due_date: e.target.value }))} className={field} /></label>
          <label className="card-label flex flex-col gap-0.5">APR %<input defaultValue={a.apr ?? ''} onChange={e => num('apr', e.target.value)} inputMode="decimal" className={field} /></label>
          <label className="card-label flex flex-col gap-0.5">FICO (new)<input value={score} onChange={e => setScore(e.target.value)} inputMode="numeric" placeholder="e.g. 742" className={field} /></label>
          <label className="card-label flex items-center gap-1.5 mt-4"><input type="checkbox" checked={!!a.autopay} onChange={e => setA(s => ({ ...s, autopay: e.target.checked }))} /> autopay on</label>
        </div>
        <button onClick={save} disabled={busy} className="hud text-sm px-3 py-2 w-full bg-[var(--jarvis)] text-black hover:brightness-110 transition disabled:opacity-40">
          {busy ? '…' : 'SAVE'}
        </button>
      </div>
    </div>
  )
}
