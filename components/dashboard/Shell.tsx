import { ReactNode } from 'react'
import TopRail from './TopRail'
import SoundController from './SoundController'
import TabMorph from './TabMorph'

interface ShellProps {
  children: ReactNode
}

export default function Shell({ children }: ShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-black">
      <TopRail />
      <main className="flex-1 min-h-0">
        <TabMorph>{children}</TabMorph>
      </main>
      <SoundController />
    </div>
  )
}
