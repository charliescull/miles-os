'use client'

import { useEffect, useState } from 'react'
import BrainStage from '@/components/three/BrainStage'
import { config } from '@/lib/config'

/**
 * HOME's organ, wired to real activity: liveliness rises with habits done
 * and open-task pressure, so the brain literally fires harder on busy days.
 */
export default function HomeBrain({ className = '' }: { className?: string }) {
  const [liveliness, setLiveliness] = useState(0.4)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      fetch('/api/habits').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()),
    ]).then(([habits, tasks]) => {
      if (cancelled) return
      let v = 0.3
      if (habits.status === 'fulfilled' && Array.isArray(habits.value?.done)) {
        v += 0.4 * (habits.value.done.length / Math.max(1, config.habits.length))
      }
      if (tasks.status === 'fulfilled') {
        const list = Array.isArray(tasks.value) ? tasks.value : tasks.value?.tasks ?? []
        v += Math.min(0.3, list.length * 0.025)
      }
      setLiveliness(Math.min(1, v))
    })
    return () => { cancelled = true }
  }, [])

  return <BrainStage liveliness={liveliness} className={className} />
}
