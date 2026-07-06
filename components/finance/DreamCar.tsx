'use client'

// Dream-car progress bar (finance overhaul v2 §11) — net worth → target ($88,750, a 2022
// Porsche 718 Cayman GTS 4.0). Full-width rail with a count-up number and a GREEN money bar.
// Renders the self-contained WebGL turntable whenever the card is on-screen (no external model
// file required); a red neon SVG car is the reduced-motion / no-WebGL fallback.

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

const CaymanScene = dynamic(() => import('./CaymanScene'), { ssr: false })

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

function useReducedMotion(): boolean {
  const [r, setR] = useState(false)
  useEffect(() => { setR(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) }, [])
  return r
}

// Count up to `value` with an ease-out over ~1s (instant if reduced motion).
function useCountUp(value: number, reduce: boolean): number {
  const [n, setN] = useState(reduce ? value : 0)
  const raf = useRef<number | null>(null)
  useEffect(() => {
    if (reduce) { setN(value); return }
    const start = performance.now(); const from = 0; const dur = 1000
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      setN(from + (value - from) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [value, reduce])
  return n
}

// Red neon SVG silhouette — reduced-motion / no-WebGL fallback.
function SvgCar({ progress }: { progress: number }) {
  const glow = 0.35 + progress * 0.65
  const RED = 'oklch(0.64 0.21 27)'
  return (
    <svg viewBox="0 0 260 90" className="w-full h-full" style={{ filter: `drop-shadow(0 0 ${4 + progress * 10}px oklch(0.64 0.21 27 / ${glow}))` }}>
      <ellipse cx="130" cy="78" rx="96" ry="7" fill="oklch(0.64 0.21 27 / 0.15)" />
      <path d="M28 66 Q40 44 78 40 Q100 26 140 27 Q182 28 205 44 Q226 47 232 66 Z"
        fill="none" stroke={RED} strokeWidth="1.6" />
      <path d="M86 40 Q104 30 136 31 Q156 32 172 42 Z" fill="none" stroke="oklch(0.55 0.18 27)" strokeWidth="1.2" />
      <circle cx="76" cy="66" r="13" fill="#0a0506" stroke={RED} strokeWidth="1.6" />
      <circle cx="186" cy="66" r="13" fill="#0a0506" stroke={RED} strokeWidth="1.6" />
    </svg>
  )
}

export default function DreamCar({ netWorth, target, label }: { netWorth: number; target: number; label: string }) {
  const reduce = useReducedMotion()
  const pct = target > 0 ? Math.min(1, Math.max(0, netWorth / target)) : 0
  const count = useCountUp(netWorth, reduce)

  const [inView, setInView] = useState(false)
  const [hovered, setHovered] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  // Pause the render loop when off-screen.
  useEffect(() => {
    if (!wrap.current) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.1 })
    io.observe(wrap.current)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={wrap}
      className="card rounded-sm p-4 overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* cursive make/model — the only prominent text; everything else stays mysterious */}
      <p
        className="text-center leading-none pt-1 select-none"
        style={{
          fontFamily: '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive',
          fontSize: '1.75rem',
          color: 'oklch(0.93 0.02 250)',
          textShadow: '0 0 22px oklch(0.82 0.13 225 / 0.32)',
        }}
      >
        {label}
      </p>

      {/* big cinematic turntable */}
      <div className="h-[300px] w-full -mt-1">
        {inView && !reduce ? <CaymanScene progress={pct} /> : <SvgCar progress={pct} />}
      </div>

      {/* slim, unlabeled green rail — hover reveals what it's tracking */}
      <div className="mx-auto max-w-md h-1 bg-[oklch(0.12_0_0)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct * 100}%`,
            background: 'linear-gradient(90deg, oklch(0.5 0.15 150), oklch(0.85 0.2 150))',
            boxShadow: '0 0 12px oklch(0.78 0.17 150 / 0.85)',
            transition: reduce ? undefined : 'width 900ms cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </div>
      <div className="h-4 mt-1 text-center">
        {hovered && (
          <span className="mono text-[10px] text-[oklch(0.55_0_0)]">
            {usd(count)} <span className="text-[oklch(0.35_0_0)]">/</span> {usd(target)} ·{' '}
            <span style={{ color: 'oklch(0.78 0.17 150)' }}>{(pct * 100).toFixed(1)}%</span>
          </span>
        )}
      </div>
    </div>
  )
}
