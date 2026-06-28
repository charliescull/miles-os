'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

/**
 * HEALTH // WHOOP — live recovery / sleep / strain pulled from WHOOP via our
 * own auth-gated /api/whoop/* proxy (tokens live server-side in Supabase).
 * Styled to the oklch card system, not the stock WHOOP white-pill look.
 */

interface WhoopData {
  connected: boolean
  recovery: { score: number; hrv: number; rhr: number } | null
  sleep: { asleepMs: number; performance: number; respiratory: number } | null
  strain: number | null
}

function fmtSleep(ms: number): string {
  const m = Math.round(ms / 60000)
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

function recoveryTone(score: number): string {
  if (score >= 67) return 'var(--signal-up)'
  if (score >= 34) return 'oklch(0.88 0 0)'
  return 'var(--signal-down)'
}

function Cell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="border border-[oklch(1_0_0/0.06)] bg-[oklch(0.04_0_0)] px-3 py-3 text-center">
      <div className="card-label mb-1.5">{label}</div>
      <div className="mono text-[22px] leading-none font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="mono text-[9px] text-[oklch(0.45_0_0)] mt-1.5">{sub}</div>}
    </div>
  )
}

export default function WhoopCard({ className = '' }: { className?: string }) {
  const [data, setData] = useState<WhoopData | null>(null)
  const [loading, setLoading] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/whoop/data')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData(await r.json())
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function refresh() {
    setSpinning(true)
    await load()
    setTimeout(() => setSpinning(false), 600)
  }

  async function disconnect() {
    await fetch('/api/whoop/disconnect', { method: 'POST' })
    load()
  }

  const connected = data?.connected

  return (
    <div className={`card rounded-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(1_0_0/0.05)]">
        <div className="flex items-center gap-2">
          <span className="mono text-[oklch(0.40_0_0)] text-[10px] font-medium">08 //</span>
          <span className="card-label">WHOOP</span>
        </div>
        {connected && (
          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              title="Refresh"
              className="text-[oklch(0.45_0_0)] hover:text-white transition-colors"
            >
              <RefreshCw size={12} className={spinning ? 'animate-spin' : ''} />
            </button>
            <button onClick={disconnect} className="card-label hover:text-[oklch(0.75_0_0)] transition-colors">
              Disconnect
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="px-3 py-6 mono text-[10px] text-[oklch(0.40_0_0)]">Loading…</div>
      ) : !connected ? (
        // ── Disconnected ──
        <div className="flex flex-col items-center text-center px-4 py-7 gap-2">
          <div className="card-label">Not connected</div>
          <div className="text-[11px] text-[oklch(0.50_0_0)] max-w-[280px] leading-relaxed mb-2">
            Link your account to see live recovery, sleep, and strain.
          </div>
          <a
            href="/api/whoop/connect"
            className="badge-warm px-4 py-2 text-[11px] tracking-[0.14em] hud hover:glow-box transition-shadow"
          >
            CONNECT WHOOP
          </a>
        </div>
      ) : (
        // ── Connected ──
        <div className="p-3">
          {err && (
            <div className="mb-2 badge-hot px-2.5 py-1.5 mono text-[10px]">{err}</div>
          )}
          <div className="grid grid-cols-3 gap-1.5 max-[480px]:grid-cols-2">
            <Cell
              label="Recovery"
              value={data!.recovery ? `${data!.recovery.score}%` : '—'}
              sub={data!.recovery ? (data!.recovery.score >= 67 ? 'high' : data!.recovery.score >= 34 ? 'moderate' : 'low') : undefined}
              tone={data!.recovery ? recoveryTone(data!.recovery.score) : undefined}
            />
            <Cell
              label="Sleep"
              value={data!.sleep ? fmtSleep(data!.sleep.asleepMs) : '—'}
              sub={data!.sleep ? `${data!.sleep.performance}% perf` : undefined}
            />
            <Cell label="Strain" value={data!.strain != null ? data!.strain.toFixed(1) : '—'} sub="today" />
            <Cell label="HRV" value={data!.recovery ? String(data!.recovery.hrv) : '—'} sub="ms" />
            <Cell label="RHR" value={data!.recovery ? String(data!.recovery.rhr) : '—'} sub="bpm" />
            <Cell label="Resp" value={data!.sleep ? data!.sleep.respiratory.toFixed(1) : '—'} sub="rpm" />
          </div>
        </div>
      )}
    </div>
  )
}
