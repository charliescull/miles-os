'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { config } from '@/lib/config'
import { Odometer, Barcode, Serial, seededRandom, useReducedMotion } from '@/components/hud'

/**
 * THE BOOT SEQUENCE — classified hardware waking up, JARVIS style.
 *
 * Timeline (skippable at any point: click or ESC):
 *   0.0s  CASCADE   spec-sheet lines snap onto black, top-down
 *   2.0s  METRICS   odometers roll and settle on the operator's real numbers
 *   3.9s  ONLINE    OPERATOR ONLINE stamp + confirm chime
 *   5.1s  ASSEMBLE  the scattered strokes converge into the brain silhouette
 *                   as the overlay dissolves into HOME
 *   6.3s  done
 *
 * Plays once per session (sessionStorage 'miles-booted'); the TopRail
 * [ REBOOT ] button replays it. Reduced motion: a single calm OPERATOR ONLINE
 * card, no cascade, no strokes, no side chrome.
 */

type Phase = 'cascade' | 'metrics' | 'online' | 'assemble'

const T_METRICS = 2000
const T_ONLINE = 3900
const T_ASSEMBLE = 5100
const T_DONE = 6300

interface BootMetrics {
  netWorth: string | null
  dayDelta: string | null
  dayUp: boolean
  kcal: string | null
  habits: string | null
  tasksOpen: string | null
}

function useBootMetrics(): BootMetrics {
  const [m, setM] = useState<BootMetrics>({
    netWorth: null, dayDelta: null, dayUp: true, kcal: null, habits: null, tasksOpen: null,
  })

  useEffect(() => {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 1800) // boot never waits on the network
    const grab = async (url: string) => {
      const res = await fetch(url, { signal: ac.signal })
      if (!res.ok) throw new Error(String(res.status))
      return res.json()
    }
    const usd = (n: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

    grab('/api/finance/snapshot').then(d => {
      if (typeof d?.net_worth === 'number') {
        setM(p => ({
          ...p,
          netWorth: usd(d.net_worth),
          dayDelta: typeof d.daily_delta === 'number' ? `${d.daily_delta >= 0 ? '+' : ''}${usd(d.daily_delta)}` : p.dayDelta,
          dayUp: (d.daily_delta ?? 0) >= 0,
        }))
      }
    }).catch(() => {})

    grab('/api/nutrition').then(d => {
      const meals: { kcal?: number }[] = Array.isArray(d?.meals) ? d.meals : []
      const kcal = meals.reduce((s, x) => s + (x.kcal ?? 0), 0)
      setM(p => ({ ...p, kcal: `${kcal.toLocaleString('en-US')}` }))
    }).catch(() => {})

    grab('/api/habits').then(d => {
      const done = Array.isArray(d?.done) ? d.done.length : 0
      setM(p => ({ ...p, habits: `${done}/${config.habits.length}` }))
    }).catch(() => {})

    grab('/api/tasks').then(d => {
      const list = Array.isArray(d) ? d : Array.isArray(d?.tasks) ? d.tasks : []
      setM(p => ({ ...p, tasksOpen: String(list.length) }))
    }).catch(() => {})

    return () => { clearTimeout(timer); ac.abort() }
  }, [])

  return m
}

// Diegetic cascade copy — invented for MILES, not lifted from anywhere.
const CASCADE_LINES = [
  'MILES OS  //  PERSONAL OPERATING SYSTEM  //  BUILD V3.1',
  'BIOS CHECK ............................. PASS',
  'MEMORY LATTICE  pgvector/1536d ......... MOUNTED',
  'CAPTURE PIPELINE ....................... ARMED',
  'CLASSIFIER  claude-sonnet-4-6 .......... WARM',
  'EMBEDDING CORE  text-embedding-3 ....... WARM',
  'TELEGRAM UPLINK ........................ SECURE',
  'AUDIT TRAIL ............................ WRITING',
  `OPERATOR ............................... ${config.displayName.toUpperCase()}`,
  `STATION ................................ ${config.location.toUpperCase()}`,
  'CLEARANCE .............................. SOLE OPERATOR',
  'LOADING OPERATOR STATE ................. ▮▮▮▮▮▮▮▮',
]

