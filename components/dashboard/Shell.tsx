import { ReactNode } from 'react'
import TopRail from './TopRail'

interface ShellProps {
  children: ReactNode
}

export default function Shell({ children }: ShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[oklch(0.08_0_0)]">
      <TopRail />
      <main className="flex-1 min-h-0">
        {children}
      </main>
    </div>
  )
}
