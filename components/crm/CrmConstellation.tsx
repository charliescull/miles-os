'use client'

import { useEffect, useState } from 'react'
import CrmStage from '@/components/three/CrmStage'

/**
 * CRM organ wrapper. Node count = people + open tasks; stale ratio approximated
 * from how many entities lack recent activity (no created_at in last 30d).
 */
export default function CrmConstellation({ className = '' }: { className?: string }) {
  const [nodeCount, setNodeCount] = useState(80)
  const [staleRatio, setStaleRatio] = useState(0.3)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      fetch('/api/entities').then(r => (r.ok ? r.json() : [])),
      fetch('/api/tasks?status=open').then(r => (r.ok ? r.json() : [])),
    ]).then(([ent, tasks]) => {
      if (cancelled) return
      const entities = ent.status === 'fulfilled' && Array.isArray(ent.value) ? ent.value : []
      const taskList = tasks.status === 'fulfilled' && Array.isArray(tasks.value) ? tasks.value : []
      const total = entities.length + taskList.length
      if (total > 0) setNodeCount(Math.min(220, Math.max(24, total * 2)))
      const cutoff = Date.now() - 30 * 86400000
      const stale = entities.filter((e: { created_at?: string }) => e.created_at && new Date(e.created_at).getTime() < cutoff).length
      if (entities.length) setStaleRatio(Math.min(0.7, stale / entities.length))
    })
    return () => { cancelled = true }
  }, [])

  return <CrmStage nodeCount={nodeCount} staleRatio={staleRatio} className={className} />
}
