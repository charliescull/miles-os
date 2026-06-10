'use client'

import { useEffect, useRef, useState } from 'react'
import { beatPhase, ekgValue } from './rhythm'
import { useReducedMotion } from '@/components/hud'

/**
 * Running EKG trace — a scrolling PQRST waveform locked to the same `rhythm`
 * clock as the 3D heart, so the R-spike fires on the beat. One bright head dot,
 * a dim fading tail. Crisp SVG (no bloom blur on the line itself).
 */
export default function EkgLine({
  bpm = 64,
  width = 520,
  height = 60,
  className = '',
}: {
  bpm?: number
  width?: number
  height?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const SAMPLES = 240
  const bufRef = useRef<number[]>(new Array(SAMPLES).fill(0))
  const [, force] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (reduced) {
      // draw one static representative beat, no animation
      const buf = bufRef.current
      for (let i = 0; i < SAMPLES; i++) buf[i] = ekgValue((i / SAMPLES) % 1)
      force(n => n + 1)
      return
    }
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      // advance the buffer at a fixed sample rate proportional to elapsed time
      const dt = (now - last) / 1000
      last = now
      const period = 60 / bpm
      const samplesPerSec = SAMPLES / (period * 2.4) // ~2.4 beats across the window
      const steps = Math.max(1, Math.round(dt * samplesPerSec))
      const buf = bufRef.current
      const t = now / 1000
      for (let s = 0; s < steps; s++) {
        buf.shift()
        buf.push(ekgValue(beatPhase(t + (s / samplesPerSec), bpm)))
      }
      force(n => (n + 1) % 1000000)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [bpm, reduced])

  const buf = bufRef.current
  const mid = height * 0.5
  const amp = height * 0.42
  const pts = buf
    .map((v, i) => `${(i / (SAMPLES - 1)) * width},${mid - v * amp}`)
    .join(' ')
  const headY = mid - buf[SAMPLES - 1] * amp

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ekg-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="oklch(0.78 0.17 150)" stopOpacity="0" />
          <stop offset="70%" stopColor="oklch(0.78 0.17 150)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="oklch(0.78 0.17 150)" stopOpacity="1" />
        </linearGradient>
      </defs>
      <polyline
        points={pts}
        fill="none"
        stroke="url(#ekg-fade)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={width} cy={headY} r="2.4" fill="oklch(0.85 0.17 150)" style={{ filter: 'drop-shadow(0 0 4px oklch(0.78 0.17 150))' }} />
    </svg>
  )
}
