'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Diegetic tab change: not a slide. On each route the content re-keys and plays
 * a fast dissolve+settle while a single scan line sweeps through — the machine
 * re-rendering its current organ. Shared chrome (TopRail) lives outside this and
 * persists. Reduced motion: the CSS kill-switch flattens it to an instant cut.
 */
export default function TabMorph({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="tab-enter relative h-full">
      <span aria-hidden className="tab-scan" />
      {children}
    </div>
  )
}