function Strokes({ assembling }: { assembling: boolean }) {
  // 56 strokes: scattered across the viewport → converge onto the REAL brain
  // canvas (measured from [data-brain-stage] when assembly starts), so the
  // dissolve hands off seamlessly to the living organ underneath.
  const strokes = useMemo(() => {
    const rnd = seededRandom('boot-strokes')
    return Array.from({ length: 56 }, (_, i) => {
      const a = (i / 56) * Math.PI * 2
      return {
        w: 12 + rnd() * 22,
        sx: (rnd() - 0.5) * 92,            // vw
        sy: (rnd() - 0.5) * 88,            // vh
        sr: rnd() * 360,
        a,                                  // unit angle on the target ellipse
        jitter: rnd() - 0.5,
        er: (a * 180) / Math.PI + 90 + (rnd() - 0.5) * 30, // tangent to ellipse
        delay: Math.floor(rnd() * 220),
      }
    })
  }, [])

  // measure the brain stage once, when assembly begins
  const [target, setTarget] = useState<{ cx: number; cy: number; rx: number; ry: number } | null>(null)
  useEffect(() => {
    if (!assembling) return
    const el = document.querySelector('[data-brain-stage]')
    if (el) {
      const r = el.getBoundingClientRect()
      // brain occupies roughly the middle ~55%w / ~60%h of its canvas
      setTarget({ cx: r.left + r.width / 2, cy: r.top + r.height / 2, rx: r.width * 0.14, ry: r.height * 0.30 })
    } else {
      setTarget({ cx: window.innerWidth / 2, cy: window.innerHeight / 2, rx: 200, ry: 125 })
    }
  }, [assembling])

  const t = target ?? { cx: 0, cy: 0, rx: 200, ry: 125 }

  return (
    <div aria-hidden className="absolute left-0 top-0 w-0 h-0">
      {strokes.map((s, i) => {
        const ex = t.cx + Math.cos(s.a) * t.rx * (1 + s.jitter * 0.25)
        const ey = t.cy + Math.sin(s.a) * t.ry * (1 + s.jitter * 0.25)
        return (
          <span
            key={i}
            className="absolute h-px"
            style={{
              width: s.w,
              background: 'oklch(0.85 0.13 222)',
              boxShadow: '0 0 6px oklch(0.82 0.13 225 / 0.8)',
              transform: assembling && target
                ? `translate(${ex}px, ${ey}px) rotate(${s.er}deg)`
                : `translate(calc(50vw + ${s.sx}vw), calc(50vh + ${s.sy}vh)) rotate(${s.sr}deg)`,
              transition: `transform 950ms cubic-bezier(0.16, 1, 0.3, 1) ${s.delay}ms, opacity 400ms ease ${600 + s.delay}ms`,
              opacity: assembling ? 0.0 : 0.55,
            }}
          />
        )
      })}
    </div>
  )
}

/**
 * Arc reactor — concentric rotating rings + a sweeping radar arm behind the
 * cascade. Pure SVG, all motion via CSS classes (auto-killed by reduced motion).
 */
