'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

/**
 * HEALTH // WHOOP — the section hero. Live recovery / sleep / strain / workouts
 * pulled from WHOOP via our own auth-gated /api/whoop/* proxy (tokens live
 * server-side in Supabase). Styled to the Jarvis oklch system.
 */

// ── Types (mirror /api/whoop/data) ────────────────────────────────────────────
interface Recovery { score: number; hrv: number; rhr: number; spo2: number | null; skinTempC: number | null }
interface SleepStages { light: number; sws: number; rem: number; awake: number }
interface Sleep {
  asleepMs: number; inBedMs: number; performance: number; consistency: number
  efficiency: number; respiratory: number; cycles: number; disturbances: number
  needMs: number; stages: SleepStages
}
interface Cycle { strain: number; avgHr: number; maxHr: number; kilojoule: number }
interface Trends { recovery: number[]; hrv: number[]; rhr: number[]; strain: number[]; sleepPerf: number[] }
interface Workout { sport: string; strain: number; avgHr: number; maxHr: number; kilojoule: number; start: string; durationMs: number }
interface WhoopData {
  connected: boolean
  recovery: Recovery | null
  sleep: Sleep | null
  strain: number | null
  cycle: Cycle | null
  trends: Trends | null
  workouts: Workout[] | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const CYAN = 'oklch(0.85 0.13 222)'
const GREEN = 'oklch(0.78 0.17 150)'
const YELLOW = 'oklch(0.85 0.15 95)'
const RED = 'oklch(0.64 0.21 27)'
const DEEP = 'oklch(0.55 0.15 255)'
const MUTED = 'oklch(0.55 0 0)'

function fmtDur(ms: number): string {
  const m = Math.round(ms / 60000)
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

function recoveryTone(score: number): string {
  if (score >= 67) return GREEN
  if (score >= 34) return YELLOW
  return RED
}

function strainTone(s: number): string {
  if (s >= 14) return RED
  if (s >= 10) return YELLOW
  return CYAN
}

function fmtWhen(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ── Recovery ring ─────────────────────────────────────────────────────────────
function RecoveryRing({ score }: { score: number }) {
  const r = 38
  const c = 2 * Math.PI * r
  const tone = recoveryTone(score)
  const dash = (Math.min(100, Math.max(0, score)) / 100) * c
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" className="flex-shrink-0">
      <circle cx="52" cy="52" r={r} fill="none" stroke="oklch(1 0 0 / 0.07)" strokeWidth="7" />
      <circle
        cx="52" cy="52" r={r} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`} transform="rotate(-90 52 52)"
        style={{ filter: `drop-shadow(0 0 5px ${tone})`, transition: 'stroke-dasharray 600ms cubic-bezier(0.16,1,0.3,1)' }}
      />
      <text x="52" y="50" textAnchor="middle" className="mono" fontSize="26" fill={tone}
        style={{ fontWeight: 600 }}>{score}</text>
      <text x="52" y="66" textAnchor="middle" className="hud" fontSize="8" fill={MUTED}
        letterSpacing="2">RECOVERY</text>
    </svg>
  )
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Spark({ data, color = CYAN, label, value, unit }: {
  data: number[]; color?: string; label: string; value: string; unit?: string
}) {
  const w = 100, h = 26
  let path = ''
  if (data.length > 1) {
    const min = Math.min(...data), max = Math.max(...data)
    const span = max - min || 1
    path = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - 2 - ((v - min) / span) * (h - 4)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }
  const hasData = data.length > 1
  return (
    <div className="border border-[oklch(0.82_0.13_225/0.10)] bg-[oklch(0.04_0_0)] px-2.5 py-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="card-label">{label}</span>
        <span className="mono text-[12px] text-white">{value}<span className="text-[oklch(0.45_0_0)] text-[9px] ml-0.5">{unit}</span></span>
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {hasData ? (
          <path d={path} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
        ) : (
          <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="oklch(0.3 0 0)" strokeWidth="1" strokeDasharray="3 3" />
        )}
      </svg>
    </div>
  )
}

// ── Sleep stage bar ───────────────────────────────────────────────────────────
function StageBar({ stages }: { stages: SleepStages }) {
  const total = stages.light + stages.sws + stages.rem + stages.awake || 1
  const segs = [
    { key: 'REM', ms: stages.rem, color: CYAN },
    { key: 'SWS', ms: stages.sws, color: DEEP },
    { key: 'LIGHT', ms: stages.light, color: 'oklch(0.62 0 0)' },
    { key: 'AWAKE', ms: stages.awake, color: RED },
  ]
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden border border-[oklch(0.82_0.13_225/0.10)]">
        {segs.map(s => (
          <div key={s.key} style={{ width: `${(s.ms / total) * 100}%`, background: s.color }} title={`${s.key} ${fmtDur(s.ms)}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
        {segs.map(s => (
          <span key={s.key} className="flex items-center gap-1 card-label">
            <span className="w-2 h-2 inline-block" style={{ background: s.color }} />
            {s.key} <span className="mono text-[oklch(0.65_0_0)]">{fmtDur(s.ms)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function Driver({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span className="card-label flex-shrink-0">{label}</span>
      <span aria-hidden className="flex-1 border-b border-dotted border-[oklch(0.82_0.13_225/0.18)] translate-y-[-3px]" />
      <span className="mono text-[oklch(0.88_0_0)]">{value}<span className="text-[oklch(0.45_0_0)] text-[9px] ml-0.5">{unit}</span></span>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
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
  const rec = data?.recovery
  const sleep = data?.sleep
  const cycle = data?.cycle
  const trends = data?.trends
  const workouts = data?.workouts ?? []

  return (
    <div className={`card rounded-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(0.82_0.13_225/0.12)]">
        <div className="flex items-center gap-2">
          <span className="mono text-[oklch(0.40_0_0)] text-[10px] font-medium">08 //</span>
          <span className="card-label text-[var(--jarvis)]">WHOOP</span>
          {connected && (
            <span className="flex items-center gap-1 ml-1">
              <span className="online-dot w-1.5 h-1.5 inline-block" style={{ background: CYAN, boxShadow: `0 0 6px ${CYAN}` }} />
              <span className="card-label text-[var(--jarvis-dim)]">LIVE</span>
            </span>
          )}
        </div>
        {connected && (
          <div className="flex items-center gap-3">
            <button onClick={refresh} title="Refresh" className="text-[oklch(0.45_0_0)] hover:text-[var(--jarvis-bright)] transition-colors">
              <RefreshCw size={12} className={spinning ? 'animate-spin' : ''} />
            </button>
            <button onClick={disconnect} className="card-label hover:text-[oklch(0.75_0_0)] transition-colors">Disconnect</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="px-3 py-6 mono text-[10px] text-[oklch(0.40_0_0)]">Loading WHOOP…</div>
      ) : !connected ? (
        <div className="flex flex-col items-center text-center px-4 py-8 gap-2">
          <div className="card-label text-[var(--jarvis)]">Not connected</div>
          <div className="text-[11px] text-[oklch(0.50_0_0)] max-w-[320px] leading-relaxed mb-2">
            Link your account to stream live recovery, sleep stages, strain, HRV and workouts into the dashboard.
          </div>
          <a href="/api/whoop/connect" className="border border-[oklch(0.82_0.13_225/0.45)] text-[var(--jarvis-bright)] px-4 py-2 text-[11px] tracking-[0.14em] hud hover:glow-box-cyan transition-shadow">
            CONNECT WHOOP
          </a>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          {err && <div className="badge-hot px-2.5 py-1.5 mono text-[10px]">{err}</div>}

          {/* Row 1 — Recovery hero + drivers · Strain · Sleep summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
            <div className="border border-[oklch(0.82_0.13_225/0.10)] bg-[oklch(0.04_0_0)] p-3 flex items-center gap-3">
              {rec ? <RecoveryRing score={rec.score} /> : <div className="w-[104px] h-[104px] flex items-center justify-center mono text-[oklch(0.3_0_0)]">—</div>}
              <div className="flex-1 min-w-0 space-y-1.5">
                <Driver label="HRV" value={rec ? rec.hrv : '—'} unit="ms" />
                <Driver label="RHR" value={rec ? rec.rhr : '—'} unit="bpm" />
                <Driver label="SPO2" value={rec?.spo2 != null ? rec.spo2 : '—'} unit="%" />
                <Driver label="SKIN" value={rec?.skinTempC != null ? rec.skinTempC : '—'} unit="°C" />
                <Driver label="RESP" value={sleep ? sleep.respiratory : '—'} unit="rpm" />
              </div>
            </div>

            <div className="border border-[oklch(0.82_0.13_225/0.10)] bg-[oklch(0.04_0_0)] p-3 flex flex-col">
              <div className="card-label mb-2">DAY STRAIN</div>
              <div className="mono text-[40px] leading-none font-light" style={{ color: data?.strain != null ? strainTone(data.strain) : MUTED }}>
                {data?.strain != null ? data.strain.toFixed(1) : '—'}
              </div>
              <div className="mono text-[9px] text-[oklch(0.45_0_0)] mt-1">/ 21.0 SCALE</div>
              <div className="mt-auto pt-3 space-y-1.5">
                <Driver label="AVG HR" value={cycle ? cycle.avgHr : '—'} unit="bpm" />
                <Driver label="PEAK HR" value={cycle ? cycle.maxHr : '—'} unit="bpm" />
                <Driver label="ENERGY" value={cycle ? Math.round(cycle.kilojoule * 0.239) : '—'} unit="kcal" />
              </div>
            </div>

            <div className="border border-[oklch(0.82_0.13_225/0.10)] bg-[oklch(0.04_0_0)] p-3 flex flex-col">
              <div className="card-label mb-2">SLEEP</div>
              <div className="flex items-baseline gap-2">
                <span className="mono text-[28px] leading-none text-white">{sleep ? fmtDur(sleep.asleepMs) : '—'}</span>
              </div>
              <div className="mono text-[9px] text-[oklch(0.45_0_0)] mt-1">
                {sleep ? `NEED ${fmtDur(sleep.needMs)}` : ''}
              </div>
              <div className="mt-auto pt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="mono text-[16px]" style={{ color: sleep && sleep.performance >= 70 ? GREEN : YELLOW }}>{sleep ? `${sleep.performance}%` : '—'}</div>
                  <div className="card-label">PERF</div>
                </div>
                <div>
                  <div className="mono text-[16px] text-white">{sleep ? `${sleep.efficiency}%` : '—'}</div>
                  <div className="card-label">EFF</div>
                </div>
                <div>
                  <div className="mono text-[16px] text-white">{sleep ? `${sleep.consistency}%` : '—'}</div>
                  <div className="card-label">CONS</div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2 — Sleep stages */}
          {sleep && (
            <div className="border border-[oklch(0.82_0.13_225/0.10)] bg-[oklch(0.04_0_0)] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="card-label">SLEEP STAGES</span>
                <span className="card-label text-[oklch(0.55_0_0)]">{sleep.cycles} CYCLES · {sleep.disturbances} DISTURBANCES</span>
              </div>
              <StageBar stages={sleep.stages} />
            </div>
          )}

          {/* Row 3 — Trends */}
          {trends && (
            <div>
              <div className="card-label mb-1.5">14-DAY TRENDS</div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                <Spark label="RECOVERY" data={trends.recovery} color={GREEN}
                  value={trends.recovery.length ? String(trends.recovery[trends.recovery.length - 1]) : '—'} unit="%" />
                <Spark label="HRV" data={trends.hrv} color={CYAN}
                  value={trends.hrv.length ? String(trends.hrv[trends.hrv.length - 1]) : '—'} unit="ms" />
                <Spark label="RHR" data={trends.rhr} color="oklch(0.75 0.10 35)"
                  value={trends.rhr.length ? String(trends.rhr[trends.rhr.length - 1]) : '—'} unit="bpm" />
                <Spark label="STRAIN" data={trends.strain} color={YELLOW}
                  value={trends.strain.length ? trends.strain[trends.strain.length - 1].toFixed(1) : '—'} />
                <Spark label="SLEEP" data={trends.sleepPerf} color={DEEP}
                  value={trends.sleepPerf.length ? String(trends.sleepPerf[trends.sleepPerf.length - 1]) : '—'} unit="%" />
              </div>
            </div>
          )}

          {/* Row 4 — Workouts */}
          {workouts.length > 0 && (
            <div className="border border-[oklch(0.82_0.13_225/0.10)] bg-[oklch(0.04_0_0)]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(1_0_0/0.04)]">
                <span className="card-label">RECENT WORKOUTS</span>
                <span className="card-label text-[oklch(0.55_0_0)]">WHOOP · {workouts.length}</span>
              </div>
              <div>
                {workouts.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-[oklch(1_0_0/0.03)] last:border-0">
                    <span className="mono text-[10px] text-[oklch(0.45_0_0)] w-20 flex-shrink-0">{fmtWhen(w.start)}</span>
                    <span className="text-[11px] text-white flex-1 truncate">{w.sport}</span>
                    <span className="mono text-[10px] text-[oklch(0.60_0_0)] flex-shrink-0">{fmtDur(w.durationMs)}</span>
                    <span className="mono text-[10px] flex-shrink-0 w-16 text-right" style={{ color: strainTone(w.strain) }}>STR {w.strain.toFixed(1)}</span>
                    <span className="mono text-[10px] text-[oklch(0.55_0_0)] flex-shrink-0 w-16 text-right">{w.avgHr || '—'} bpm</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
