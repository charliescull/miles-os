'use client'

import { useEffect, useState } from 'react'
import HeartStage from '@/components/three/HeartStage'
import { setAmbientHeartbeatBpm } from '@/lib/sound'

/**
 * HEALTH organ wrapper. Resting BPM eases down with training consistency
 * (fitter → lower resting HR): more active days in the last 10 → calmer beat.
 */
export default function HealthHeart({ className = '' }: { className?: string }) {
  const [bpm, setBpm] = useState(66)

  useEffect(() => {
    let cancelled = false
    fetch('/api/workouts?days=10')
      .then(r => (r.ok ? r.json() : []))
      .then((data: { date: string; workout_type: string | null }[]) => {
        if (cancelled) return
        const active = data.filter(
          d => d.workout_type && d.workout_type.toUpperCase() !== 'REST',
        ).length
        // 0 active → 72bpm, 8+ active → 56bpm
        const next = Math.round(72 - Math.min(8, active) * 2)
        setBpm(next)
        setAmbientHeartbeatBpm(next) // sync the HEALTH ambient pulse to the beat
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return <HeartStage bpm={bpm} className={className} />
}