function ArcReactor() {
  const C = 'oklch(0.82 0.13 225)'
  const Cd = 'oklch(0.62 0.10 230)'
  return (
    <div aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[640px] max-w-[92vw] max-h-[92vw] opacity-[0.5] arc-pulse">
      <svg viewBox="0 0 200 200" className="w-full h-full">
        {/* outer ticked ring */}
        <g className="spin-slow" style={{ transformOrigin: '100px 100px' }}>
          <circle cx="100" cy="100" r="92" fill="none" stroke={Cd} strokeWidth="0.4" strokeDasharray="1 5" opacity="0.6" />
          <circle cx="100" cy="100" r="80" fill="none" stroke={C} strokeWidth="0.5" strokeDasharray="40 12 8 12" opacity="0.7" />
        </g>
        {/* mid counter-rotating ring */}
        <g className="spin-slow-rev" style={{ transformOrigin: '100px 100px' }}>
          <circle cx="100" cy="100" r="64" fill="none" stroke={C} strokeWidth="0.5" strokeDasharray="2 8" opacity="0.6" />
          <circle cx="100" cy="100" r="56" fill="none" stroke={Cd} strokeWidth="0.4" opacity="0.4" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2
            return <line key={i} x1={100 + Math.cos(a) * 56} y1={100 + Math.sin(a) * 56}
              x2={100 + Math.cos(a) * 64} y2={100 + Math.sin(a) * 64} stroke={C} strokeWidth="0.5" opacity="0.7" />
          })}
        </g>
        {/* radar sweep */}
        <g className="sweep-sw" style={{ transformOrigin: '100px 100px' }}>
          <defs>
            <linearGradient id="boot-sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={C} stopOpacity="0.5" />
              <stop offset="100%" stopColor={C} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M100 100 L192 100 A92 92 0 0 0 154 24 Z" fill="url(#boot-sweep)" opacity="0.5" />
        </g>
        <circle cx="100" cy="100" r="40" fill="none" stroke={C} strokeWidth="0.6" opacity="0.5" />
      </svg>
    </div>
  )
}

/** Vertical telemetry column — animated equalizer bars + a scanning line. */
function TelemetryColumn({ side }: { side: 'left' | 'right' }) {
  const bars = side === 'left' ? 14 : 11
  return (
    <div aria-hidden className={`absolute top-0 bottom-0 ${side === 'left' ? 'left-0' : 'right-0'} w-[120px] hidden md:flex flex-col justify-center gap-3 px-6 overflow-hidden`}>
      {/* scan line */}
      <div className="absolute left-0 right-0 h-px scan-vert" style={{ background: 'oklch(0.82 0.13 225 / 0.5)', boxShadow: '0 0 8px oklch(0.82 0.13 225 / 0.6)' }} />
      {/* equalizer */}
      <div className="flex items-end gap-1 h-16">
        {Array.from({ length: bars }).map((_, i) => (
          <span key={i} className="bar-jitter flex-1" style={{
            background: 'oklch(0.72 0.12 228 / 0.55)',
            height: '100%',
            animationDelay: `${(i % 7) * 0.13}s`,
            animationDuration: `${0.9 + (i % 5) * 0.12}s`,
          }} />
        ))}
      </div>
      {/* spec readout */}
      <div className="hud text-[8px] leading-[1.8] tracking-[0.18em] text-[oklch(0.55_0.07_230)]">
        {(side === 'left'
          ? ['SENSORS', 'NET', 'THERMAL', 'POWER', 'I/O BUS']
          : ['CORE', 'CACHE', 'VECTOR', 'UPLINK', 'GUARD']
        ).map((l, i) => (
          <p key={i} className="flex justify-between gap-2">
            <span>{l}</span>
            <span className="text-[oklch(0.78_0.11_226)]">{['OK', 'OK', 'SYNC', '99%', 'ARMED'][i]}</span>
          </p>
        ))}
      </div>
    </div>
  )
}

