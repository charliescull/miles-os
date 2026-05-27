'use client'

import { useEffect, useState } from 'react'
import Panel from './Panel'

interface Blocker {
  id: string
  title: string
  owner: string
  stuck_days: number
  temperature: 'HOT' | 'WARM' | 'COOL'
}

const TEMP_STYLES = {
  HOT: 'badge-hot',
  WARM: 'badge-warm',
  COOL: 'badge-cool',
}

export default function KeyBlockersCard() {
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/blockers')
      .then(r => r.ok ? r.json() : [])
      .then(setBlockers)
      .catch(() => setBlockers([]))
      .finally(() => setLoading(false))
  }, [])

  const visible = blockers.slice(0, 5)
  const extra = blockers.length - 5

  return (
    <Panel
      id="06"
      label="KEY BLOCKERS"
      badge={
        <span className="mono text-[10px] text-[oklch(0.65_0.22_25)]">
          {blockers.length} ACTIVE
        </span>
      }
      action={
        <a href="/crm?filter=blockers" className="card-label hover:text-white transition-colors">
          VIEW ALL
        </a>
      }
      noPadding
      className="min-h-0"
    >
      {loading ? (
        <div className="p-3 space-y-2 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-[oklch(0.15_0_0)] rounded" />
          ))}
        </div>
      ) : blockers.length === 0 ? (
        <div className="p-3">
          <p className="text-[oklch(0.40_0_0)] text-xs">No active blockers</p>
        </div>
      ) : (
        <div>
          {visible.map((b, i) => (
            <div
              key={b.id}
              className={`
                px-3 py-2 flex items-center justify-between gap-2
                ${i < visible.length - 1 ? 'border-b border-[oklch(1_0_0/0.04)]' : ''}
                hover:bg-[oklch(1_0_0/0.02)] transition-colors
              `}
            >
              <div className="min-w-0">
                <p className="text-xs text-white truncate">{b.title}</p>
                <p className="card-label mt-0.5">
                  OWNER {b.owner} · STUCK {b.stuck_days}d
                </p>
              </div>
              <span className={`mono text-[9px] font-bold px-1.5 py-0.5 rounded-sm flex-shrink-0 ${TEMP_STYLES[b.temperature]}`}>
                {b.temperature}
              </span>
            </div>
          ))}
          {extra > 0 && (
            <div className="px-3 py-2 border-t border-[oklch(1_0_0/0.04)]">
              <a href="/crm?filter=blockers" className="card-label hover:text-white transition-colors">
                + {extra} MORE · VIEW ALL
              </a>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
