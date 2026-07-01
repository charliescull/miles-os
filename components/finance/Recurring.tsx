'use client'

// Recurring / bills module (finance overhaul v2 §9.3) — Rocket-Money patterns: a 30-day
// upcoming-bills timeline, category rollups with a monthly total, a cancel tracker (tracker +
// reminder only — we never auto-cancel with the merchant), and an add/edit form.

import { useEffect, useState, useCallback } from 'react'
import { Plus, X } from 'lucide-react'

type Cadence = 'monthly' | 'yearly' | 'weekly' | 'quarterly' | 'one_time'
type RType = 'subscription' | 'trial' | 'fixed_term' | 'one_off'

interface Row {
  id: string; name: string; merchant: string | null; category: string; type: RType
  amount: number; cadence: Cadence; next_due: string | null; expiration_date: string | null
  status: string; auto_renews: boolean; notify_days_before: number
}
interface Summary {
  monthlyTotal: number; canceledMonthlySaved: number
  byCategory: { category: string; monthly: number }[]; next7Total: number
}

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
const CATEGORIES = ['streaming', 'software', 'insurance', 'rent', 'utility', 'gym', 'phone', 'other']
const TYPES: RType[] = ['subscription', 'trial', 'fixed_term', 'one_off']
const CADENCES: Cadence[] = ['monthly', 'yearly', 'weekly', 'quarterly', 'one_time']