export default function BootSequence({
  onDone,
}: {
  onDone: () => void
}) {
  const reduced = useReducedMotion()
  const metrics = useBootMetrics()
  const [phase, setPhase] = useState<Phase>('cascade')
  const [fading, setFading] = useState(false)
  const doneRef = useRef(false)

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    setFading(true)
    setTimeout(onDone, 450)
  }, [onDone])

  // Timeline
  useEffect(() => {
    if (reduced) {
      const t = setTimeout(finish, 900)
      return () => clearTimeout(t)
    }
    const timers = [
      setTimeout(() => setPhase('metrics'), T_METRICS),
      setTimeout(() => setPhase('online'), T_ONLINE),
      setTimeout(() => setPhase('assemble'), T_ASSEMBLE),
      setTimeout(finish, T_DONE),
    ]
    return () => { timers.forEach(clearTimeout) }
  }, [reduced, finish])

  // Skip: any click or ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish])

  if (reduced) {
    return (
      <div
        className={`fixed inset-0 z-[100] bg-black flex items-center justify-center transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}
        onClick={finish}
      >
        <p className="display text-xl glow-hot">OPERATOR ONLINE</p>
      </div>
    )
  }

  const showMetrics = phase !== 'cascade'
  const showOnline = phase === 'online' || phase === 'assemble'
  const assembling = phase === 'assemble'

  return (
    <div
      onClick={finish}
      className={`fixed inset-0 z-[100] bg-black cursor-pointer select-none overflow-hidden transition-opacity duration-[450ms] ${fading || assembling ? 'opacity-0' : 'opacity-100'}`}
      style={assembling ? { transitionDelay: '650ms' } : undefined}
      role="dialog"
      aria-label="System boot — click or press Escape to skip"
    >
      {/* corner stamps */}
      <div aria-hidden className="absolute top-3 left-4 hud text-[9px] tracking-[0.25em] text-[oklch(0.48_0.06_232)]">
        MILES OS // COLD START
      </div>
      <div aria-hidden className="absolute top-3 right-4 flex items-center gap-3">
        <Barcode seed="boot" bars={22} height={12} className="opacity-40" />
        <Serial seed="boot" />
      </div>
      <div aria-hidden className="absolute bottom-3 left-4 hud text-[9px] tracking-[0.25em] text-[oklch(0.48_0.06_232)]">
        ESC TO SKIP
      </div>
      <div aria-hidden className="absolute bottom-3 right-4 hud text-[9px] tracking-[0.25em] text-[oklch(0.48_0.06_232)]">
        {new Date().getFullYear()} // SOLE OPERATOR TERMINAL
      </div>

      {/* JARVIS chrome — arc reactor behind, telemetry columns on the flanks */}
      {!assembling && <ArcReactor />}
      {!assembling && <TelemetryColumn side="left" />}
      {!assembling && <TelemetryColumn side="right" />}

      <div className="h-full flex items-center justify-center relative z-10">
        <div className="w-[580px] max-w-[88vw]">
          {/* CASCADE */}
          <div className="hud text-[11px] leading-[1.7] text-[oklch(0.70_0_0)]">
            {CASCADE_LINES.map((line, i) => (
              <p key={i} className="boot-line whitespace-pre" style={{ animationDelay: `${i * 130}ms` }}>
                {line}
              </p>
            ))}
          </div>

          {/* METRICS — odometers settle on the operator's real numbers */}
          <div
            className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 transition-opacity duration-200"
            style={{ opacity: showMetrics ? 1 : 0 }}
          >
            <div>
              <p className="card-label mb-1">NET WORTH</p>
              <Odometer value={metrics.netWorth ?? '$———'} play={showMetrics} className="text-2xl glow" />
            </div>
            <div>
              <p className="card-label mb-1">DAY P/L</p>
              {metrics.dayDelta ? (
                <Odometer value={metrics.dayDelta} play={showMetrics} className={`text-2xl ${metrics.dayUp ? 'glow-up' : 'glow-down'}`} />
              ) : (
                <span className="mono text-2xl text-[oklch(0.30_0_0)]">———</span>
              )}
            </div>
            <div>
              <p className="card-label mb-1">FUEL TODAY</p>
              <Odometer value={`${metrics.kcal ?? '———'} KCAL`} play={showMetrics} className="text-lg glow" />
            </div>
            <div>
              <p className="card-label mb-1">PROTOCOL / OPEN TASKS</p>
              <Odometer value={`${metrics.habits ?? '—/—'} · ${metrics.tasksOpen ?? '——'}`} play={showMetrics} className="text-lg glow" />
            </div>
          </div>

          {/* ONLINE */}
          <div className="mt-7 h-10 flex items-center gap-3 transition-opacity duration-150" style={{ opacity: showOnline ? 1 : 0 }}>
            <span className="online-dot w-2 h-2 bg-[var(--signal-up)]" style={{ boxShadow: '0 0 8px var(--signal-up)' }} />
            <span className="display text-xl glow-hot">OPERATOR ONLINE</span>
            <span className="display text-xl text-[var(--jarvis-bright)] cursor-blink glow-cyan">▮</span>
          </div>
        </div>
      </div>

      {/* ASSEMBLE — strokes converge into the brain silhouette as we dissolve */}
      <Strokes assembling={assembling} />
    </div>
  )
}
