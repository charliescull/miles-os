'use client'

// Dream-car progress bar (finance overhaul v2 §11.1) — net worth → target ($88,750, a 2022
// Porsche 718 Cayman GTS 4.0). Full-width rail with a count-up number. Renders the WebGL turntable
// only when public/models/cayman.glb exists AND the card is on-screen; otherwise a neon SVG car
// so the page never breaks. All heavy motion is gated behind prefers-reduced-motion.

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

// Neon SVG silhouette fallback (also the default until a .glb is added).
function SvgCar({ progress }: { progress: number }) {
  const glow = 0.3 + progress * 0.7
  return (
    <svg viewBox="0 0 260 90" className="w-full h-full" style={{ filter: `drop-shadow(0 0 ${4 + progress * 10}px oklch(0.82 0.13 225 / ${glow}))` }}>
      <ellipse cx="130" cy="78" rx="96" ry="7" fill="oklch(0.82 0.13 225 / 0.15)" />
      <path d="M28 66 Q40 44 78 40 Q100 26 140 27 Q182 28 205 44 Q226 47 232 66 Z"
        fill="none" stroke="var(--jarvis)" strokeWidth="1.6" />
      <path d="M86 40 Q104 30 136 31 Q156 32 172 42 Z" fill="none" stroke="var(--jarvis-dim)" strokeWidth="1.2" />
      <circle cx="76" cy="66" r="13" fill="#05070a" stroke="var(--jarvis)" strokeWidth="1.6" />
      <circle cx="186" cy="66" r="13" fill="#05070a" stroke="var(--jarvis)" strokeWidth="1.6" />
    </svg>
  )
}

export default function DreamCar({ netWorth, target, label }: { netWorth: number; target: number; label: string }) {
  const reduce = useReducedMotion()
  const pct = target > 0 ? Math.min(1, Math.max(0, netWorth / target)) : 0
  const count = useCountUp(netWorth, reduce)

  const [has3d, setHas3d] = useState(false)
  const [inView, setInView] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  // Probe for the self-hosted model; only then attempt the WebGL scene.
  useEffect(() => {
    let alive = true
    fetch('/models/cayman.glb', { method: 'HEAD' }).then(r => { if (alive) setHas3d(r.ok) }).catch(() => {})
    return () => { alive = false }
  }, [])

  // Pause the render loop when off-screen.
  useEffect(() => {
    if (!wrap.current) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.1 })
    io.observe(wrap.current)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={wrap} className="card rounded-sm p-4 overflow-hidden">
      <div className="flex items-end justify-between mb-2">
        <div>
          <span className="card-label">DREAM CAR</span>
          <p className="mono text-sm text-white">{label}</p>
        </div>
        <div className="text-right">
          <p className="mono text-xl font-light text-white">{usd(count)} <span className="card-label">/ {usd(target)}</span></p>
          <span className="mono text-xs" style={{ color: 'var(--jarvis)' }}>{(pct * 100).toFixed(1)}%</span>
        </div>
      </div>

      <div className="h-[180px] w-full">
        {has3d && inView && !reduce ? <CaymanScene progress={pct} /> : <SvgCar progress={pct} />}
      </div>

      {/* progress rail */}
      <div className="mt-2 h-2 bg-[oklch(0.1_0_0)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct * 100}%`,
            background: 'linear-gradient(90deg, var(--jarvis-deep), var(--jarvis-bright))',
            boxShadow: '0 0 10px var(--jarvis)',
            transition: reduce ? undefined : 'width 900ms cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </div>
      <p className="card-label text-center text-[oklch(0.4_0_0)] mt-1">{usd(Math.max(0, target - netWorth))} to go</p>
    </div>
  )
}