export default function Recurring({ onChange }: { onChange?: () => void }) {
  const [items, setItems] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/finance/recurring')
    if (res.ok) { const j = await res.json(); setItems(j.items ?? []); setSummary(j.summary ?? null) }
  }, [])
  useEffect(() => { load() }, [load])

  async function cancel(id: string) {
    await fetch('/api/finance/recurring', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'canceled' }) })
    await load(); onChange?.()
  }
  async function remove(id: string) {
    await fetch(`/api/finance/recurring?id=${id}`, { method: 'DELETE' })
    await load(); onChange?.()
  }

  const active = items.filter(r => r.status === 'active')
  const maxCat = Math.max(1, ...(summary?.byCategory.map(c => c.monthly) ?? [1]))

  // 30-day timeline dots.
  const today = new Date()
  const dots = active
    .filter(r => r.next_due)
    .map(r => {
      const d = Math.round((new Date(`${r.next_due}T00:00:00Z`).getTime() - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400_000)
      return { r, d }
    })
    .filter(x => x.d >= 0 && x.d <= 30)

  return (
    <div className="card rounded-sm p-4 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <span className="card-label">RECURRING</span>
          <p className="mono text-2xl font-light text-white">{summary ? usd(summary.monthlyTotal) : '—'}<span className="card-label ml-1">/mo</span></p>
        </div>
        <div className="flex items-center gap-3">
          {summary && summary.canceledMonthlySaved > 0 && (
            <span className="mono text-[10px]" style={{ color: 'var(--signal-up)' }}>saving {usd(summary.canceledMonthlySaved)}/mo</span>
          )}
          <button onClick={() => setAdding(a => !a)} className="hud text-xs px-2.5 py-1.5 flex items-center gap-1 border border-[var(--jarvis)] text-[var(--jarvis)] hover:bg-[oklch(0.10_0.02_240)] transition">
            <Plus size={12} /> BILL
          </button>
        </div>
      </div>

      {adding && <AddForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); onChange?.() }} />}

      {/* 30-day timeline */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="card-label">NEXT 30 DAYS</span>
          {summary && <span className="mono text-[10px] text-[oklch(0.6_0_0)]">next 7d: {usd(summary.next7Total)}</span>}
        </div>
        <div className="relative h-8 border-b border-[oklch(1_0_0/0.08)]">
          {dots.map(({ r, d }) => (
            <div key={r.id} className="absolute -translate-x-1/2 group" style={{ left: `${(d / 30) * 100}%`, bottom: 0 }}>
              <div className="w-2 h-2 rounded-full mb-0.5" style={{ background: r.type === 'trial' ? 'var(--stark-red)' : 'var(--jarvis)' }} />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap bg-[oklch(0.14_0_0)] border border-[oklch(1_0_0/0.1)] px-1.5 py-0.5 mono text-[9px] text-white z-10">
                {r.name} · {usd(Number(r.amount))} · {r.next_due}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* category rollups */}
      {summary && summary.byCategory.length > 0 && (
        <div className="space-y-1">
          {summary.byCategory.map(c => (
            <div key={c.category} className="flex items-center gap-2">
              <span className="card-label w-16 shrink-0">{c.category}</span>
              <div className="flex-1 h-1.5 bg-[oklch(0.1_0_0)] rounded-sm overflow-hidden">
                <div className="h-full" style={{ width: `${(c.monthly / maxCat) * 100}%`, background: 'var(--jarvis-dim)' }} />
              </div>
              <span className="mono text-[10px] text-[oklch(0.65_0_0)] w-16 text-right">{usd(c.monthly)}/mo</span>
            </div>
          ))}
        </div>
      )}

      {/* item list + cancel tracker */}
      <div className="space-y-1">
        {items.map(r => (
          <div key={r.id} className="flex items-center gap-2 text-xs py-1 border-b border-[oklch(1_0_0/0.03)] group">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.status !== 'active' ? 'oklch(0.4 0 0)' : r.type === 'trial' ? 'var(--stark-red)' : 'var(--jarvis)' }} />
            <span className={`mono flex-1 truncate ${r.status !== 'active' ? 'text-[oklch(0.4_0_0)] line-through' : 'text-white'}`}>{r.name}</span>
            <span className="card-label">{r.type === 'trial' ? 'trial' : r.cadence}</span>
            <span className="mono text-[oklch(0.65_0_0)] w-16 text-right">{usd(Number(r.amount))}</span>
            <span className="mono text-[10px] text-[oklch(0.5_0_0)] w-20 text-right">{r.next_due ?? '—'}</span>
            {r.status === 'active' ? (
              <button onClick={() => cancel(r.id)} className="card-label opacity-0 group-hover:opacity-100 hover:text-[var(--stark-red)] transition w-14 text-right">cancel</button>
            ) : (
              <button onClick={() => remove(r.id)} className="opacity-0 group-hover:opacity-100 text-[oklch(0.4_0_0)] hover:text-white transition w-14 flex justify-end"><X size={12} /></button>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-[11px] text-[oklch(0.45_0_0)] py-3 text-center">No bills tracked yet — add your subscriptions & fixed costs.</p>}
      </div>
    </div>
  )
}

function AddForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', merchant: '', category: 'streaming', type: 'subscription' as RType, amount: '', cadence: 'monthly' as Cadence, next_due: '', expiration_date: '', notify_days_before: '3' })
  const [busy, setBusy] = useState(false)
  const set = (k: string, val: string) => setF(s => ({ ...s, [k]: val }))
  const field = 'mono text-xs bg-[oklch(0.06_0_0)] border border-[oklch(1_0_0/0.08)] px-2 py-1.5 text-white placeholder:text-[oklch(0.40_0_0)] focus:outline-none focus:border-[var(--jarvis)] w-full'

  async function save() {
    if (!f.name || !f.amount) return
    setBusy(true)
    try {
      await fetch('/api/finance/recurring', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name, merchant: f.merchant || null, category: f.category, type: f.type,
          amount: Number(f.amount), cadence: f.cadence,
          next_due: f.next_due || null, expiration_date: f.expiration_date || null,
          notify_days_before: Number(f.notify_days_before) || 3,
        }),
      })
      onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div className="border border-[oklch(1_0_0/0.08)] rounded-sm p-3 space-y-2 bg-[oklch(0.03_0_0)]">
      <div className="flex items-center justify-between">
        <span className="card-label">NEW BILL</span>
        <button onClick={onClose} className="text-[oklch(0.45_0_0)] hover:text-white"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="name" className={field} />
        <input value={f.merchant} onChange={e => set('merchant', e.target.value)} placeholder="merchant" className={field} />
        <select value={f.category} onChange={e => set('category', e.target.value)} className={field}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={f.type} onChange={e => set('type', e.target.value)} className={field}>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={f.amount} onChange={e => set('amount', e.target.value)} inputMode="decimal" placeholder="amount" className={field} />
        <select value={f.cadence} onChange={e => set('cadence', e.target.value)} className={field}>
          {CADENCES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="card-label flex flex-col gap-0.5">NEXT DUE<input type="date" value={f.next_due} onChange={e => set('next_due', e.target.value)} className={field} /></label>
        <label className="card-label flex flex-col gap-0.5">EXPIRES<input type="date" value={f.expiration_date} onChange={e => set('expiration_date', e.target.value)} className={field} /></label>
      </div>
      <button onClick={save} disabled={busy || !f.name || !f.amount} className="hud text-xs px-3 py-1.5 w-full bg-[var(--jarvis)] text-black hover:brightness-110 transition disabled:opacity-40">
        {busy ? '…' : 'ADD BILL'}
      </button>
    </div>
  )
}
