'use client'

import { useEffect, useRef, useState } from 'react'
import { seededRandom } from './seed'
import { useReducedMotion } from './useReducedMotion'

const DIGIT_H = 1 // em — each digit cell is exactly 1em tall
const STRIP = '0123456789'.repeat(3) // three bands so digits roll through ~20 glyphs

/**
 * Rolling odometer numeral. Pass a formatted string ("$128,440" / "2,180 KCAL");
 * digits roll and settle left-to-right, punctuation stays fixed.
 * Reduced motion: renders the final value immediately.
 */
export default function Odometer({
  value,
  className = '',
  settleMs = 900,
  staggerMs = 70,
  play = true,
}: {
  value: string
  className?: string
  settleMs?: number
  staggerMs?: number
  play?: boolean
}) {
  const reduced = useReducedMotion()
  const [armed, setArmed] = useState(false) // false = parked at random offsets
  const seedRef = useRef(`odo:${value}`)

  useEffect(() => {
    if (!play || reduced) { setArmed(true); return }
    // Two RAFs so the parked (random) position paints before the transition runs.
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setArmed(true)) })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [play, reduced])

  const rnd = seededRandom(seedRef.current)
  const chars = value.split('')
  let digitIndex = 0

  return (
    <span className={`mono inline-flex overflow-hidden leading-none ${className}`} style={{ height: '1em' }} aria-label={value}>
      {chars.map((ch, i) => {
        if (!/\d/.test(ch)) {
          return <span key={i} aria-hidden>{ch}</span>
        }
        const d = parseInt(ch, 10)
        const start = Math.floor(rnd() * 10) // band 0: random parked digit
        const target = 20 + d               // band 2: settle position
        const delay = digitIndex * staggerMs
        digitIndex++
        const pos = reduced || !play ? target : armed ? target : start
        return (
          <span key={i} aria-hidden className="inline-block" style={{ height: '1em' }}>
            <span
              className="block"
              style={{
                transform: `translateY(${-pos * DIGIT_H}em)`,
                transition: armed && !reduced ? `transform ${settleMs}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms` : 'none',
              }}
            >
              {STRIP.split('').map((g, k) => (
                <span key={k} className="block text-center" style={{ height: '1em' }}>{g}</span>
              ))}
            </span>
          </span>
        )
      })}
    </span>
  )
}
