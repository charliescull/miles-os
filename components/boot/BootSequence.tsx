'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { config } from '@/lib/config'
import { Odometer, Barcode, Serial, seededRandom, useReducedMotion } from '@/components/hud'

/**
 * THE BOOT SEQUENCE — classified hardware waking up.
 *
 * Timeline (skippable at any point: click or ESC):
 *   0.0s  CASCADE   spec-sheet lines snap onto black, top-down
 *   2.0s  METRICS   odometers roll and settle on the operator's real numbers
 *   3.9s  ONLINE    OPERATOR ONLINE stamp + confirm chime
 *   5.1s  ASSEMBLE  the scattered white strokes converge into the brain
 *                   silhouette as the overlay dissolves into HOME
 *   6.3s  done
 *
 * Plays once per session (sessionStorage 'miles-booted'); the TopRail
 * [ REBOOT ] button replays it WITH sound (the click is the gesture that
 * unlocks WebAudio — first automatic boot is silent by browser law).
 * Reduced motion: a single calm OPERATOR ONLINE card, no cascade, no strokes.
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
  // 56 white strokes: scattered across the viewport → converge onto the REAL
  // brain canvas (measured from [data-brain-stage] when assembly starts), so
  // the dissolve hands off seamlessly to the living organ underneath.
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
            className="absolute h-px bg-white"
            style={{
              width: s.w,
              boxShadow: '0 0 6px oklch(1 0 0 / 0.7)',
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
      <div aria-hidden className="absolute top-3 left-4 hud text-[9px] tracking-[0.25em] text-[oklch(0.35_0_0)]">
        MILES OS // COLD START
      </div>
      <div aria-hidden className="absolute top-3 right-4 flex items-center gap-3">
        <Barcode seed="boot" bars={22} height={12} className="opacity-40" />
        <Serial seed="boot" />
      </div>
      <div aria-hidden className="absolute bottom-3 left-4 hud text-[9px] tracking-[0.25em] text-[oklch(0.35_0_0)]">
        ESC TO SKIP
      </div>
      <div aria-hidden className="absolute bottom-3 right-4 hud text-[9px] tracking-[0.25em] text-[oklch(0.35_0_0)]">
        {new Date().getFullYear()} // SOLE OPERATOR TERMINAL
      </div>

      <div className="h-full flex items-center justify-center">
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
            <span className="display text-xl text-white cursor-blink">▮</span>
          </div>
        </div>
      </div>

      {/* ASSEMBLE — strokes converge into the brain silhouette as we dissolve */}
      <Strokes assembling={assembling} />
    </div>
  )
}
