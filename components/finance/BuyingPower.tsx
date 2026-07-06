'use client'

// Manual buying-power editor (uninvested brokerage cash). Click to edit → POST /api/finance/config
// → parent reloads the view so net worth / investments update immediately. Replaces the old
// Google-Sheet-derived value (finance overhaul v2 follow-up).

import { useState } from 'react'
import { Pencil } from 'lucide-react'

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

export default function BuyingPower({ value, onSaved }: { value: number; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const n = parseFloat(val)
    if (!Number.isFinite(n) || n < 0) { setEditing(false); return }
    setSaving(true)
    try {
      const res = await fetch('/api/finance/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyingPower: n }),
      })
      if (res.ok) { setEditing(false); setVal(''); onSaved() }
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 align-baseline">
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          inputMode="decimal"
          placeholder={value.toFixed(2)}
          className="mono text-[10px] bg-[oklch(0.06_0_0)] border border-[var(--jarvis)] px-1 py-0.5 w-16 text-white placeholder:text-[oklch(0.40_0_0)] focus:outline-none"
        />
        <button onClick={save} disabled={saving} className="mono text-[9px] text-[var(--jarvis)] hover:text-white">
          {saving ? '…' : 'save'}
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => { setVal(String(value)); setEditing(true) }}
      className="inline-flex items-center gap-0.5 hover:text-white transition-colors group"
      title="Set buying power (uninvested cash)"
    >
      incl. {usd(value)} cash
      <Pencil size={9} className="opacity-0 group-hover:opacity-60" />
    </button>
  )
}
